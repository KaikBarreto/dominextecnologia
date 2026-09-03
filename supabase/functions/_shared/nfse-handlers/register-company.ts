// =============================================================================
// Handler de REGISTRO DA EMPRESA na emissão fiscal
// (rotas: nfse-register-company / fisqal-register-company).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Fluxo:
//   - Lê `companies` (identidade + endereço) e `company_fiscal_settings`
//     (inscrições, IBGE, ambiente).
//   - Valida obrigatórios → 422 PT-BR com o campo faltante.
//   - Delega ao provedor: 1ª vez cria; já registrada ATUALIZA (propaga correção
//     de Inscrição Municipal, endereço e troca de ambiente).
//   - Persiste a referência da empresa (coluna legada `fisqal_company_id`).
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { clean, logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-register-company]";

export async function handleNfseRegisterCompany(req: Request): Promise<Response> {
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

    // ---- Identidade/endereço do tenant + config fiscal (filtro por company_id).
    const [{ data: company }, { data: fiscal }] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "name, cnpj, email, phone, address, address_number, neighborhood, city, state, zip_code",
        )
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("company_fiscal_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (!company) {
      return jsonResponse(
        { error: "company_not_found", message: "Empresa não encontrada." },
        404,
      );
    }

    const provider = getProvider(fiscal as Record<string, unknown> | null);
    if (!provider.registrarEmpresa) {
      return jsonResponse(
        {
          error: "provider_unsupported",
          message:
            "A emissão fiscal desta empresa não exige registro prévio. Envie o certificado digital para concluir.",
        },
        501,
      );
    }

    // ---- Já registrada? Define se o caminho é criar ou atualizar.
    const existente = clean(fiscal?.fisqal_company_id);

    // Razão social: `companies` não tem coluna razao_social; usamos `name`.
    const razaoSocial = clean(company.name);
    const cnpj = clean(company.cnpj).replace(/\D/g, "");
    const inscricaoMunicipal = clean(fiscal?.inscricao_municipal);
    const inscricaoEstadual = clean(fiscal?.inscricao_estadual);
    const codigoMunicipio = clean(fiscal?.municipio_ibge);
    const municipio = clean(company.city);
    const uf = clean(company.state);
    const logradouro = clean(company.address);
    const numero = clean(company.address_number);
    const bairro = clean(company.neighborhood);
    const cep = clean(company.zip_code);
    const email = clean(company.email);
    const telefone = clean(company.phone);
    const ambiente = clean(fiscal?.fiscal_ambiente) || "homologacao";

    // ---- Validação de obrigatórios (422 com o campo faltante em PT-BR).
    const missing: { field: string; label: string }[] = [];
    if (!razaoSocial) {
      missing.push({ field: "company.name", label: "Razão social / nome da empresa" });
    }
    if (!cnpj) missing.push({ field: "company.cnpj", label: "CNPJ" });
    if (!inscricaoMunicipal) {
      missing.push({ field: "fiscal.inscricao_municipal", label: "Inscrição Municipal" });
    }
    if (!codigoMunicipio) {
      missing.push({ field: "fiscal.municipio_ibge", label: "Código IBGE do município" });
    }
    if (!municipio) missing.push({ field: "company.city", label: "Município (cidade)" });
    if (!uf) missing.push({ field: "company.state", label: "UF (estado)" });
    if (!logradouro) {
      missing.push({ field: "company.address", label: "Logradouro (endereço)" });
    }
    if (!cep) missing.push({ field: "company.zip_code", label: "CEP" });

    if (missing.length > 0) {
      const labels = missing.map((m) => m.label).join(", ");
      return jsonResponse(
        {
          error: "missing_fields",
          message:
            `Complete o cadastro da empresa antes de registrar a emissão fiscal. Faltando: ${labels}.`,
          missing_fields: missing,
        },
        422,
      );
    }

    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    const resultado = await provider.registrarEmpresa(ctx, {
      razaoSocial,
      nomeFantasia: razaoSocial,
      cnpj,
      inscricaoMunicipal,
      inscricaoEstadual: inscricaoEstadual || undefined,
      codigoMunicipio,
      municipio,
      uf,
      logradouro,
      numero: numero || undefined,
      bairro: bairro || undefined,
      cep,
      email: email || undefined,
      telefone: telefone || undefined,
      ambiente,
      referenciaExistente: existente || undefined,
    });

    const isUpdate = resultado.atualizado;

    if (!resultado.ok) {
      return jsonResponse(
        {
          error: "fisqal_no_id",
          message: resultado.mensagem ??
            "A emissão fiscal respondeu sem identificador da empresa. Tente novamente.",
        },
        502,
      );
    }

    const referenciaEmpresa = clean(resultado.referenciaEmpresa) || existente;

    // ---- Persiste a referência da empresa (upsert: linha pode não existir ainda).
    const { error: upsertErr } = await supabase
      .from("company_fiscal_settings")
      .upsert(
        {
          company_id: companyId,
          fisqal_company_id: referenciaEmpresa || null,
          fiscal_ambiente: ambiente,
          municipio_ibge: codigoMunicipio,
          inscricao_municipal: inscricaoMunicipal,
          inscricao_estadual: inscricaoEstadual || null,
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error(`${TAG} upsert error`, {
        company_id: logId(companyId),
        message: upsertErr.message,
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message: isUpdate
            ? "Os dados foram atualizados na emissão fiscal, mas houve falha ao salvar localmente. Contate o suporte."
            : "A empresa foi registrada na emissão fiscal, mas houve falha ao salvar localmente. Contate o suporte.",
          fisqal_company_id: referenciaEmpresa,
        },
        500,
      );
    }

    return jsonResponse(
      {
        fisqal_company_id: referenciaEmpresa,
        already_registered: isUpdate,
        updated: isUpdate,
        message: resultado.mensagem ??
          (isUpdate
            ? "Dados da empresa atualizados na emissão fiscal."
            : "Empresa registrada na emissão fiscal com sucesso."),
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
        message: "Falha inesperada ao registrar a empresa. Tente novamente.",
      },
      500,
    );
  }
}
