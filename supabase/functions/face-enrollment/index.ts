// face-enrollment — cadastro facial publico por capability de uso unico.
//
// Esta edge nunca recebe foto: o navegador extrai 3 embeddings localmente e
// envia apenas vetores de 128 numeros. O token bruto tambem nunca e persistido;
// a edge calcula SHA-256 e todas as leituras/escritas privilegiadas passam por
// RPCs service-role-only. Link invalido, usado, revogado e expirado sao
// indistinguiveis para o chamador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FACE_MODEL_VERSION,
  FACE_REQUIRED_CAPTURES,
  hasOnlyKeys,
  isPlainObject,
  isValidEnrollmentToken,
  parseFaceTemplates,
} from "../_shared/face-biometrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 96 * 1024;
const IP_WINDOW_MS = 60 * 1000;
const IP_MAX = 30;
const TOKEN_MAX = 12;

type RateEntry = { count: number; resetAt: number };
const rateHits = new Map<string, RateEntry>();

class PayloadTooLargeError extends Error {}

function response(body: unknown, status = 200): Response {
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

function allowRate(key: string, max: number): boolean {
  const now = Date.now();
  const current = rateHits.get(key);
  if (!current || now > current.resetAt) {
    rateHits.set(key, { count: 1, resetAt: now + IP_WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > max) return false;
  }

  // Limita memoria em isolates que recebam muitos IPs/tokens diferentes.
  if (rateHits.size > 5_000) {
    for (const [entryKey, entry] of rateHits) {
      if (now > entry.resetAt) rateHits.delete(entryKey);
    }
    if (rateHits.size > 5_000) rateHits.clear();
  }
  return true;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readBodyWithinLimit(req: Request): Promise<string> {
  if (!req.body) return "";

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return response({ error: "method_not_allowed" }, 405);
  }

  const ip = firstIp(req);
  if (!allowRate(`ip:${ip}`, IP_MAX)) {
    return response({ error: "too_many_requests" }, 429);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return response({ error: "payload_too_large" }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithinLimit(req);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return response({ error: "payload_too_large" }, 413);
    }
    return response({ error: "invalid_request" }, 400);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  if (!isPlainObject(body) || !isValidEnrollmentToken(body.token)) {
    return response({ error: "invalid_request" }, 400);
  }

  const tokenHash = await sha256Hex(body.token);
  if (!allowRate(`token:${tokenHash}`, TOKEN_MAX)) {
    return response({ error: "too_many_requests" }, 429);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (body.action === "context") {
    if (!hasOnlyKeys(body, ["action", "token"])) {
      return response({ error: "invalid_request" }, 400);
    }

    const { data, error } = await supabase.rpc("get_face_enrollment_context", {
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("[face-enrollment] context_rpc_failed", error.code ?? "unknown");
      return response({ error: "temporarily_unavailable" }, 503);
    }
    if (!data) {
      return response({ error: "invalid_or_expired_link" }, 404);
    }
    return response(data);
  }

  if (body.action === "complete") {
    if (!hasOnlyKeys(body, ["action", "token", "model_version", "templates"])) {
      return response({ error: "invalid_request" }, 400);
    }
    if (body.model_version !== FACE_MODEL_VERSION) {
      return response({ error: "unsupported_model" }, 400);
    }

    const templates = parseFaceTemplates(body.templates);
    if (!templates) {
      return response({ error: "invalid_templates" }, 400);
    }

    const { data, error } = await supabase.rpc("complete_employee_face_enrollment", {
      p_token_hash: tokenHash,
      p_model_version: FACE_MODEL_VERSION,
      p_templates: templates,
    });
    if (error) {
      console.error("[face-enrollment] completion_rpc_failed", error.code ?? "unknown");
      const status = error.code === "22023" ? 410 : 503;
      return response({
        error: status === 410 ? "invalid_or_expired_link" : "temporarily_unavailable",
      }, status);
    }
    if (data !== FACE_REQUIRED_CAPTURES) {
      return response({ error: "temporarily_unavailable" }, 503);
    }
    return response({ success: true });
  }

  return response({ error: "invalid_request" }, 400);
});
