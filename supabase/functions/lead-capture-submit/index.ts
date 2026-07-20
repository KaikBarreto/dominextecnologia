import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// ── lead-capture-submit ───────────────────────────────────────────────────────
// Fronteira anti-abuso do "Formulário público de captação de cliente".
// Endpoint ANÔNIMO (sem Authorization de usuário — só a apikey anon do gateway).
// Roda com service_role EM MEMÓRIA (nunca em disco/log) e delega TODA a lógica de
// negócio (resolver company_id pelo short_code, validar required/formato/whitelist,
// inserir em customers com origin='public_form', rate-limit por ip_hash, incrementar
// submission_count) para a RPC service-role-only:
//   public.submit_lead_capture_form(p_short_code, p_fields, p_consent, p_ip_hash)
// A RPC retorna { success: true } (neutro) ou dá RAISE EXCEPTION com mensagem
// genérica PT-BR. A edge só: lê IP real → hash SHA-256 (LGPD, nunca o IP cru),
// trata honeypot (descarte silencioso), valida lixo óbvio, e mapeia o erro da RPC
// pra status HTTP (429 em rate-limit, 400 no resto). NUNCA vaza stack/tenant.

// Teto do payload total (~8KB). Formulário de captação é pequeno; acima disso é lixo.
const MAX_PAYLOAD_BYTES = 8 * 1024;

// Mensagens genéricas PT-BR emitidas PELA EDGE (as de negócio vêm da RPC).
const MSG = {
  methodNotAllowed: 'Método não permitido',
  invalidJson: 'Requisição inválida',
  payloadTooLarge: 'Requisição muito grande',
  invalidInput: 'Formulário indisponível',
  internal: 'Formulário indisponível',
} as const;

const jsonResponse = (
  req: Request,
  body: Record<string, unknown>,
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });

// SHA-256 hex do IP (opcionalmente com salt de env LEAD_CAPTURE_IP_SALT). O hash é
// o ÚNICO derivado do IP que sai daqui: o IP cru nunca é logado nem repassado à RPC
// (LGPD). O salt (se existir) impede tabela rainbow trivial de IPs. Mesmo IP →
// mesmo hash (o rate-limit da RPC agrupa por ip_hash), então o salt é estável.
async function hashIp(ip: string): Promise<string | null> {
  if (!ip || ip === 'unknown') return null;
  const salt = Deno.env.get('LEAD_CAPTURE_IP_SALT') ?? '';
  const data = new TextEncoder().encode(salt + ip);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// IP real do cliente: 1º IP do x-forwarded-for (o mais à esquerda é o cliente
// original na cadeia de proxies), com fallback pra cf-connecting-ip / x-real-ip.
function readClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: MSG.methodNotAllowed }, 405);
  }

  try {
    // Cap de payload ANTES de parsear (defesa barata contra corpo gigante).
    // Confia no Content-Length quando presente; o parse abaixo re-checa o tamanho
    // real (um cliente pode mentir o header).
    const declaredLen = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLen) && declaredLen > MAX_PAYLOAD_BYTES) {
      return jsonResponse(req, { error: MSG.payloadTooLarge }, 413);
    }

    const rawText = await req.text();
    if (rawText.length > MAX_PAYLOAD_BYTES) {
      return jsonResponse(req, { error: MSG.payloadTooLarge }, 413);
    }

    let raw: any;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return jsonResponse(req, { error: MSG.invalidJson }, 400);
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return jsonResponse(req, { error: MSG.invalidJson }, 400);
    }

    // ── Honeypot ────────────────────────────────────────────────────────────
    // Campo invisível preenchido só por bots. Se vier NÃO-vazio: descarta em
    // silêncio (NÃO chama a RPC, NÃO avisa o bot que foi pego) e responde 200
    // com o mesmo shape de sucesso. Bot acha que passou.
    if (typeof raw.honeypot === 'string' && raw.honeypot.trim() !== '') {
      return jsonResponse(req, { success: true }, 200);
    }

    // ── Validação leve de entrada (só lixo óbvio; a RPC faz a de negócio) ─────
    const short_code = typeof raw.short_code === 'string' ? raw.short_code.trim() : '';
    const fields = raw.fields;
    const consent = raw.consent;

    if (!short_code) {
      return jsonResponse(req, { error: MSG.invalidInput }, 400);
    }
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      return jsonResponse(req, { error: MSG.invalidInput }, 400);
    }
    if (typeof consent !== 'boolean') {
      return jsonResponse(req, { error: MSG.invalidInput }, 400);
    }

    // IP real → hash (LGPD: o IP cru morre aqui, nunca é logado nem repassado).
    const clientIp = readClientIp(req);
    const ipHash = await hashIp(clientIp);

    // service_role SÓ em memória (env), nunca em disco/log.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await supabaseAdmin.rpc('submit_lead_capture_form', {
      p_short_code: short_code,
      p_fields: fields,
      p_consent: consent,
      p_ip_hash: ipHash,
    });

    if (error) {
      // A RPC dá RAISE EXCEPTION com mensagem GENÉRICA PT-BR já pronta pro usuário
      // (ex: "Formulário indisponível", "CNPJ inválido", "Muitas tentativas...").
      // Repassamos essa mensagem; se por algum motivo vier vazia, caímos no
      // genérico. Rate-limit → 429; demais erros de negócio/validação → 400.
      const rpcMessage = (error.message ?? '').trim();
      const isRateLimit = rpcMessage.toLowerCase().includes('muitas tentativas');
      const status = isRateLimit ? 429 : 400;
      // Log SEM IP cru, SEM stack, SEM tenant — só o marcador do evento.
      console.error('[lead-capture-submit] RPC rejeitou o envio', {
        status,
        rateLimited: isRateLimit,
      });
      return jsonResponse(
        req,
        { error: rpcMessage || MSG.invalidInput },
        status,
      );
    }

    // Retorno neutro da RPC ({ success: true }). Normalizamos pra garantir o shape
    // fixo do contrato, independente do que a RPC devolveu.
    const success = (data && typeof data === 'object' && (data as any).success === true) || true;
    return jsonResponse(req, { success }, 200);
  } catch (err) {
    // Detalhe técnico só no log (sem IP cru, sem service_role); ao cliente vai a
    // mensagem genérica PT-BR.
    console.error(
      '[lead-capture-submit] Erro interno:',
      err instanceof Error ? err.message : 'unknown',
    );
    return jsonResponse(req, { error: MSG.internal }, 500);
  }
});
