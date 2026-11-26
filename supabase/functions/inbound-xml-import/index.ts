import { authorizeFiscalManager, corsHeaders, jsonResponse } from "../_shared/fiscal-auth.ts";
import { resolverIdentidadeFiscal } from "../_shared/dfe-client.ts";
import { InboundXmlError, parseInboundXml } from "../_shared/inbound-xml.ts";

const MAX_XML_BYTES = 2 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const auth = await authorizeFiscalManager(req);
  if (!auth.ok) return auth.response;

  let body: { xml?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body", message: "Envie um arquivo XML válido." }, 400);
  }

  if (typeof body.xml !== "string" || !body.xml.trim()) {
    return jsonResponse({ error: "invalid_xml", message: "Selecione um arquivo XML válido." }, 400);
  }
  if (new TextEncoder().encode(body.xml).byteLength > MAX_XML_BYTES) {
    return jsonResponse({ error: "xml_too_large", message: "O XML deve ter no máximo 2 MB." }, 413);
  }

  const identity = await resolverIdentidadeFiscal(auth.supabase, auth.companyId, { exigirUf: false });
  if (!identity.ok) return jsonResponse({ error: "company_tax_id_missing", message: identity.motivo }, 422);

  try {
    const document = parseInboundXml(body.xml, identity.identidade.cnpj);

    if (document.tipo === "nfe") {
      const { data, error } = await auth.supabase.rpc("dfe_upsert_inbound_nfe", {
        p_company_id: auth.companyId,
        p_documentos: [document.values],
      });
      if (error) throw error;
      const summary = Array.isArray(data) ? data[0] : data;
      return jsonResponse({ ok: true, tipo: "nfe", nova: Number(summary?.novas ?? 0) > 0 }, 200);
    }

    const payload = { company_id: auth.companyId, ...document.values };
    const { error } = await auth.supabase
      .from("inbound_nfse")
      .upsert(payload, { onConflict: "company_id,chave_natural" });
    if (error) throw error;
    return jsonResponse({ ok: true, tipo: "nfse" }, 200);
  } catch (error) {
    if (error instanceof InboundXmlError) {
      return jsonResponse({ error: error.code, message: error.message }, 422);
    }
    console.error("[inbound-xml-import] import failed", {
      companyId: auth.companyId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(
      { error: "import_failed", message: "Não foi possível importar a nota agora. Tente novamente em instantes." },
      500,
    );
  }
});
