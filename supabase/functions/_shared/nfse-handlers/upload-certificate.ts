// =============================================================================
// Handler de UPLOAD DO CERTIFICADO A1
// (rota: nfse-upload-certificate).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Recebe multipart do client: file (.pfx/.p12), password, nome.
// Delega ao motor próprio. A custódia é NOSSA: o motor devolve o material JÁ
// CIFRADO (ponteiro do ciphertext no Storage + DEK envelopada + senha cifrada +
// nonce) e é somente isso que gravamos.
//
// ⚠️ Em NENHUM dos dois o .pfx ou a senha em claro tocam o banco ou o log.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import type { FiscalAuthOk } from "../fiscal-auth.ts";
import { getNfseEngine } from "../nfse-provider.ts";
import type {
  NfseCustodiaCertificado,
  NfseProviderCtx,
} from "../nfse-provider.ts";
import { BUCKET_CERTIFICADOS } from "../providers/sefin.ts";
import { logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-upload-certificate]";
const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;

async function removerCertificadoDaEmpresa(
  supabase: FiscalAuthOk["supabase"],
  companyId: string,
  referencia: string | null | undefined,
): Promise<void> {
  const caminho = referencia?.trim() ?? "";
  if (!caminho.startsWith(`${companyId}/`) || !caminho.endsWith(".b64")) {
    return;
  }

  const { error } = await supabase.storage
    .from(BUCKET_CERTIFICADOS)
    .remove([caminho]);
  if (error) {
    console.error(`${TAG} cleanup error`, {
      company_id: logId(companyId),
      message: error.message,
    });
  }
}

export function custodiaCompleta(
  custodia: NfseCustodiaCertificado | undefined,
): custodia is NfseCustodiaCertificado {
  return Boolean(
    custodia?.certificadoRef?.trim() &&
      custodia.dekEnvelopada?.trim() &&
      custodia.senhaCifrada?.trim() &&
      custodia.nonce?.trim() &&
      custodia.algoritmo?.trim(),
  );
}

export async function handleNfseUploadCertificate(
  req: Request,
): Promise<Response> {
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

    const { data: fiscal } = await supabase
      .from("company_fiscal_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!fiscal) {
      return jsonResponse(
        {
          error: "fiscal_not_configured",
          message:
            "Salve os dados fiscais da empresa antes de enviar o certificado digital.",
        },
        422,
      );
    }
    const engine = getNfseEngine();

    // ---- Lê o multipart do client.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonResponse(
        {
          error: "invalid_multipart",
          message:
            "Envio inválido. Anexe o certificado e a senha e tente novamente.",
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
    if (file.size > MAX_CERTIFICATE_BYTES) {
      return jsonResponse(
        {
          error: "certificate_too_large",
          message: "O certificado deve ter no máximo 2 MB.",
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

    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    const resultado = await engine.enviarCertificado(
      ctx,
      file,
      password,
      typeof nome === "string" && nome.trim() ? nome.trim() : file.name,
    );

    const novaReferencia = resultado.custodia?.certificadoRef ??
      resultado.referenciaCertificado;

    if (
      !resultado.ok || !resultado.referenciaCertificado ||
      !custodiaCompleta(resultado.custodia)
    ) {
      await removerCertificadoDaEmpresa(supabase, companyId, novaReferencia);
      return jsonResponse(
        {
          error: "certificate_seal_failed",
          message: resultado.mensagem ??
            "Não foi possível guardar o certificado com segurança. Tente novamente.",
        },
        502,
      );
    }

    const certificateExpiresAt = resultado.validadeAte?.trim() || "";
    const certificateExpiresAtMs = Date.parse(certificateExpiresAt);
    if (!certificateExpiresAt || !Number.isFinite(certificateExpiresAtMs)) {
      await removerCertificadoDaEmpresa(supabase, companyId, novaReferencia);
      return jsonResponse(
        {
          error: "certificate_expiry_unknown",
          message:
            "Não foi possível confirmar a validade do certificado. Verifique o arquivo e tente novamente.",
        },
        422,
      );
    }
    if (certificateExpiresAtMs <= Date.now()) {
      await removerCertificadoDaEmpresa(supabase, companyId, novaReferencia);
      return jsonResponse(
        {
          error: "certificate_expired",
          message:
            "Este certificado digital está expirado. Envie um certificado válido.",
        },
        422,
      );
    }

    // ---- Persiste SOMENTE custódia cifrada e validade. Cobertura municipal é
    // outro conceito e nunca muda durante upload de certificado.
    const colunas: Record<string, unknown> = {
      certificate_expires_at: certificateExpiresAt,
      certificado_ref: resultado.custodia.certificadoRef,
      certificado_dek_envelopada: resultado.custodia.dekEnvelopada,
      certificado_senha_cifrada: resultado.custodia.senhaCifrada,
      certificado_nonce: resultado.custodia.nonce,
      certificado_algoritmo: resultado.custodia.algoritmo,
    };

    const { error: updateErr } = await supabase
      .from("company_fiscal_settings")
      .update(colunas)
      .eq("company_id", companyId);

    if (updateErr) {
      await removerCertificadoDaEmpresa(supabase, companyId, novaReferencia);
      console.error(`${TAG} update error`, {
        company_id: logId(companyId),
        message: updateErr.message,
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message:
            "O certificado foi enviado, mas houve falha ao salvar localmente. Contate o suporte.",
        },
        500,
      );
    }

    const referenciaAnterior = typeof fiscal.certificado_ref === "string"
      ? fiscal.certificado_ref
      : null;
    if (referenciaAnterior && referenciaAnterior !== novaReferencia) {
      await removerCertificadoDaEmpresa(
        supabase,
        companyId,
        referenciaAnterior,
      );
    }

    // Trilha append-only somente depois de a referência cifrada estar persistida.
    await supabase.from("fiscal_certificate_audit").insert({
      company_id: companyId,
      operacao: "upload",
      contexto: "upload_certificado",
      origem: "edge:nfse-upload-certificate",
    });

    return jsonResponse(
      {
        status: resultado.status ?? null,
        certificate_expires_at: certificateExpiresAt,
        message: resultado.mensagem ??
          "Certificado digital enviado com sucesso.",
      },
      200,
    );
  } catch (err) {
    const providerResp = providerErrorResponse(err);
    if (providerResp) return providerResp;

    console.error(`${TAG} unexpected error`, {
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
}
