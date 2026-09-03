// =============================================================================
// Handler de UPLOAD DO CERTIFICADO A1
// (rotas: nfse-upload-certificate / fisqal-upload-certificate).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Recebe multipart do client: file (.pfx/.p12), password, nome.
// Delega ao provedor ativo e persiste SÓ o que o provedor devolve.
//
// DOIS MODELOS DE CUSTÓDIA, um handler:
//   - provedor intermediado: o certificado fica com o fornecedor e guardamos um
//     id (`fisqal_certificate_id`). Nunca vemos o .pfx de novo.
//   - motor próprio: a custódia é NOSSA. O provedor devolve `custodia` com o
//     material JÁ CIFRADO (ponteiro do ciphertext no Storage + DEK envelopada +
//     senha cifrada + nonce) e é isso que gravamos.
//
// ⚠️ Em NENHUM dos dois o .pfx ou a senha em claro tocam o banco ou o log.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-upload-certificate]";

export async function handleNfseUploadCertificate(req: Request): Promise<Response> {
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

    const provider = getProvider(fiscal as Record<string, unknown> | null);
    if (!provider.enviarCertificado) {
      return jsonResponse(
        {
          error: "provider_unsupported",
          message: "O envio de certificado não está disponível na emissão fiscal atual.",
        },
        501,
      );
    }

    // ---- Pré-condição do provedor intermediado: empresa já registrada.
    if (provider.registrarEmpresa && !fiscal?.fisqal_company_id) {
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
        { error: "missing_password", message: "Informe a senha do certificado digital." },
        422,
      );
    }

    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    const resultado = await provider.enviarCertificado(
      ctx,
      file,
      password,
      typeof nome === "string" && nome.trim() ? nome.trim() : file.name,
    );

    // Trilha append-only: guardar certificado de terceiro sem registro de quem
    // e quando é exposição desnecessária (§Custódia do plano).
    if (resultado.ok && resultado.custodia) {
      await supabase.from("fiscal_certificate_audit").insert({
        company_id: companyId,
        operacao: "upload",
        contexto: "upload_certificado",
        origem: "edge:nfse-upload-certificate",
      });
    }

    if (!resultado.ok || !resultado.referenciaCertificado) {
      return jsonResponse(
        {
          error: "fisqal_no_cert_id",
          message: resultado.mensagem ??
            "A emissão fiscal respondeu sem identificador do certificado. Tente novamente.",
        },
        502,
      );
    }

    const certificateId = resultado.referenciaCertificado;
    const certificateExpiresAt = resultado.validadeAte ?? null;

    // ---- Persiste o que o provedor devolveu (referência OU material cifrado).
    const colunas: Record<string, unknown> = {
      fisqal_certificate_id: certificateId,
      certificate_expires_at: certificateExpiresAt,
    };
    if (resultado.custodia) {
      // Custódia própria: o que vai para o banco é SÓ ciphertext e ponteiro. A
      // chave que abre isto (KEK) vive na VPS e nunca passa por aqui.
      colunas.certificado_ref = resultado.custodia.certificadoRef;
      colunas.certificado_dek_envelopada = resultado.custodia.dekEnvelopada;
      colunas.certificado_senha_cifrada = resultado.custodia.senhaCifrada;
      colunas.certificado_nonce = resultado.custodia.nonce;
      colunas.certificado_algoritmo = resultado.custodia.algoritmo;
      // Sem cadastro prévio de empresa no padrão nacional: o certificado É a
      // credencial. Com ele guardado, a empresa já pode emitir.
      colunas.pode_emitir = true;
    }

    const { error: updateErr } = await supabase
      .from("company_fiscal_settings")
      .update(colunas)
      .eq("company_id", companyId);

    if (updateErr) {
      console.error(`${TAG} update error`, {
        company_id: logId(companyId),
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
        status: resultado.status ?? null,
        certificate_expires_at: certificateExpiresAt,
        message: resultado.mensagem ?? "Certificado digital enviado com sucesso.",
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
