import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// ── crm-lead-webhook ─────────────────────────────────────────────────────────
// Endpoint PÚBLICO (verify_jwt=false) de captação de lead por integração externa
// (Meta Ads, RD Station, formulário do site do cliente...). A autenticação é o
// token da linha em `crm_webhooks` — e é o token, e SÓ ele, que define de qual
// empresa é o lead.
//
// ATENÇÃO (regra-lei): esta função roda com SERVICE_ROLE e portanto IGNORA RLS.
// Não existe rede de proteção embaixo: TODA consulta/escrita aqui tem que ser
// escopada por `company_id` no código. Trate cada query como se fosse a última
// defesa, porque é.
//
// Escrita: exatamente UMA (insert em `leads`) — atômica por construção, não há
// etapa parcial capaz de deixar lixo. Idempotência de reentrega: se o integrador
// mandar uma chave (`x-idempotency-key` / `event_id` / `external_id`), o id do
// lead é derivado de sha256(company_id + chave), então a reentrega bate na PK e
// devolve 200 com o lead já existente em vez de duplicar.

const MAX_PAYLOAD_BYTES = 32 * 1024; // payload de lead é pequeno; acima disso é lixo
const MAX_TITLE = 200;
const MAX_SOURCE = 100;
const MAX_TEXT = 2000; // notes/mensagem livre do integrador
const MAX_SHORT = 200; // nome, email
const MAX_PHONE = 40;
const MAX_VALUE = 1_000_000_000; // R$ 1 bi — acima disso é erro de quem envia

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mensagens PT-BR. As 4xx explicam ao INTEGRADOR o que ele precisa corrigir;
// as 5xx são genéricas (problema nosso, nunca vaza detalhe interno).
const MSG = {
  methodNotAllowed: 'Método não permitido',
  invalidJson: 'Corpo da requisição deve ser um JSON válido',
  payloadTooLarge: 'Requisição muito grande',
  tokenMissing: 'Token do webhook é obrigatório',
  tokenInvalid: 'Webhook inválido ou inativo',
  noIdentity: 'Informe ao menos um destes campos: name, phone ou email',
  stageInvalid: 'Estágio informado não existe neste funil',
  valueInvalid: 'Campo "value" deve ser um número válido',
  internal: 'Erro interno',
} as const;

const pickString = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const pickNumber = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      if (!normalized) continue;
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

// Um campo numérico presente mas impossível de interpretar é erro DE QUEM ENVIA:
// devolvemos 400 em vez de gravar o lead com valor errado em silêncio.
const hasKey = (payload: Record<string, unknown>, keys: string[]) =>
  keys.some((k) => payload[k] !== undefined && payload[k] !== null && payload[k] !== '');

const clamp = (value: string | null, max: number) =>
  value === null ? null : (value.length > max ? value.slice(0, max) : value);

