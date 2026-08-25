// =============================================================================
// fisqal-delete-nfse-draft (Onda 1b) — apaga um RASCUNHO de NFS-e.
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system
// (via fiscal-auth.ts). Deleta uma linha de nfse_emissions SOMENTE quando ela é
// um rascunho (status='rascunho') do próprio tenant — nunca uma nota já emitida.
//
// Body: { id }.
// SEGURANÇA: DELETE escopado por id + company_id = companyId + status='rascunho'.
// Retorna { deleted: true } ou 404 PT-BR se não achou rascunho desse tenant.
// Invariante do domínio: escrita só via service_role aqui, nunca no client.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

interface DeleteBody {
  id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "method_not_allowed", message: "Método HTTP não suportado." },
      405,
    );
  }

  try {
    const auth = await authorizeFiscalManager(req);
    if (!auth.ok) return auth.response;
    const { companyId, supabase } = auth;

    let body: DeleteBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "invalid_body", message: "Requisição inválida." },
        400,
      );
    }

    const draftId = clean(body?.id);
    if (!draftId) {
      return jsonResponse(
        { error: "missing_id", message: "Rascunho não informado." },
        400,
      );
    }

    // ---- DELETE escopado por tenant + status='rascunho' (nunca nota emitida).
    // `select` no retorno pra saber se realmente apagou uma linha desse tenant.
    const { data: deleted, error: deleteErr } = await supabase
      .from("nfse_emissions")
      .delete()
      .eq("id", draftId)
      .eq("company_id", companyId)
      .eq("status", "rascunho")
      .select("id")
      .maybeSingle();

    if (deleteErr) {
      console.error("[fisqal-delete-nfse-draft] delete error", {
        company_id: companyId.slice(0, 8) + "...",
        message: deleteErr.message,
      });
      return jsonResponse(
        {
          error: "delete_failed",
          message: "Não foi possível excluir o rascunho. Tente novamente.",
        },
        500,
      );
    }

    if (!deleted) {
      return jsonResponse(
        { error: "draft_not_found", message: "Rascunho não encontrado." },
        404,
      );
    }

    return jsonResponse({ deleted: true }, 200);
  } catch (err) {
    console.error("[fisqal-delete-nfse-draft] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      {
        error: "internal_error",
        message: "Falha inesperada ao excluir o rascunho. Tente novamente.",
      },
      500,
    );
  }
});
