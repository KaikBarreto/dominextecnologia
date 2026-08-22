// get-tenant-payment-checkout
// ---------------------------
// PÚBLICA, sem sessão. Gate = public_short_code válido de uma tenant_charge não-cancelada.
// Retorna um payload ALLOWLIST ESTRITA pro checkout público do cliente final.
//
// SEGURANÇA (memória do time: to_jsonb(*) vaza custo/margem): montamos o objeto de
// resposta campo a campo. NUNCA expor net_value, source_id, customer_id cru,
// externalReference, chaves, nem qualquer campo interno.
//
// White-label (regra-lei): a marca do tenant só aparece se white_label_enabled;
// senão o checkout usa a marca Dominex fixa (verde padrão).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

// DOMINEX_BRAND: sem white-label → primary_color NULL para que o shell
// ative o degradê escuro sóbrio (REPORT_HEADER_DARK_GRADIENT) sem flash verde.
// Com white-label → primary_color é a cor do tenant (abaixo).
const DOMINEX_BRAND = { name: "Dominex", logo_url: null as string | null, primary_color: null as string | null };

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=15",
    },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // short_code por query (?short_code=) ou por path (/.../<short_code>) ou body.
  let shortCode = new URL(req.url).searchParams.get("short_code") ?? "";
  if (!shortCode) {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    shortCode = parts[parts.length - 1] ?? "";
    if (shortCode === "get-tenant-payment-checkout") shortCode = "";
  }
  if (!shortCode && req.method === "POST") {
    try {
      const b = await req.json();
      shortCode = (b?.short_code ?? "").toString();
    } catch { /* ignore */ }
  }
  shortCode = shortCode.trim();
  if (!shortCode) {
    return json(req, { error: "Cobrança não encontrada." }, 404);
  }
  // Guarda de formato barata (o short_code é base32 sem ambíguos, 8–16 chars).
  // Rejeita lixo cedo (não bate no banco com valores enormes/estranhos).
  if (!/^[a-z2-9]{6,24}$/.test(shortCode)) {
    return json(req, { error: "Cobrança não encontrada." }, 404);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // SELECT explícito (nunca *): só as colunas necessárias.
    const { data: charge } = await supabase
      .from("tenant_charges")
      .select(
        "company_id, value, due_date, description, status, billing_type, invoice_url, pix_copy_paste, boleto_url, public_short_code",
      )
      .eq("public_short_code", shortCode)
      .maybeSingle();

    if (!charge) {
      return json(req, { error: "Cobrança não encontrada." }, 404);
    }
    // Gate: não expõe cobrança cancelada/deletada.
    if (String(charge.status).toUpperCase() === "CANCELLED" || String(charge.status).toUpperCase() === "DELETED") {
      return json(req, { error: "Esta cobrança não está mais disponível." }, 404);
    }

    // Marca do tenant (só se white_label_enabled) — senão Dominex fixo.
    const { data: settings } = await supabase
      .from("company_settings")
      .select("name, white_label_enabled, white_label_logo_url, white_label_primary_color")
      .eq("company_id", charge.company_id)
      .maybeSingle();

    const company = settings?.white_label_enabled
      ? {
          name: settings.name ?? DOMINEX_BRAND.name,
          logo_url: settings.white_label_logo_url ?? null,
          // Tenant com white-label mas sem cor configurada → null (topo escuro Dominex).
          primary_color: settings.white_label_primary_color ?? null,
        }
      : DOMINEX_BRAND;

    // ALLOWLIST ESTRITA (montado campo a campo — nunca net_value/custo/margem/ids internos).
    return json(req, {
      company,
      charge: {
        value: charge.value,
        due_date: charge.due_date,
        description: charge.description,
        status: charge.status,
        billing_type: charge.billing_type,
        invoice_url: charge.invoice_url,
        pix_copy_paste: charge.pix_copy_paste,
        boleto_url: charge.boleto_url,
        public_short_code: charge.public_short_code,
      },
    }, 200);
  } catch (e) {
    console.error("[checkout] erro:", (e as Error).message);
    return json(req, { error: "Não foi possível carregar a cobrança agora." }, 500);
  }
});