// Deriva um UUID determinístico de (company_id, chave de idempotência). O
// company_id entra no hash pra que dois tenants com a mesma chave NUNCA colidam.
async function derivedLeadId(companyId: string, key: string): Promise<string> {
  const data = new TextEncoder().encode(`crm-lead-webhook:${companyId}:${key}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const json = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: MSG.methodNotAllowed }, 405);

  try {
    // ── 1. Payload ──────────────────────────────────────────────────────────
    const declaredLen = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLen) && declaredLen > MAX_PAYLOAD_BYTES) {
      return json({ error: MSG.payloadTooLarge }, 413);
    }

    const rawText = await req.text();
    if (rawText.length > MAX_PAYLOAD_BYTES) return json({ error: MSG.payloadTooLarge }, 413);

    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return json({ error: MSG.invalidJson }, 400);
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json({ error: MSG.invalidJson }, 400);
    }

    const root = body as Record<string, unknown>;
    const nested = root.lead;
    const payload =
      typeof nested === 'object' && nested !== null && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : root;

    // ── 2. Token → EMPRESA (única fonte de tenant desta requisição) ──────────
    const url = new URL(req.url);
    // Não logar o token — redigi-lo do payload antes de qualquer persistência
    const tokenFromBody = pickString(payload, ['token', 'webhook_token']);
    const token = url.searchParams.get('token') || req.headers.get('x-webhook-token') || tokenFromBody;

    if (!token) return json({ error: MSG.tokenMissing }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: webhook, error: webhookError } = await supabaseAdmin
      .from('crm_webhooks')
      // company_id é o QUE define o tenant do lead — sem ele o insert quebra
      // (leads.company_id é NOT NULL) e o escopo dos estágios some.
      .select('id, name, origin, is_active, company_id')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (webhookError) {
      console.error('[crm-lead-webhook] falha ao consultar webhook', { code: webhookError.code });
      return json({ error: MSG.internal }, 500);
    }
    if (!webhook) return json({ error: MSG.tokenInvalid }, 401);

    const companyId = webhook.company_id as string | null;
    if (!companyId) {
      // Não deve acontecer (coluna NOT NULL). Se acontecer, é problema NOSSO:
      // nunca cair pra um insert sem tenant.
      console.error('[crm-lead-webhook] webhook sem company_id', { webhookId: webhook.id });
      return json({ error: MSG.internal }, 500);
    }

    // ── 3. Campos do lead ───────────────────────────────────────────────────
    const name = clamp(pickString(payload, ['name', 'full_name', 'nome']), MAX_SHORT);
    const phone = clamp(pickString(payload, ['phone', 'phone_number', 'telefone', 'whatsapp']), MAX_PHONE);
    const email = clamp(pickString(payload, ['email']), MAX_SHORT);

    // Lead sem NENHUM dado de contato é lixo (bot com token vazado, teste mal
    // configurado). Recusar é honesto: o integrador vê o erro no log dele.
    if (!name && !phone && !email) return json({ error: MSG.noIdentity }, 400);

    const title = clamp(pickString(payload, ['title', 'titulo', 'subject']), MAX_TITLE)
      || `Lead via ${webhook.name}`;
    const details = clamp(pickString(payload, ['notes', 'observations', 'message', 'mensagem']), MAX_TEXT);
    const incomingSource = pickString(payload, ['source', 'origem']);
    const source = clamp(webhook.origin || incomingSource || 'Webhook Externo', MAX_SOURCE);

    const valueKeys = ['value', 'valor'];
    const value = pickNumber(payload, valueKeys);
    if (hasKey(payload, valueKeys) && (value === null || Math.abs(value) > MAX_VALUE)) {
      return json({ error: MSG.valueInvalid }, 400);
    }

    // ── 4. Estágio — SEMPRE escopado na empresa do token ─────────────────────
    // Service_role ignora RLS: sem o .eq('company_id') destas duas queries, um
    // lead ia parar no funil de outra empresa (por acidente na busca do padrão,
    // e de propósito na busca por stage_id do corpo).
    let stageId: string | null = null;
    const requestedStageId = pickString(payload, ['stage_id']);

    if (requestedStageId) {
      // Formato inválido nem chega ao banco (evita erro 22P02 virando 500).
      if (!UUID_RE.test(requestedStageId)) return json({ error: MSG.stageInvalid }, 400);

      const { data: requestedStage, error: stageError } = await supabaseAdmin
        .from('crm_stages')
        .select('id')
        .eq('id', requestedStageId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (stageError) {
        console.error('[crm-lead-webhook] falha ao consultar estágio', { code: stageError.code });
        return json({ error: MSG.internal }, 500);
      }

      // RECUSA (não "ignora e usa o padrão"): estágio de outra empresa, ou
      // inexistente, é erro de configuração de quem chama, e cair calado no
      // estágio padrão esconderia isso pra sempre. A mensagem é a MESMA nos dois
      // casos, de propósito: não serve de sonda pra descobrir se um id existe
      // em outro tenant.
      if (!requestedStage) return json({ error: MSG.stageInvalid }, 400);

      stageId = requestedStage.id;
    }

    if (!stageId) {
      const { data: defaultStage, error: defaultStageError } = await supabaseAdmin
        .from('crm_stages')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_won', false)
        .eq('is_lost', false)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultStageError) {
        console.error('[crm-lead-webhook] falha ao consultar estágio padrão', { code: defaultStageError.code });
        return json({ error: MSG.internal }, 500);
      }

      // Empresa sem funil configurado: o lead entra sem estágio (coluna é
      // nullable) em vez de ser perdido.
      stageId = defaultStage?.id ?? null;
    }

    // ── 5. Insert (única escrita) ───────────────────────────────────────────
    // Persistir apenas campos mapeados — nunca payload bruto nem token
    const notes = [
      details,
      name ? `Nome: ${name}` : null,
      phone ? `Telefone: ${phone}` : null,
      email ? `Email: ${email}` : null,
      `Origem: ${webhook.name}`,
    ]
      .filter(Boolean)
      .join('\n');

    const idempotencyKey =
      req.headers.get('x-idempotency-key')?.trim() ||
      pickString(payload, ['event_id', 'external_id', 'idempotency_key']);

    const leadRow: Record<string, unknown> = {
      company_id: companyId,
      title,
      source,
      stage_id: stageId,
      status: 'lead',
      notes,
      value: value ?? null,
    };
    if (idempotencyKey) {
      leadRow.id = await derivedLeadId(companyId, clamp(idempotencyKey, MAX_SHORT)!);
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .insert(leadRow)
      .select('id, title, source, stage_id')
      .single();

    if (leadError) {
      // 23505 = reentrega do mesmo evento (id derivado da chave de idempotência).
      // Devolve o lead que já existe, escopado na empresa do token.
      if (leadError.code === '23505' && idempotencyKey) {
        const { data: existing } = await supabaseAdmin
          .from('leads')
          .select('id, title, source, stage_id')
          .eq('id', leadRow.id as string)
          .eq('company_id', companyId)
          .maybeSingle();

        if (existing) return json({ success: true, duplicate: true, lead: existing }, 200);
      }

      console.error('[crm-lead-webhook] falha ao gravar lead', { code: leadError.code });
      return json({ error: MSG.internal }, 500);
    }

    return json({ success: true, lead }, 200);
  } catch (error) {
    console.error('[crm-lead-webhook] erro inesperado:', error instanceof Error ? error.message : 'unknown');
    return json({ error: MSG.internal }, 500);
  }
});
