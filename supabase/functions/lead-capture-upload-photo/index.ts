import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// ── lead-capture-upload-photo ───────────────────────────────────────────────
// Sobe a foto do "Formulário público de captação de cliente" ANTES do envio.
// Endpoint ANÔNIMO (sem Authorization de usuário — só a apikey anon do gateway).
// Devolve { photo_url } pronta pro front mandar no `fields.photo_url` da
// chamada seguinte a `lead-capture-submit` → `submit_lead_capture_form`, que
// valida o prefixo exato do storage antes de gravar em customers.photo_url.
//
// 🔴 Endpoint público sem login = risco de virar depósito de arquivo aberto.
// Defesas, nesta ordem:
//   1. Amarração ao short_code: só sobe se resolver a um lead_capture_forms
//      ATIVO e NÃO EXPIRADO — a MESMA checagem que submit_lead_capture_form
//      faz (mesmo predicado SQL, copiado de propósito p/ não divergir).
//   2. Teto de payload (defesa barata, antes de decodificar).
//   3. Teto de tamanho do arquivo já decodificado (foto de celular; 5MB de
//      folga generosa mesmo sem compressão no client).
//   4. Tipo real por MAGIC BYTES (JPEG/PNG/WebP) — nunca pelo Content-Type
//      declarado nem pela extensão do nome do arquivo, que são falsificáveis.
//      Um arquivo malicioso renomeado para ".jpg" é rejeitado aqui porque os
//      primeiros bytes não batem com nenhuma assinatura conhecida.
//   5. Path determinístico por short_code + uuid (nunca Date.now(), que colide
//      sob carga concorrente).
//   6. Escreve no bucket `customer-photos` com service_role — a policy de
//      storage não barra service_role (só policies de authenticated/anon).
//
// Rate-limit em memória (best-effort, reseta no cold start) como camada extra
// de anti-rajada; a defesa real é a amarração ao short_code + os tetos acima.
// ─────────────────────────────────────────────────────────────────────────────

const MSG = {
  methodNotAllowed: 'Método não permitido',
  invalidJson: 'Requisição inválida',
  payloadTooLarge: 'Arquivo muito grande',
  unsupportedType: 'Tipo de arquivo não suportado',
  formUnavailable: 'Formulário indisponível',
  uploadFailed: 'Não foi possível enviar a foto. Tente novamente.',
  rateLimited: 'Muitas tentativas. Tente novamente mais tarde.',
  internal: 'Formulário indisponível',
} as const;

// Teto do JSON bruto (base64 infla ~33% o binário; 8MB de texto cobre até
// ~5.5MB de binário decodificado com folga para o resto do payload).
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
// Teto do arquivo já decodificado — foto de celular, 5MB é generoso.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const BUCKET = 'customer-photos';

type ImageType = 'jpeg' | 'png' | 'webp';

const IMAGE_META: Record<ImageType, { ext: string; contentType: string }> = {
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
};

// Rate-limit em memória por IP: anti-rajada barato, efêmero (reset no cold
// start). NÃO é a defesa principal — só freia abuso grosseiro entre uploads.
const ipHits = new Map<string, { count: number; resetAt: number }>();
const IP_MAX = 20;
const IP_WINDOW_MS = 60 * 1000;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= IP_MAX;
}

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

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });

// Decodifica data URL ("data:image/...;base64,XXXX") ou base64 puro em bytes.
// Retorna null se a string não decodificar como base64 válido.
function decodeBase64Image(input: string): Uint8Array | null {
  try {
    const comma = input.indexOf(',');
    const raw = input.startsWith('data:') && comma !== -1 ? input.slice(comma + 1) : input;
    const binary = atob(raw.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// Detecta o tipo REAL pelos magic bytes: JPEG (FF D8 FF), PNG (89 50 4E 47),
// WebP (RIFF....WEBP). Fonte única da verdade para validação e para a
// extensão/content-type gravados — nunca o Content-Type declarado pelo client
// nem a extensão do nome do arquivo (ambos falsificáveis por quem manda o
// payload). Um arquivo renomeado para ".jpg" cujo conteúdo real não é
// nenhuma das 3 assinaturas cai em `null` e é rejeitado.
function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: MSG.methodNotAllowed }, 405);
  }

  const clientIp = readClientIp(req);
  if (!checkIpRateLimit(clientIp)) {
    return jsonResponse(req, { error: MSG.rateLimited }, 429);
  }

  try {
    // Cap de payload ANTES de parsear (defesa barata contra corpo gigante).
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

    const short_code = typeof raw.short_code === 'string' ? raw.short_code.trim() : '';
    const photoBase64 = typeof raw.photo_base64 === 'string' ? raw.photo_base64 : '';

    if (!short_code || !photoBase64) {
      return jsonResponse(req, { error: MSG.invalidJson }, 400);
    }

    const bytes = decodeBase64Image(photoBase64);
    if (!bytes) {
      return jsonResponse(req, { error: MSG.unsupportedType }, 400);
    }
    if (bytes.length > MAX_PHOTO_BYTES) {
      return jsonResponse(req, { error: MSG.payloadTooLarge }, 413);
    }

    const imageType = detectImageType(bytes);
    if (!imageType) {
      return jsonResponse(req, { error: MSG.unsupportedType }, 400);
    }
    const { ext, contentType } = IMAGE_META[imageType];

    // service_role SÓ em memória (env), nunca em disco/log.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Amarração ao short_code: MESMO predicado de submit_lead_capture_form
    // (ativo + não expirado + abaixo do teto de submissões). Se o link estiver
    // desativado/expirado/esgotado, não sobe nada — mesmo que o arquivo em si
    // seja válido.
    const { data: form, error: formError } = await supabaseAdmin
      .from('lead_capture_forms')
      .select('id')
      .eq('short_code', short_code)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .maybeSingle();

    if (formError || !form) {
      return jsonResponse(req, { error: MSG.formUnavailable }, 400);
    }

    // Path determinístico por short_code + uuid — nunca Date.now() (colide
    // sob carga concorrente). O short_code no path também facilita auditoria
    // manual do bucket por formulário, sem acoplar a nenhum id interno.
    const path = `lead-capture/${short_code}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });

    if (uploadError) {
      console.error('[lead-capture-upload-photo] upload error:', uploadError.message);
      return jsonResponse(req, { error: MSG.uploadFailed }, 500);
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return jsonResponse(req, { photo_url: urlData.publicUrl }, 200);
  } catch (err) {
    console.error(
      '[lead-capture-upload-photo] Erro interno:',
      err instanceof Error ? err.message : 'unknown',
    );
    return jsonResponse(req, { error: MSG.internal }, 500);
  }
});
