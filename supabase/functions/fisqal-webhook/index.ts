// =============================================================================
// fisqal-webhook (Fase 2.3) — recepção assíncrona de eventos da Fisqal.
// =============================================================================
// SEM JWT de usuário (verify_jwt=false). Segurança = HMAC-SHA256 do corpo cru.
//
// ⚠️ TODO (confirmar com suporte Fisqal antes de confiar — doc §11 não detalha):
//   (a) NOME EXATO do header de assinatura. Default aqui: `x-fisqal-signature`
//       (configurável via env FISQAL_WEBHOOK_SIGNATURE_HEADER).
//   (b) STRING EXATA assinada. Assumido aqui: o RAW body. Pode ser
//       `id`+`created_at`, ou prefixos tipo `sha256=`. Reconferir.
//   (c) Política de retry (nº tentativas / backoff).
// Até confirmar, o MVP roda em POLLING (fisqal-nfse-status); este webhook é
// best-effort e fica plugado mas não é o caminho crítico.
//
// Fluxo:
//   - Lê o corpo cru (texto) ANTES de parsear (HMAC é sobre o raw).
//   - Verifica HMAC-SHA256 com FISQAL_WEBHOOK_SECRET (timing-safe). 401 se falhar.
//   - Resolve a emissão por fisqal_fiscal_request_id OU fisqal_dps_id.
//   - Atualiza nfse_emissions + insere nfse_events.
//   - Idempotente por (nfse_emission_id, event_type) — não reprocessa o mesmo evento.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-fisqal-signature",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Compara dois ArrayBuffers em tempo constante (anti timing-attack). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^sha256=/i, "").trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** Mapeia o `event` da Fisqal (§11) para o status local do documento. */
function statusForEvent(event: string, dataStatus: string | undefined): string {
  if (dataStatus) return dataStatus;
  switch (event) {
    case "nfse.authorized":
      return "authorized";
    case "nfse.rejected":
      return "rejected";
    case "nfse.cancelled":
      return "cancelled";
    case "nfse.processing":
      return "processing";
    default:
      return "processing";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // ---- 1. Lê o corpo CRU (HMAC é sobre o raw body).
  const rawBody = await req.text();

  // ---- 2. Verificação HMAC-SHA256.
  const secret = Deno.env.get("FISQAL_WEBHOOK_SECRET");
  if (!secret || !secret.trim()) {
    console.error("[fisqal-webhook] FISQAL_WEBHOOK_SECRET ausente — rejeitando.");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const headerName = (Deno.env.get("FISQAL_WEBHOOK_SIGNATURE_HEADER") || "x-fisqal-signature")
    .toLowerCase();
  const provided = req.headers.get(headerName);
  if (!provided) {
    console.error("[fisqal-webhook] header de assinatura ausente:", headerName);
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // TODO: confirmar se a string assinada é o RAW body ou outra composição (§11).
  const expected = await hmacSha256(secret, rawBody);
  const providedBytes = hexToBytes(provided);
  if (providedBytes.length === 0 || !timingSafeEqual(expected, providedBytes)) {
    console.error("[fisqal-webhook] assinatura HMAC inválida.");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // ---- 3. Parse do payload (§11).
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const event = String(payload?.event ?? "");
  const data = payload?.data ?? {};
  const documentId = String(data?.document_id ?? "").trim();
  // §11 entrega `data.document_id`; pode casar com dps_id ou fiscal_request_id.
  const fiscalRequestId = String(payload?.fiscal_request_id ?? data?.fiscal_request_id ?? "")
    .trim();

  if (!event || (!documentId && !fiscalRequestId)) {
    return jsonResponse({ error: "missing_reference" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- 4. Resolve a emissão por fiscal_request_id OU dps_id.
  let emission: Record<string, any> | null = null;
  if (fiscalRequestId) {
    const { data: r } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("fisqal_fiscal_request_id", fiscalRequestId)
      .maybeSingle();
    emission = r ?? null;
  }
  if (!emission && documentId) {
    const { data: r } = await supabase
      .from("nfse_emissions")
      .select("*")
      .or(`fisqal_dps_id.eq.${documentId},fisqal_fiscal_request_id.eq.${documentId}`)
      .maybeSingle();
    emission = r ?? null;
  }

  if (!emission) {
    // 200 pra não gerar retry infinito de um documento que não conhecemos.
    console.warn("[fisqal-webhook] emissão não encontrada", { event, documentId, fiscalRequestId });
    return jsonResponse({ ok: true, ignored: "emission_not_found" }, 200);
  }

  const companyId = emission.company_id;
  const newStatus = statusForEvent(event, String(data?.status ?? "") || undefined);

  // ---- 5. Idempotência por (nfse_emission_id, event_type).
  const { data: dup } = await supabase
    .from("nfse_events")
    .select("id")
    .eq("nfse_emission_id", emission.id)
    .eq("event_type", event)
    .maybeSingle();
  if (dup) {
    return jsonResponse({ ok: true, idempotent: true }, 200);
  }

  // ---- 6. Atualiza a emissão.
  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "authorized") {
    const chave = String(data?.chave_acesso ?? "").trim();
    const protocolo = String(data?.protocolo ?? "").trim();
    if (chave) update.chave_acesso = chave;
    if (protocolo) update.protocolo = protocolo;
    update.emitida_em = String(data?.emitida_em ?? "").trim() || new Date().toISOString();
  }
  if (newStatus === "rejected" || newStatus === "failed") {
    update.error_message = String(data?.message ?? data?.motivo ?? "").trim() ||
      "A nota foi rejeitada pela prefeitura/SEFIN.";
  }

  const { error: updErr } = await supabase
    .from("nfse_emissions")
    .update(update)
    .eq("id", emission.id)
    .eq("company_id", companyId);
  if (updErr) {
    console.error("[fisqal-webhook] update error", { message: updErr.message });
    return jsonResponse({ error: "persist_failed" }, 500);
  }

  // ---- 7. Registra o evento (company_id carimbado — RLS).
  await supabase.from("nfse_events").insert({
    nfse_emission_id: emission.id,
    company_id: companyId,
    event_type: event,
    status: newStatus,
    payload,
  });

  return jsonResponse({ ok: true }, 200);
});
