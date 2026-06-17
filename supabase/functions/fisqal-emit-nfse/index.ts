// =============================================================================
// fisqal-emit-nfse (Fase 2.1) — emite NFS-e de forma STANDALONE (sem OS).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Fluxo:
//   - Auth de tenant via fiscal-auth.ts.
//   - Body: { customerId, servico: { descricao, codigoServico?, codigoNbs? },
//             valores: { valorServico, aliquotaIss? }, dataCompetencia?, idempotencyKey? }.
//     Overrides por nota (codigoServico/codigoNbs/aliquotaIss) têm precedência
//     sobre os defaults da empresa em company_fiscal_settings.
//   - Carrega customers (tomador) + company_fiscal_settings (prestador).
//     NÃO lê service_orders — emissão é independente da Ordem de Serviço.
//   - Valida (422 PT-BR) antes de chamar a Fisqal.
//   - Idempotência: idempotencyKey do body OU determinística
//     (company_id + customerId + valor + dataCompetencia).
//     Se já existe emissão com essa chave → retorna a existente (não reemite).
//   - POST /v1/nfse (CreateNfseDpsDto §8.1) → grava nfse_emissions (status do 202).
//   - NÃO vincula financial_transactions (deixa null) — sem acoplamento com OS.
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
  idempotencyHeader,
} from "../_shared/fisqal-client.ts";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function onlyDigits(v: unknown): string {
  return clean(v).replace(/\D/g, "");
}

/** Valida YYYY-MM-DD; devolve a string limpa ou "" se inválida. */
function cleanDate(v: unknown): string {
  const s = clean(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * Idempotency-Key determinística estável por (company, cliente, valor, competência).
 * Combina com a UNIQUE (company_id, idempotency_key). NÃO depende mais da OS.
 */
function deterministicKey(
  companyId: string,
  customerId: string,
  valor: number,
  dataCompetencia: string,
): string {
  const cents = Math.round(valor * 100);
  return `nfse_${companyId}_${customerId}_${cents}_${dataCompetencia}`.slice(0, 512);
}

/** Traduz código de erro fiscal cru da Fisqal pra mensagem amigável PT-BR. */
function friendlyFiscalMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "NFSE_REJECTED":
      return "A prefeitura rejeitou a nota fiscal. Confira os dados do serviço e do cliente e tente novamente.";
    case "VALIDATION_ERROR":
      return "Os dados enviados para a nota fiscal são inválidos. Revise o cadastro e tente novamente.";
    case "CERTIFICATE_INVALID":
      return "O certificado digital da empresa está inválido ou expirado. Atualize-o antes de emitir.";
    case "COMPANY_INACTIVE":
      return "A empresa está inativa na emissão fiscal e não pode emitir notas.";
    case "COMPANY_PLAN_LIMIT":
      return "O limite de emissões fiscais foi atingido. Tente novamente no próximo ciclo.";
    case "FISCAL_PROVIDER_ERROR":
      return "O sistema da prefeitura/SEFIN está indisponível no momento. Tente novamente em instantes.";
    case "RATE_LIMITED":
      return "Muitas emissões em sequência. Aguarde alguns instantes e tente novamente.";
    default:
      return fallback;
  }
}

interface EmitBody {
  customerId?: string;
  servico?: { descricao?: string; codigoServico?: string; codigoNbs?: string };
  // aliquotaIss: override da alíquota de ISS por nota (em %, ex.: 5 = 5%).
  // Mora em `valores` por ser um parâmetro de cálculo do valor da nota.
  valores?: { valorServico?: number | string; aliquotaIss?: number | string };
  dataCompetencia?: string;
  idempotencyKey?: string;
}

/**
 * Resolve um número de alíquota (%) a partir de um valor cru do body/banco.
 * Aceita number ou string; rejeita NaN e negativos. Retorna `null` se ausente/ inválido.
 */
