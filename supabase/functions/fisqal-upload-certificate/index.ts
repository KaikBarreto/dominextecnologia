// =============================================================================
// fisqal-upload-certificate — sobe o certificado A1 (.pfx/.p12) pra Fisqal.
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
// Fase 1 (onboarding fiscal).
//
// Recebe multipart do client: file (.pfx/.p12), password, nome.
// Requer fisqal_company_id já setado (senão 422 "registre a empresa primeiro").
// POST /v1/companies/{fisqal_company_id}/certificates (multipart, §10).
// Salva fisqal_certificate_id (+ certificate_expires_at SE a resposta trouxer).
//
// NUNCA persistimos o .pfx nem a senha — só o id do certificado e a validade.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";
import {
  fisqal,
  FisqalApiError,
  FisqalConfigError,
} from "../_shared/fisqal-client.ts";

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

    // ---- Requer fisqal_company_id já registrado.
    const { data: fiscal } = await supabase
      .from("company_fiscal_settings")
      .select("fisqal_company_id")
      .eq("company_id", companyId)
      .maybeSingle();

    const fisqalCompanyId = fiscal?.fisqal_company_id;
    if (!fisqalCompanyId) {
      return jsonResponse(
        {
          error: "company_not_registered",
          message: "Registre a empresa na emissão fiscal antes de enviar o certificado.",
        },
        422,
      );
    }

    // ---- Lê o multipart do client.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonResponse(
        {
          error: "invalid_multipart",
          message: "Envio inválido. Anexe o certificado e a senha e tente novamente.",
        },
        400,
      );
    }

    const file = form.get("file");
    const password = form.get("password");
    const nome = form.get("nome");

    if (!(file instanceof File) || file.size === 0) {
      return jsonResponse(
        {
          error: "missing_file",
          message: "Anexe o arquivo do certificado digital (.pfx ou .p12).",
        },
        422,
      );
    }
    const lowerName = (file.name ?? "").toLowerCase();
    if (!lowerName.endsWith(".pfx") && !lowerName.endsWith(".p12")) {
      return jsonResponse(
        {
          error: "invalid_file_type",
          message: "O certificado deve ser um arquivo .pfx ou .p12.",
        },
        422,
      );
    }
    if (typeof password !== "string" || !password.trim()) {
      return jsonResponse(
        {
          error: "missing_password",
          message: "Informe a senha do certificado digital.",
        },
        422,
      );
    }

    // ---- Repassa multipart pra Fisqal (§10). O fisqal-client omite Content-Type
    //      pra FormData (deixa o runtime montar o boundary).
    const fwd = new FormData();
    fwd.append("file", file, file.name);
    fwd.append("password", password);
    fwd.append("nome", typeof nome === "string" && nome.trim() ? nome.trim() : file.name);

    const result = await fisqal.post<{
      id?: string;
      nome?: string;
      status?: string;
      // Campos de validade possíveis — a doc §10 não confirma; lemos defensivamente.
      validade?: string;
      valid_to?: string;
      expires_at?: string;
      not_after?: string;
    }>(`/v1/companies/${fisqalCompanyId}/certificates`, fwd);

    const certificateId = result?.id;
    if (!certificateId) {
      return jsonResponse(
        {
          error: "fisqal_no_cert_id",
          message: "A emissão fiscal respondeu sem identificador do certificado. Tente novamente.",
        },
        502,
      );
    }

    // ---- Validade: a doc §10 NÃO confirma campo de validade na resposta do upload.
    //      Tentamos os nomes prováveis; se nenhum vier, fica null (PENDÊNCIA: pode
    //      exigir GET /test do certificado pra obter a validade — ver reporte).
    const rawExpires =
      result.validade ?? result.valid_to ?? result.expires_at ?? result.not_after ?? null;
    let certificateExpiresAt: string | null = null;
    if (rawExpires) {
      const d = new Date(rawExpires);
      if (!Number.isNaN(d.getTime())) certificateExpiresAt = d.toISOString();
    }

    // ---- Persiste o id do certificado (e validade se disponível). Filtro por company_id.
    const { error: updateErr } = await supabase
      .from("company_fiscal_settings")
      .update({
        fisqal_certificate_id: certificateId,
        certificate_expires_at: certificateExpiresAt,
      })
      .eq("company_id", companyId);

    if (updateErr) {
      console.error("[fisqal-upload-certificate] update error", {
        company_id: companyId.slice(0, 8) + "...",
        message: updateErr.message,
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message:
            "O certificado foi enviado, mas houve falha ao salvar localmente. Contate o suporte.",
          fisqal_certificate_id: certificateId,
        },
        500,
      );
    }

    return jsonResponse(
      {
        fisqal_certificate_id: certificateId,
        status: result.status ?? null,
        certificate_expires_at: certificateExpiresAt,
        message: "Certificado digital enviado com sucesso.",
      },
      200,
    );
  } catch (err) {
    if (err instanceof FisqalConfigError) {
      return jsonResponse({ error: "fisqal_unconfigured", message: err.message }, 503);
    }
    if (err instanceof FisqalApiError) {
      return jsonResponse(
        { error: "fisqal_error", message: err.message, code: err.code },
        err.status >= 400 && err.status < 600 ? err.status : 502,
      );
    }
    console.error("[fisqal-upload-certificate] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      {
        error: "internal_error",
        message: "Falha inesperada ao enviar o certificado. Tente novamente.",
      },
      500,
    );
  }
});
