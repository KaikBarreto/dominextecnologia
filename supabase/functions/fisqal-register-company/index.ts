// =============================================================================
// fisqal-register-company — registra/atualiza a empresa do tenant na Fisqal.
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
// Fase 1 (onboarding fiscal). NÃO emite nota (Fase 2).
//
// Fluxo:
//   - Lê dados de `companies` (identidade + endereço) e `company_fiscal_settings`
//     (inscrições, IBGE, ambiente).
//   - Valida dados obrigatórios → 422 PT-BR claro indicando o campo faltante.
//   - 1ª vez: POST /v1/companies (§9) → salva fisqal_company_id.
//   - Já registrada: PATCH /v1/companies/{id} (UpdateCompanyDto) com o MESMO
//     payload → propaga correção de Inscrição Municipal, endereço e troca de
//     ambiente (homologacao ↔ producao). Sem isso, o 1º registro virava beco sem
//     saída: qualquer correção posterior nunca chegava na Fisqal.
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

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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

    // ---- Carrega identidade/endereço do tenant + config fiscal (filtro defensivo por company_id).
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
        .select(
          "fisqal_company_id, inscricao_municipal, inscricao_estadual, municipio_ibge, fiscal_ambiente",
        )
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (!company) {
      return jsonResponse(
        { error: "company_not_found", message: "Empresa não encontrada." },
        404,
      );
    }

    // ---- Já registrada? Define se o caminho é criar (POST) ou atualizar (PATCH).
    // Em ambos os casos montamos e validamos o MESMO payload logo abaixo.
    const existingFisqalId = clean(fiscal?.fisqal_company_id);
    const isUpdate = existingFisqalId.length > 0;

    // ---- Razão social: companies não tem coluna razao_social; usamos `name`.
    const razaoSocial = clean(company.name);
    // Fisqal espera o CNPJ só com dígitos (sem máscara: 12345678000199).
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
    const fiscalAmbiente = clean(fiscal?.fiscal_ambiente) || "homologacao";

    // ---- Validação de obrigatórios (422 com o campo faltante em PT-BR).
    const missing: { field: string; label: string }[] = [];
    if (!razaoSocial) missing.push({ field: "company.name", label: "Razão social / nome da empresa" });
    if (!cnpj) missing.push({ field: "company.cnpj", label: "CNPJ" });
    if (!inscricaoMunicipal) {
      missing.push({ field: "fiscal.inscricao_municipal", label: "Inscrição Municipal" });
    }
    if (!codigoMunicipio) {
      missing.push({ field: "fiscal.municipio_ibge", label: "Código IBGE do município" });
    }
    if (!municipio) missing.push({ field: "company.city", label: "Município (cidade)" });
    if (!uf) missing.push({ field: "company.state", label: "UF (estado)" });
    if (!logradouro) missing.push({ field: "company.address", label: "Logradouro (endereço)" });
    if (!cep) missing.push({ field: "company.zip_code", label: "CEP" });

    if (missing.length > 0) {
      const labels = missing.map((m) => m.label).join(", ");
      return jsonResponse(
        {
          error: "missing_fields",
          message: `Complete o cadastro da empresa antes de registrar a emissão fiscal. Faltando: ${labels}.`,
          missing_fields: missing,
        },
        422,
      );
    }

    // ---- Monta o payload do §9 (CreateCompanyDto / UpdateCompanyDto — mesma forma).
    const payload = {
      razao_social: razaoSocial,
      nome_fantasia: razaoSocial,
      cnpj,
      inscricao_municipal: inscricaoMunicipal,
      inscricao_estadual: inscricaoEstadual || undefined,
      codigo_municipio: codigoMunicipio,
      municipio,
      uf,
      logradouro,
      numero: numero || undefined,
      bairro: bairro || undefined,
      cep,
      email: email || undefined,
      telefone: telefone || undefined,
      fiscal_ambiente: fiscalAmbiente,
    };

    // ---- POST /v1/companies (1ª vez) OU PATCH /v1/companies/{id} (já registrada).
    // Erro da Fisqal em qualquer um dos dois cai no catch como `fisqal_error`
    // (mensagem PT-BR da própria Fisqal) — nunca falha em silêncio.
    let fisqalCompanyId = existingFisqalId;
    if (isUpdate) {
      await fisqal.patch<{ id?: string }>(
        `/v1/companies/${existingFisqalId}`,
        payload,
      );
    } else {
      const created = await fisqal.post<{ id?: string }>("/v1/companies", payload);
      fisqalCompanyId = clean(created?.id);
      if (!fisqalCompanyId) {
        return jsonResponse(
          {
            error: "fisqal_no_id",
            message: "A emissão fiscal respondeu sem identificador da empresa. Tente novamente.",
          },
          502,
        );
      }
    }

    // ---- Persiste o fisqal_company_id (upsert: linha pode não existir ainda).
    const { error: upsertErr } = await supabase
      .from("company_fiscal_settings")
      .upsert(
        {
          company_id: companyId,
          fisqal_company_id: fisqalCompanyId,
          fiscal_ambiente: fiscalAmbiente,
          municipio_ibge: codigoMunicipio,
          inscricao_municipal: inscricaoMunicipal,
          inscricao_estadual: inscricaoEstadual || null,
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error("[fisqal-register-company] upsert error", {
        company_id: companyId.slice(0, 8) + "...",
        message: upsertErr.message,
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message: isUpdate
            ? "Os dados foram atualizados na emissão fiscal, mas houve falha ao salvar localmente. Contate o suporte."
            : "A empresa foi registrada na emissão fiscal, mas houve falha ao salvar localmente. Contate o suporte.",
          fisqal_company_id: fisqalCompanyId,
        },
        500,
      );
    }

    return jsonResponse(
      {
        fisqal_company_id: fisqalCompanyId,
        already_registered: isUpdate,
        updated: isUpdate,
        message: isUpdate
          ? "Dados da empresa atualizados na emissão fiscal."
          : "Empresa registrada na emissão fiscal com sucesso.",
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
    console.error("[fisqal-register-company] unexpected error", {
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
});
