// Validação pública de certificados PMOC por capability token.
//
// A sequência visível nunca é usada como credencial. O token aleatório resolve
// uma única linha ativa e a resposta contém apenas os dados necessários para
// confirmar autenticidade, sem IDs internos, documento fiscal ou PDF privado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;
const MAX_BODY_BYTES = 2_048;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;

type RateEntry = { count: number; resetAt: number };
const rateHits = new Map<string, RateEntry>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function firstIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function allowRate(ip: string): boolean {
  const now = Date.now();
  const key = `ip:${ip}`;
  const current = rateHits.get(key);
  if (!current || now > current.resetAt) {
    rateHits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > RATE_MAX) return false;
  }
  if (rateHits.size > 5_000) {
    for (const [entryKey, entry] of rateHits) {
      if (now > entry.resetAt) rateHits.delete(entryKey);
    }
    if (rateHits.size > 5_000) rateHits.clear();
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!allowRate(firstIp(req))) return json({ error: "too_many_requests" }, 429);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "invalid_request" }, 400);
  }

  let token = "";
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: "invalid_request" }, 400);
    }
    const body = JSON.parse(raw) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (!TOKEN_RE.test(token)) return json({ error: "certificate_not_found" }, 404);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[validate-pmoc-certificate] configuração indisponível");
    return json({ error: "temporarily_unavailable" }, 503);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("pmoc_certificate_validations")
    .select("certificate_number,issuer_name,holder_name,source_label,issued_at,valid_until")
    .eq("validation_token", token)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[validate-pmoc-certificate] consulta falhou", { code: error.code });
    return json({ error: "temporarily_unavailable" }, 503);
  }
  if (!data) return json({ error: "certificate_not_found" }, 404);

  const number = Math.max(1, Number(data.certificate_number) || 1);
  return json({
    authentic: true,
    certificate_code: `PMOC-${String(number).padStart(6, "0")}`,
    issuer_name: data.issuer_name,
    holder_name: data.holder_name,
    source_label: data.source_label,
    issued_at: data.issued_at,
    valid_until: data.valid_until,
  });
});