function parseAliquota(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Zero-pad à esquerda até `len` (corta à direita se exceder). */
function padLeft(v: string, len: number): string {
  const digits = v.replace(/\D/g, "");
  return digits.padStart(len, "0").slice(-len);
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

    let body: EmitBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "invalid_body", message: "Requisição inválida." },
        400,
      );
    }

    const customerId = clean(body?.customerId);
    if (!customerId) {
      return jsonResponse(
        { error: "missing_customer", message: "Cliente não informado." },
        400,
      );
    }

    const valorServico = Number(body?.valores?.valorServico ?? 0);
    if (!(valorServico > 0)) {
      return jsonResponse(
        { error: "invalid_value", message: "Informe um valor de serviço maior que zero." },
        400,
      );
    }

    // dataCompetencia: do body (YYYY-MM-DD) OU hoje.
    const dataCompetencia = cleanDate(body?.dataCompetencia) ||
      new Date().toISOString().slice(0, 10);

    // ---- Idempotency-Key: body OU determinística estável (sem OS).
    const idempotencyKey = clean(body?.idempotencyKey) ||
      deterministicKey(companyId, customerId, valorServico, dataCompetencia);

    // ---- Idempotência local: se já existe emissão com essa chave, devolve a existente.
    const { data: existing } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return jsonResponse(
        {
          emission: existing,
          already_emitted: true,
          message: "Nota fiscal já emitida para este cliente e valor.",
        },
        200,
      );
    }

    // ---- Gate de cota mensal por nível (tier). Roda DEPOIS da idempotência
    // (reemissão de nota existente NÃO consome cota) e ANTES de chamar a Fisqal.
    // O `error: "nfse_quota_exceeded"` é o contrato que o front checa — não mudar.
    {
      const { data: quota, error: quotaErr } = await supabase.rpc(
        "nfse_can_emit",
        { p_company_id: companyId },
      );
      if (quotaErr) {
        console.error("[fisqal-emit-nfse] nfse_can_emit error", {
          company_id: companyId.slice(0, 8) + "...",
          message: quotaErr.message,
        });
        return jsonResponse(
          {
            error: "quota_check_failed",
            message:
              "Não foi possível verificar o limite de emissões. Tente novamente em instantes.",
          },
          500,
        );
      }
      if (quota && quota.allowed === false) {
        const nextTier = quota.next_tier ?? null;
        const upsell = nextTier
          ? ` Faça upgrade para o ${nextTier.name} e emita até ${
            nextTier.limit == null ? "ilimitadas" : nextTier.limit
          } notas por mês.`
          : "";
        return jsonResponse(
          {
            error: "nfse_quota_exceeded",
            message:
              `Você atingiu o limite de ${quota.limit} notas fiscais deste mês no seu nível atual.${upsell}`,
            used: quota.used,
            limit: quota.limit,
            tier: quota.tier,
            next_tier: nextTier,
          },
          402,
        );
      }
    }

    // ---- Carrega tomador (cliente) + config fiscal do prestador + CNPJ da empresa
    // (sem service_orders). O CNPJ do PRESTADOR mora em companies.cnpj.
    const [{ data: customer }, { data: fiscal }, { data: companyRow }] = await Promise
      .all([
        supabase
          .from("customers")
          .select(
            "id, name, company_name, customer_type, document, email, address, address_number, neighborhood, city, state, zip_code",
          )
          .eq("id", customerId)
          .eq("company_id", companyId)
          .maybeSingle(),
        supabase
          .from("company_fiscal_settings")
          .select(
            "fisqal_company_id, codigo_servico_default, item_lc116, iss_aliquota, serie_dps, ultimo_numero_dps, municipio_ibge, pode_emitir, fiscal_ambiente, inscricao_municipal, codigo_nbs_default",
          )
          .eq("company_id", companyId)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("cnpj")
          .eq("id", companyId)
          .maybeSingle(),
      ]);

    if (!customer) {
      return jsonResponse(
        { error: "customer_not_found", message: "Cliente não encontrado." },
        404,
      );
    }

    // ---- VALIDAÇÕES (422 PT-BR antes de chamar a Fisqal).
    const missing: string[] = [];
    if (!fiscal) {
      return jsonResponse(
        {
          error: "fiscal_not_configured",
          message: "A emissão fiscal ainda não foi configurada para esta empresa.",
        },
        422,
      );
    }
    if (fiscal.pode_emitir !== true) {
      return jsonResponse(
        {
          error: "cannot_emit",
          message:
            "A empresa ainda não está habilitada a emitir notas fiscais. Conclua a configuração fiscal (certificado e cobertura do município).",
        },
        422,
      );
    }
    if (!clean(fiscal.fisqal_company_id)) {
      missing.push("Empresa não registrada na emissão fiscal");
    }

    // Código de serviço: do body OU o padrão da empresa.
    const codigoServico = clean(body?.servico?.codigoServico) ||
      clean(fiscal.codigo_servico_default);
    if (!codigoServico) {
      missing.push("Código de serviço");
    }
    if (!clean(fiscal.municipio_ibge)) {
      missing.push("Código IBGE do município");
    }

    // CNPJ do PRESTADOR (só dígitos) — obrigatório na DPS nacional.
    const cnpjPrestador = onlyDigits(companyRow?.cnpj);
    if (!cnpjPrestador) {
      missing.push("CNPJ da empresa (prestador)");
    }

    const tomadorDocumento = onlyDigits(customer?.document);
    if (!tomadorDocumento) {
      missing.push("CPF/CNPJ do cliente");
    }

    // Código NBS do serviço: do body OU o padrão da empresa. Obrigatório (servico.required).
    const codigoNbs = clean(body?.servico?.codigoNbs) ||
      clean(fiscal.codigo_nbs_default);
    if (!codigoNbs) {
      return jsonResponse(
        {
          error: "missing_nbs",
          message:
            "Configure o código NBS do serviço nas configurações fiscais antes de emitir.",
        },
        422,
      );
    }

    if (missing.length > 0) {
      return jsonResponse(
        {
          error: "missing_fields",
          message: `Não foi possível emitir a nota. Faltando: ${missing.join(", ")}.`,
          missing_fields: missing,
        },
        422,
      );
    }

    // ---- Monta tomador.
    const tomadorTipoInscricao = tomadorDocumento.length > 11 ? "2" : "1"; // 2=CNPJ, 1=CPF
    const razaoSocialTomador =
      clean(customer?.company_name) || clean(customer?.name) || "Consumidor";
    const discriminacao =
      clean(body?.servico?.descricao) || "Prestação de serviços técnicos.";

    // ---- Alíquota de ISS (%): override da nota (valores.aliquotaIss) tem
    // precedência sobre o default da empresa (company_fiscal_settings.iss_aliquota).
    const issAliquota = parseAliquota(body?.valores?.aliquotaIss) ??
      parseAliquota(fiscal.iss_aliquota) ?? 0;
    const valorIss = issAliquota > 0
      ? Math.round(valorServico * (issAliquota / 100) * 100) / 100
      : null;

    // ---- numeroDps: obtido da RPC atômica SÓ AGORA (após TODAS as validações e a
    // checagem de idempotência lá em cima). Reuso de emissão existente já retornou
    // antes deste ponto → não consome número de DPS.
    const codigoMunicipioEmissor = clean(fiscal.municipio_ibge);
    const tipoInscricaoPrestador = "2"; // 2 = CNPJ do prestador
    const serieDps = clean(fiscal.serie_dps) || "1"; // obrigatório: nunca undefined

    const { data: numeroDpsRaw, error: numeroErr } = await supabase.rpc(
      "fisqal_next_dps_number",
      { p_company_id: companyId },
    );
    if (numeroErr || numeroDpsRaw == null) {
      console.error("[fisqal-emit-nfse] fisqal_next_dps_number error", {
        company_id: companyId.slice(0, 8) + "...",
        message: numeroErr?.message ?? "null",
      });
      return jsonResponse(
        {
          error: "dps_number_failed",
          message:
            "Não foi possível gerar o número da nota. Tente novamente em instantes.",
        },
        500,
      );
    }
    const numeroDps = String(numeroDpsRaw);

    // ---- idDps: layout nacional da DPS.
    // "DPS" + codigoMunicipioEmissor(7) + tipoInscricaoPrestador(1) +
    // inscricaoFederalPrestador zero-padded em 14 + serieDps zero-padded em 5 +
    // numeroDps zero-padded em 15.
    // TODO(homologação): confirmar o formato EXATO do idDps com a Fisqal/SEFIN —
    // o exemplo da doc (§8.1) é placeholder e o tamanho final deve ser validado
    // em ambiente de homologação antes de emitir em produção.
    const idDps = "DPS" +
      padLeft(codigoMunicipioEmissor, 7) +
      tipoInscricaoPrestador +
      padLeft(cnpjPrestador, 14) +
      padLeft(serieDps, 5) +
      padLeft(numeroDps, 15);

    // ---- Monta o CreateNfseDpsDto (§8.1).
    const payload: Record<string, unknown> = {
      companyId: clean(fiscal.fisqal_company_id),
      idDps,
      serieDps,
      numeroDps,
      codigoMunicipioEmissor,
      tipoInscricaoPrestador, // "2" = CNPJ
      inscricaoFederalPrestador: cnpjPrestador, // CNPJ do prestador, só dígitos
      dataCompetencia, // YYYY-MM-DD
      tomador: {
        tipoInscricao: tomadorTipoInscricao,
        inscricaoFederal: tomadorDocumento,
        razaoSocial: razaoSocialTomador,
        email: clean(customer?.email) || undefined,
      },
      servico: {
        codigoServico,
        codigoNbs,
        municipioIncidencia: codigoMunicipioEmissor,
        discriminacao,
      },
      valores: {
        valorServico,
        // TODO(homologação): a doc §8.1 só documenta `valorServico` em `valores`.
        // O campo da alíquota de ISS na DPS nacional (provável `aliquota`/`tribIssqn`)
        // ainda não está confirmado na doc — reconferir no OpenAPI ao vivo
        // (docs-json) e em homologação. Enviamos `aliquota` de forma otimista
        // (a Fisqal ignora campos extras); o cálculo de `valor_iss` já usa a
        // alíquota resolvida localmente, então a nota fica correta de qualquer forma.
        ...(issAliquota > 0 ? { aliquota: issAliquota } : {}),
      },
    };

    // ---- POST /v1/nfse (§8.1) com Idempotency-Key (§4).
    const created = await fisqal.post<{
      dpsId?: string;
      status?: string;
      fiscalRequestId?: string;
    }>("/v1/nfse", payload, idempotencyHeader(idempotencyKey));

    const fisqalDpsId = clean(created?.dpsId) || null;
    const fisqalRequestId = clean(created?.fiscalRequestId) || null;
    const status = clean(created?.status) || "pending";

    // ---- Grava a emissão (company_id carimbado — RLS exige).
    // STANDALONE: sem service_order_id, sem financial_transaction_id derivado de OS.
    const { data: emission, error: insertErr } = await supabase
      .from("nfse_emissions")
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        financial_transaction_id: null,
        status,
        fisqal_dps_id: fisqalDpsId,
        fisqal_fiscal_request_id: fisqalRequestId,
        idempotency_key: idempotencyKey,
        valor_servico: valorServico,
        valor_iss: valorIss,
        descricao_servico: discriminacao,
      })
      .select("*")
      .single();

    if (insertErr) {
      // Corrida: outra emissão com a mesma chave entrou em paralelo → devolve a existente.
      const { data: raced } = await supabase
        .from("nfse_emissions")
        .select("*")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        return jsonResponse(
          { emission: raced, already_emitted: true, message: "Nota fiscal já emitida." },
          200,
        );
      }
      console.error("[fisqal-emit-nfse] insert error", {
        company_id: companyId.slice(0, 8) + "...",
        message: insertErr.message,
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message:
            "A nota foi enviada para emissão, mas houve falha ao registrá-la. Consulte o status antes de tentar de novo.",
          fisqal_dps_id: fisqalDpsId,
        },
        500,
      );
    }

    // ---- Evento de auditoria.
    await supabase.from("nfse_events").insert({
      nfse_emission_id: emission.id,
      company_id: companyId,
      event_type: "emitida",
      status,
      payload: created ?? null,
    });

    return jsonResponse(
      {
        emission,
        already_emitted: false,
        message: "Nota fiscal enviada para emissão. Acompanhe o status.",
      },
      202,
    );
  } catch (err) {
    if (err instanceof FisqalConfigError) {
      return jsonResponse({ error: "fisqal_unconfigured", message: err.message }, 503);
    }
    if (err instanceof FisqalApiError) {
      return jsonResponse(
        {
          error: "fisqal_error",
          message: friendlyFiscalMessage(err.code, err.message),
          code: err.code,
        },
        err.status >= 400 && err.status < 600 ? err.status : 502,
      );
    }
    console.error("[fisqal-emit-nfse] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      {
        error: "internal_error",
        message: "Falha inesperada ao emitir a nota fiscal. Tente novamente.",
      },
      500,
    );
  }
});
