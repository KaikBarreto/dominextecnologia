import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { getNfseEngine } from "../_shared/nfse-provider.ts";
import type { NfseProviderCtx } from "../_shared/nfse-provider.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/i;
const SIGNED_URL_TTL_SECONDS = 300;

type DocumentSource =
  | "manual"
  | "contract_attachment"
  | "dominex_nfse"
  | "dominex_nfe"
  | "dominex_nfce";
type GoodsFormat = "pdf" | "xml";

const SOURCES: DocumentSource[] = [
  "manual",
  "contract_attachment",
  "dominex_nfse",
  "dominex_nfe",
  "dominex_nfce",
];

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
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

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
    format?: string | null;
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
  if (!SOURCES.includes(source)) {
    return json(req, { error: "invalid_source" }, 400);
  }
  const isGoods = source === "dominex_nfe" || source === "dominex_nfce";
  // `format` so vale para NF-e/NFC-e; nas fontes antigas e ignorado.
  const rawFormat = body.format == null ? "" : clean(body.format);
  if (isGoods && rawFormat && rawFormat !== "pdf" && rawFormat !== "xml") {
    return json(req, { error: "invalid_format" }, 400);
  }
  const format: GoodsFormat = rawFormat === "xml" ? "xml" : "pdf";

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

  const invoices = Array.isArray(payload.invoices)
    ? payload.invoices as PortalItem[]
    : [];
  const documents = Array.isArray(payload.documents)
    ? payload.documents as PortalItem[]
    : [];
  const isReleased = [...invoices, ...documents].some(
    (item) => item.id === documentId && item.source === source,
  );
  if (!isReleased) return json(req, { error: "not_found" }, 404);

  if (isGoods) {
    // NF-e (55) / NFC-e (65) autorizada em producao. companyId/customerId vem
    // do payload do portal do proprio visitante, nunca do corpo da requisicao.
    const model = source === "dominex_nfe" ? 55 : 65;
    const pdfField = model === 55 ? "danfe_pdf_path" : "danfce_pdf_path";
    let query = service
      .from(model === 55 ? "nfe_documents" : "nfce_documents")
      .select(
        model === 55
          ? `number, ${pdfField}, processed_xml_path`
          : `number, ${pdfField}, processed_xml_path, customer_id, order_id`,
      )
      .eq("id", documentId)
      .eq("company_id", companyId)
      .eq("status", "authorized")
      .eq("environment", 1);
    // NF-e: o cliente fica gravado na propria nota. NFC-e do PDV pode nascer
    // so com order_id; o dono e COALESCE(nfce.customer_id, pdv_orders.customer_id).
    if (model === 55) {
      query = query.eq("customer_id", customerId).eq("direction", "saida");
    }
    const { data: row } = await query.maybeSingle();
    if (!row) return json(req, { error: "not_found" }, 404);

    const record = row as unknown as Record<string, unknown>;
    if (model === 65) {
      const directCustomer = clean(record.customer_id);
      const orderId = clean(record.order_id);
      if (directCustomer) {
        if (directCustomer !== customerId) {
          return json(req, { error: "not_found" }, 404);
        }
      } else if (UUID_RE.test(orderId)) {
        const { data: order } = await service
          .from("pdv_orders")
          .select("customer_id")
          .eq("id", orderId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (!order || clean(order.customer_id) !== customerId) {
          return json(req, { error: "not_found" }, 404);
        }
      } else {
        return json(req, { error: "not_found" }, 404);
      }
    }
    const path = clean(record[format === "xml" ? "processed_xml_path" : pdfField]);
    if (
      !path ||
      !path.startsWith(`${companyId}/${model}/${documentId}/`) ||
      path.split("/").includes("..")
    ) {
      return json(req, { error: "not_found" }, 404);
    }

    const number = record.number == null ? "" : String(record.number).trim();
    const prefix = model === 55 ? "NF-e" : "NFC-e";
    const fileName = `${prefix}${number ? `-${number}` : ""}.${format}`;
    const { data: signed, error } = await service.storage
      .from("fiscal-artifacts")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: fileName });
    if (error || !signed?.signedUrl) {
      return json(req, { error: "download_unavailable" }, 503);
    }
    return json(req, {
      url: signed.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  }

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
    if (error || !signed?.signedUrl) {
      return json(req, { error: "download_unavailable" }, 503);
    }
    return json(req, {
      url: signed.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  }

  if (source === "contract_attachment") {
    const { data: attachment } = await service
      .from("contract_attachments")
      .select("storage_path, display_name, contract_id")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!attachment) return json(req, { error: "not_found" }, 404);
    if (
      !attachment.storage_path.startsWith(
        `${companyId}/${attachment.contract_id}/`,
      )
    ) {
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
    if (error || !signed?.signedUrl) {
      return json(req, { error: "download_unavailable" }, 503);
    }
    return json(req, {
      url: signed.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  }

  // NFS-e nativa: o motor próprio gera DANFSe sob demanda pela chave. O gate do
  // portal acima substitui a autenticação administrativa da rota fiscal interna.
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

  const reference = clean(emission.chave_acesso) ||
    clean(emission.referencia_fiscal);
  if (!reference) return json(req, { error: "download_unavailable" }, 409);

  const { data: fiscal } = await service
    .from("company_fiscal_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!fiscal) return json(req, { error: "download_unavailable" }, 503);

  try {
    const engine = getNfseEngine();
    const ctx: NfseProviderCtx = { supabase: service, companyId, fiscal };
    const result = await engine.danfse(ctx, reference);
    if (result.pdfUrl) {
      return json(req, { url: result.pdfUrl, expires_in: null });
    }
    if (result.pdfBase64) {
      return json(req, {
        pdf_base64: result.pdfBase64,
        file_name: `NFSe-${
          clean(emission.numero_nfse) || reference.slice(0, 12)
        }.pdf`,
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
