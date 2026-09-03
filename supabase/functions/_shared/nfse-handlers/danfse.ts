// =============================================================================
// Handler do DANFSE (rota: nfse-danfse).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// POR QUE ESTA ROTA EXISTE
// O motor próprio NÃO guarda o PDF numa URL: o DANFSE é gerado sob demanda (o
// microserviço tenta o oficial do governo e cai para geração local quando ele
// está fora — já esteve 503). Sem esta rota, a tela gateava o download por
// `pdf_url`, que nunca é preenchida no provedor `sefin`, e o resultado era uma
// nota autorizada SEM NENHUMA forma de o cliente obter o documento.
//
// Body: { emissionId } (id local de nfse_emissions).
// Resposta 200: { pdfBase64, nomeArquivo }.
//
// A trilha de auditoria da decifra do certificado é gravada pelo PROVEDOR
// (ver `_shared/providers/sefin.ts`), não aqui.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { clean, logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-danfse]";

export async function handleNfseDanfse(req: Request): Promise<Response> {
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

    let body: { emissionId?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_body", message: "Requisição inválida." }, 400);
    }

    const emissionId = clean(body?.emissionId);
    if (!emissionId) {
      return jsonResponse(
        { error: "missing_emission", message: "Informe a nota fiscal." },
        400,
      );
    }

    // ---- Localiza a emissão (filtro defensivo por company_id).
    const { data: emission } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", emissionId)
      .maybeSingle();

    if (!emission) {
      return jsonResponse(
        { error: "emission_not_found", message: "Nota fiscal não encontrada." },
        404,
      );
    }

    // ---- Só documento que EXISTIU tem DANFSE. Rascunho e rejeitada nunca
    // chegaram a virar nota; cancelada existiu e o cliente tem direito a ela.
    const status = clean(emission.status);
    if (!["autorizada", "cancelada", "cancelamento_pendente"].includes(status)) {
      return jsonResponse(
        {
          error: "sem_documento",
          message:
            "Esta nota ainda não gerou documento fiscal. O PDF fica disponível depois que a prefeitura autoriza.",
        },
        422,
      );
    }

    // O DANFSE é resolvido pela CHAVE DE ACESSO (50 dígitos). O identificador
    // interno do provedor serve de reserva para provedores que indexam por ele.
    const referencia = clean(emission.chave_acesso) || clean(emission.fisqal_dps_id);
    if (!referencia) {
      return jsonResponse(
        {
          error: "sem_chave",
          message: "Esta nota ainda não tem chave de acesso. Atualize o status e tente de novo.",
        },
        409,
      );
    }

    const { data: fiscal } = await supabase
      .from("company_fiscal_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!fiscal) {
      return jsonResponse(
        {
          error: "fiscal_not_configured",
          message: "Configuração fiscal não encontrada. Revise as Configurações Fiscais.",
        },
        422,
      );
    }

    const ctx: NfseProviderCtx = { supabase, companyId, fiscal };
    const provider = getProvider(fiscal);

    if (!provider.danfse) {
      return jsonResponse(
        {
          error: "provider_unsupported",
          message: "A geração do PDF não está disponível para esta empresa.",
        },
        501,
      );
    }

    const resultado = await provider.danfse(ctx, referencia);

    if (!resultado.pdfBase64 && !resultado.pdfUrl) {
      return jsonResponse(
        {
          error: "danfse_indisponivel",
          message:
            "Não foi possível gerar o PDF agora. A nota continua válida — tente novamente em instantes.",
        },
        503,
      );
    }

    const numero = clean(emission.numero_nfse);
    console.log(TAG, "danfse gerado", {
      company_id: logId(companyId),
      emission: logId(emissionId),
    });

    return jsonResponse(
      {
        pdfBase64: resultado.pdfBase64 ?? null,
        pdfUrl: resultado.pdfUrl ?? null,
        nomeArquivo: `NFSe-${numero || referencia.slice(0, 12)}.pdf`,
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
      { error: "internal_error", message: "Falha inesperada ao gerar o PDF da nota." },
      500,
    );
  }
}
