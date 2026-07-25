// =============================================================================
// disc-photo — Edge function PÚBLICA que serve a FOTO do funcionário para a
// tela pública do Perfil Comportamental (DISC), em /avaliacao/:token (anônima).
// =============================================================================
// O bucket `employee-photos` é PRIVADO: anon não acessa o objeto direto. Esta
// função valida o `public_short_code` da avaliação, resolve o path da foto e
// devolve um 302 redirect para uma signed URL de curta duração. Assim o front
// consegue usar simplesmente <img src="<...>/disc-photo?code=<code>" />.
//
// Regras:
//   1. Só serve foto de um `code` VÁLIDO (existe em disc_assessments). Isso
//      impede uso como proxy aberto de storage.
//   2. Roda como service_role (SUPABASE_SERVICE_ROLE_KEY do ENV, nunca em disco,
//      nunca logado).
//   3. 404 discreto em qualquer falha (sem vazar detalhe). A página cai no
//      fallback de iniciais quando não há foto.
//   4. Pública (deploy --no-verify-jwt): funciona como <img> sem headers de auth.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "employee-photos";
const SIGNED_URL_TTL = 3600; // 1h

// Código curto dos links amigáveis: base32 sem ambíguos, 12 chars.
const SHORT_CODE_REGEX = /^[a-hj-np-z2-9]{12}$/;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
    "Vary": "Origin",
  };
}

function notFound(req: Request): Response {
  return new Response("Not found", {
    status: 404,
    headers: { ...corsHeaders(req), "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Resolve o path do objeto DENTRO do bucket employee-photos a partir do valor
 * bruto de employees.photo_url. Trata os dois formatos:
 *   - URL completa: .../storage/v1/object/(public|sign|authenticated)?/employee-photos/<path>
 *   - path relativo já dentro do bucket: "photos/xxx.jpg" (com ou sem "/" inicial).
 * Retorna null se não conseguir extrair um path plausível.
 */
function resolveObjectPath(photoUrl: string): string | null {
  if (!photoUrl) return null;
  let raw = photoUrl.trim();
  if (!raw) return null;

  const marker = `/${BUCKET}/`;
  const idx = raw.indexOf(marker);
  if (idx !== -1) {
    // URL completa (ou path que já embute o nome do bucket) → pega o que vem depois.
    raw = raw.slice(idx + marker.length);
  } else if (raw.startsWith(`${BUCKET}/`)) {
    // path começa com o próprio nome do bucket.
    raw = raw.slice(BUCKET.length + 1);
  }

  // Normaliza: remove barra inicial e querystring (ex: ?token=... de signed URL antiga).
  raw = raw.replace(/^\/+/, "").split("?")[0];

  if (!raw) return null;
  return raw;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return notFound(req);
  }

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();

  // Valida formato ANTES de tocar o banco.
  if (!SHORT_CODE_REGEX.test(code)) {
    return notFound(req);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    // Config ausente — não vaza detalhe.
    return notFound(req);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Valida o code: precisa existir uma avaliação com esse public_short_code.
    const { data: assessment, error: aErr } = await supabase
      .from("disc_assessments")
      .select("employee_id")
      .eq("public_short_code", code)
      .maybeSingle();

    if (aErr || !assessment || !assessment.employee_id) {
      return notFound(req);
    }

    // 2. Pega a foto do funcionário.
    const { data: employee, error: eErr } = await supabase
      .from("employees")
      .select("photo_url")
      .eq("id", assessment.employee_id)
      .maybeSingle();

    if (eErr || !employee || !employee.photo_url) {
      return notFound(req);
    }

    // 3. Resolve o path do objeto dentro do bucket.
    const objectPath = resolveObjectPath(employee.photo_url);
    if (!objectPath) {
      return notFound(req);
    }

    // 4. Cria signed URL (bucket é privado).
    const { data: signed, error: sErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL);

    if (sErr || !signed?.signedUrl) {
      return notFound(req);
    }

    // 5. Redireciona (302) pra signed URL. Cache leve — a signed URL vive 1h.
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders(req),
        Location: signed.signedUrl,
        "Cache-Control": "public, max-age=1800",
      },
    });
  } catch (_e) {
    return notFound(req);
  }
});
