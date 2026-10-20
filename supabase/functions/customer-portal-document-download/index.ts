import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { getProvider } from "../_shared/nfse-provider.ts";
import type { NfseProviderCtx } from "../_shared/nfse-provider.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/i;
const SIGNED_URL_TTL_SECONDS = 300;

type DocumentSource = "manual" | "contract_attachment" | "dominex_nfse";

interface PortalItem {
  id?: string;
  source?: string;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(req, { error: "service_unavailable" }, 503);
  }

  let body: {
    portalToken?: string;
    sessionToken?: string | null;
    documentId?: string;
    source?: DocumentSource;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_body" }, 400);
  }

  const portalToken = clean(body.portalToken);
  const sessionToken = clean(body.sessionToken) || null;
  const documentId = clean(body.documentId);
  const source = clean(body.source) as DocumentSource;

  if (!TOKEN_RE.test(portalToken) || !UUID_RE.test(documentId)) {
    return json(req, { error: "not_found" }, 404);
  }
  if (!["manual", "contract_attachment", "dominex_nfse"].includes(source)) {
    return json(req, { error: "invalid_source" }, 400);
  }

  // Usa a identidade do chamador quando houver JWT autenticado. Em portal
  // anonimo o Authorization recebido e a chave anon; a RPC valida token/sessao.
  const authorization = req.headers.get("Authorization") ?? `Bearer ${anonKey}`;
  const portalClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rawPayload, error: portalError } = await portalClient.rpc(
    "get_portal_data",
    { p_token: portalToken, p_session_token: sessionToken },
  );
  if (portalError || !rawPayload || typeof rawPayload !== "object") {
    return json(req, { error: "not_found" }, 404);
  }

  const payload = rawPayload as Record<string, unknown>;
  if (payload.access !== "granted") {
    return json(req, { error: "not_found" }, 404);
  }

  const customer = payload.customer as Record<string, unknown> | undefined;
  const customerId = clean(customer?.id);
  const companyId = clean(customer?.company_id);
  if (!UUID_RE.test(customerId) || !UUID_RE.test(companyId)) {
    return json(req, { error: "not_found" }, 404);
  }

  const invoices = Array.isArray(payload.invoices) ? payload.invoices as PortalItem[] : [];
  const documents = Array.isArray(payload.documents) ? payload.documents as PortalItem[] : [];
  const isReleased = [...invoices, ...documents].some(
    (item) => item.id === documentId && item.source === source,
  );
  if (!isReleased) return json(req, { error: "not_found" }, 404);

  if (source === "manual") {
    const { data: document } = await service
      .from("customer_documents")
      .select("storage_path, file_name")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("is_visible_in_portal", true)
      .maybeSingle();
    if (!document) return json(req, { error: "not_found" }, 404);
    if (!document.storage_path.startsWith(`${companyId}/${customerId}/`)) {
      return json(req, { error: "not_found" }, 404);
    }

    const { data: signed, error } = await service.storage
      .from("customer-documents")
      .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: document.file_name,
      });
    if (error || !signed?.signedUrl) return json(req, { error: "download_unavailable" }, 503);
    return json(req, { url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
  }

  if (source === "contract_attachment") {
    const { data: attachment } = await service
      .from("contract_attachments")
      .select("storage_path, display_name, contract_id")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!attachment) return json(req, { error: "not_found" }, 404);
    if (!attachment.storage_path.startsWith(`${companyId}/${attachment.contract_id}/`)) {
      return json(req, { error: "not_found" }, 404);
    }

    const { data: contract } = await service
      .from("contracts")
      .select("id")
      .eq("id", attachment.contract_id)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("portal_documents_released", true)
      .maybeSingle();
    if (!contract) return json(req, { error: "not_found" }, 404);

    const { data: signed, error } = await service.storage
      .from("contract-attachments")
      .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: attachment.display_name,
      });
    if (error || !signed?.signedUrl) return json(req, { error: "download_unavailable" }, 503);
    return json(req, { url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
  }

  // NFS-e nativa: provedores antigos podem ter URL pronta; o motor proprio
  // gera DANFSe sob demanda pela chave. O gate do portal acima substitui a
  // autenticacao administrativa da rota fiscal interna.
  const { data: emission } = await service
    .from("nfse_emissions")
    .select("*")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .in("status", ["autorizada", "cancelada", "cancelamento_pendente"])
    .maybeSingle();
  if (!emission) return json(req, { error: "not_found" }, 404);

  if (clean(emission.pdf_url)) {
    return json(req, { url: clean(emission.pdf_url), expires_in: null });
  }

  const reference = clean(emission.chave_acesso) || clean(emission.fisqal_dps_id);
  if (!reference) return json(req, { error: "download_unavailable" }, 409);

  const { data: fiscal } = await service
    .from("company_fiscal_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!fiscal) return json(req, { error: "download_unavailable" }, 503);

  try {
    const provider = getProvider(fiscal);
    if (!provider.danfse) return json(req, { error: "download_unavailable" }, 501);
    const ctx: NfseProviderCtx = { supabase: service, companyId, fiscal };
    const result = await provider.danfse(ctx, reference);
    if (result.pdfUrl) return json(req, { url: result.pdfUrl, expires_in: null });
    if (result.pdfBase64) {
      return json(req, {
        pdf_base64: result.pdfBase64,
        file_name: `NFSe-${clean(emission.numero_nfse) || reference.slice(0, 12)}.pdf`,
      });
    }
  } catch (error) {
    console.error("[customer-portal-document-download] DANFSe indisponivel", {
      company_id: companyId.slice(0, 8),
      emission_id: documentId.slice(0, 8),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return json(req, { error: "download_unavailable" }, 503);
});
