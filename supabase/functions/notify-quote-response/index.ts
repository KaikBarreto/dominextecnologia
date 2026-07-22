import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

/**
 * notify-quote-response — Notifica IN-APP a empresa dona de um orçamento quando
 * o CLIENTE FINAL responde (aprova/rejeita) pelo link PÚBLICO (/proposta/:token).
 *
 * CONTEXTO É ANÔNIMO: o cliente final NÃO está logado. Por isso NADA de
 * company_id/user_id/status vem do client — recebemos SÓ o `token` do quote e
 * resolvemos tudo server-side com service_role. Isso impede que um anônimo
 * dispare notificação arbitrária pra qualquer tenant (spam / vazamento
 * cross-tenant — regra-lei: white-label/tenant nunca vaza).
 *
 * Modelo de segurança:
 *  1. Recebe SÓ o token.
 *  2. Resolve o quote pelo token (service_role) e LÊ o status REAL do banco.
 *     Não confiamos em nenhum "status" informado pelo client; a fonte da verdade
 *     é a linha do quote (que a RLS pública "Public can update quote by token" já
 *     gravou antes desta chamada).
 *  3. Só notifica se o status atual for 'aprovado' ou 'rejeitado'.
 *  4. Destinatários = admins ATIVOS da empresa DONA do quote (mesma regra do
 *     last-admin guard: user_roles.role='admin' JOIN profiles ON user_id
 *     WHERE profiles.company_id = quote.company_id AND is_active <> false).
 *     Resolvidos server-side, jamais vindos do client.
 *  5. Idempotência (anti-duplicação, estilo mutex de webhook): a notificação
 *     carrega um marcador estável no action_url (`/orcamentos?quote=<id>&r=<status>`).
 *     Antes de inserir, checamos se JÁ existe notificação com esse type +
 *     action_url pra QUALQUER destinatário daquele conjunto — se existir, no-op.
 *     Assim, chamar o endpoint 2x pra mesma resposta não duplica o sino.
 *
 * best-effort no client (`ProposalPublic.respond`) — falha aqui nunca quebra a
 * UX de aprovação. CORS libera anon (apikey + x-client-info já no _shared/cors).
 */

type QuoteStatus = 'aprovado' | 'rejeitado';

const APPROVED_TYPE = 'quote_approved';
const REJECTED_TYPE = 'quote_rejected';

function fmtBRL(value: number, currency = 'BRL', locale = 'pt-BR'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value || 0);
  } catch {
    return `R$ ${(value || 0).toFixed(2)}`;
  }
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;

    if (!token || typeof token !== 'string') {
      return json({ error: 'Missing token' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Resolve o quote SÓ pelo token. Status vem do banco (fonte da verdade),
    //    nunca do client.
    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from('quotes')
      .select('id, company_id, status, quote_number, total_price, total_value, prospect_name, customer_id')
      .eq('token', token)
      .maybeSingle();

    if (quoteErr) {
      console.error('[notify-quote-response] quote lookup error:', quoteErr);
      return json({ error: 'lookup_failed' }, 500);
    }
    if (!quote) {
      // Token inválido: resposta neutra, sem vazar existência.
      return json({ ok: true, skipped: 'not_found' }, 200);
    }

    // 2) Só notifica em respostas do cliente final.
    const status = quote.status as string;
    if (status !== 'aprovado' && status !== 'rejeitado') {
      return json({ ok: true, skipped: 'status_not_response', status }, 200);
    }
    const responseStatus = status as QuoteStatus;
    const approved = responseStatus === 'aprovado';
    const notifType = approved ? APPROVED_TYPE : REJECTED_TYPE;

    // Marcador estável de idempotência + deep link interno pro sino.
    const actionUrl = `/orcamentos?quote=${quote.id}&r=${responseStatus}`;

    // 3) Destinatários: admins ATIVOS da empresa dona do quote.
    //    (mesma regra do last-admin guard — server-side, escopo por company_id)
    const { data: adminProfiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, is_active')
      .eq('company_id', quote.company_id)
      .neq('is_active', false);

    if (profErr) {
      console.error('[notify-quote-response] profiles error:', profErr);
      return json({ error: 'recipients_failed' }, 500);
    }
    const companyUserIds = (adminProfiles ?? []).map((p) => p.user_id).filter(Boolean);
    if (companyUserIds.length === 0) {
      return json({ ok: true, skipped: 'no_company_users' }, 200);
    }

    const { data: adminRoles, error: rolesErr } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .in('user_id', companyUserIds);

    if (rolesErr) {
      console.error('[notify-quote-response] roles error:', rolesErr);
      return json({ error: 'recipients_failed' }, 500);
    }
    const recipientIds = Array.from(new Set((adminRoles ?? []).map((r) => r.user_id)));
    if (recipientIds.length === 0) {
      return json({ ok: true, skipped: 'no_admins' }, 200);
    }

    // 5) Idempotência: se já existe notificação desta resposta pra algum admin
    //    do conjunto, não duplica (endpoint chamado 2x pra mesma aprovação).
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('user_notifications')
      .select('id')
      .eq('type', notifType)
      .eq('action_url', actionUrl)
      .in('user_id', recipientIds)
      .limit(1);

    if (existErr) {
      console.error('[notify-quote-response] idempotency check error:', existErr);
      return json({ error: 'idempotency_failed' }, 500);
    }
    if (existing && existing.length > 0) {
      return json({ ok: true, skipped: 'already_notified' }, 200);
    }

    // Locale/moeda da empresa (pt-br default — app tem fallback pt-br).
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('currency')
      .eq('company_id', quote.company_id)
      .maybeSingle();
    const currency = (settings?.currency as string) || 'BRL';

    const value = (quote.total_value ?? quote.total_price ?? 0) as number;
    const numero = quote.quote_number != null ? `#${quote.quote_number}` : '';
    const cliente = (quote.prospect_name as string) || 'O cliente';
    const valorFmt = fmtBRL(Number(value), currency);

    const title = approved ? 'Orçamento aprovado' : 'Orçamento recusado';
    const message = approved
      ? `${cliente} aprovou o orçamento ${numero} no valor de ${valorFmt}.`.replace('  ', ' ')
      : `${cliente} recusou o orçamento ${numero} no valor de ${valorFmt}.`.replace('  ', ' ');
    const icon = approved ? 'check-circle' : 'x-circle';

    const rows = recipientIds.map((user_id) => ({
      user_id,
      type: notifType,
      title,
      message,
      icon,
      action_url: actionUrl,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from('user_notifications')
      .insert(rows);

    if (insertErr) {
      console.error('[notify-quote-response] insert error:', insertErr);
      return json({ error: 'insert_failed' }, 500);
    }

    return json({ ok: true, notified: recipientIds.length }, 200);
  } catch (err) {
    console.error('[notify-quote-response] exception:', err);
    return json({ error: String(err) }, 500);
  }
});
