import { authorizeFiscalManager, corsHeaders, jsonResponse } from '../_shared/fiscal-auth.ts';

const integer = (value: unknown, fallback: number) => {
  const result = Number(value); return Number.isInteger(result) ? result : fallback;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed', message: 'Método não permitido.' }, 405);
  const auth = await authorizeFiscalManager(req); if (!auth.ok) return auth.response;
  try {
    const actor = await auth.supabase.from('profiles').select('is_active').eq('user_id', auth.userId).eq('company_id', auth.companyId).maybeSingle();
    if (actor.error || actor.data?.is_active !== true) return jsonResponse({error:'forbidden',message:'Seu acesso administrativo não está disponível.'},403);
    const entitlement = await auth.supabase.rpc('tenant_subscription_allows_access', { _company_id: auth.companyId });
    if (entitlement.error || entitlement.data !== true) return jsonResponse({ error: 'module_inactive', message: 'O acesso fiscal desta empresa não está disponível.' }, 403);
    const body = object(await req.json()); const nfe = object(body.nfe); const nfce = object(body.nfce);
    if (nfce.afterPaymentMode === 'automatic') return jsonResponse({ error: 'automatic_blocked', message: 'A emissão automática permanece bloqueada até a aprovação do canário.' }, 422);
    if (nfce.afterPaymentMode != null && !['off', 'ask'].includes(text(nfce.afterPaymentMode))) return jsonResponse({ error: 'invalid_mode', message: 'Escolha o comportamento após o pagamento.' }, 422);
    const nfeSeries = integer(nfe.series, 1); const nfceSeries = integer(nfce.series, 1); const uf = text(nfce.uf).toUpperCase();
    if (nfeSeries < 0 || nfeSeries > 889 || nfceSeries < 1 || nfceSeries > 889) return jsonResponse({ error: 'invalid_series', message: 'Revise as séries de NF-e e NFC-e.' }, 422);
    if (nfce.enabled === true && !['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(uf)) return jsonResponse({ error: 'invalid_uf', message: 'Informe a UF de credenciamento da NFC-e.' }, 422);

    // Aprovações e próximo número nunca vêm do browser. O upsert atualiza só
    // a intenção do tenant e preserva os gates administrados pelo backend.
    const [nfeResult, nfceResult] = await Promise.all([
      auth.supabase.from('company_nfe_settings').upsert({
        company_id: auth.companyId, enabled: nfe.enabled === true, series: nfeSeries,
        default_operation_nature: text(nfe.defaultOperationNature) || null,
      }, { onConflict: 'company_id' }),
      auth.supabase.from('company_nfce_settings').upsert({
        company_id: auth.companyId, enabled: nfce.enabled === true, series: nfceSeries, uf: uf || null, after_payment_mode: nfce.afterPaymentMode === 'off' ? 'off' : 'ask',
        default_operation_nature: text(nfce.defaultOperationNature).slice(0, 60) || 'VENDA A CONSUMIDOR',
        include_identified_consumer: nfce.includeIdentifiedConsumer !== false,
        open_danfce_after_authorization: nfce.openDanfceAfterAuthorization === true,
      }, { onConflict: 'company_id' }),
    ]);
    if (nfeResult.error || nfceResult.error) {
      console.error('[fiscal-goods-settings] save', { failed: true });
      return jsonResponse({ error: 'save_failed', message: 'Não foi possível salvar as configurações fiscais agora.' }, 500);
    }
    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    console.error('[fiscal-goods-settings] unexpected', { failed: true });
    return jsonResponse({ error: 'internal_error', message: 'Não foi possível salvar as configurações fiscais agora.' }, 500);
  }
});
