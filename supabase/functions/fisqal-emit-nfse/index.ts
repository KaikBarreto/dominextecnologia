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
import { mapNfseStatus, NFSE_STATUS } from "../_shared/nfse-status.ts";

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
  // emissionId: emite A PARTIR de um rascunho já salvo (status='rascunho').
  // Quando presente, o rascunho é a FONTE dos dados; o body sobrescreve campo a
  // campo se vier. Em vez de INSERT, a MESMA linha do rascunho "vira" emitida.
  // Ausente → comportamento standalone original (INSERT novo). Ver bloco emitFromDraft.
  emissionId?: string;
  customerId?: string;
  servico?: {
    descricao?: string;
    codigoServico?: string;
    codigoNbs?: string;
    // Município de incidência do ISSQN (IBGE, 7 dígitos). Ausente → rascunho →
    // município do emissor (fallback histórico).
    municipioIncidenciaIbge?: string;
  };
  // aliquotaIss: override da alíquota de ISS por nota (em %, ex.: 5 = 5%).
  // Mora em `valores` por ser um parâmetro de cálculo do valor da nota.
  //
  // Os demais campos abaixo são overrides OPCIONAIS que mapeiam 1:1 pros nomes
  // reais do NfseValoresDto da Fisqal (§8.1) — forward-compat para as próximas
  // ondas do frontend. Só entram no payload se vierem e forem válidos.
  valores?: {
    valorServico?: number | string;
    aliquotaIss?: number | string;
    // Alias do front (NovaNotaModal manda o nome real da Fisqal). Mesma precedência.
    aliquotaIssqn?: number | string;
    // tribIssqn: situação do ISSQN — enum '1'..'4' (1=operação normal tributada,
    // 2=exportação, 3=imunidade, 4=não incidência). Sobrescreve o default '1'.
    tribIssqn?: string;
    // tpRetIssqn: tipo de retenção do ISSQN (ISS retido na fonte) — enum '1'..'3'.
    tpRetIssqn?: string;
    valorPis?: number | string;
    valorCofins?: number | string;
    valorCsll?: number | string;
    percentualTotalTributosSimplesNacional?: number | string;
    // Alias do front pro mesmo campo acima. Mesma precedência.
    percentualTribSn?: number | string;
  };
  dataCompetencia?: string;
  idempotencyKey?: string;
  // Overrides fiscais por nota (enums do CreateNfseDpsDto). Quando ausentes,
  // derivamos de company_fiscal_settings (regime_tributario / reg_ap_trib_sn).
  opSimpNac?: string;
  regApTribSN?: string;
}

/**
 * Resolve um valor monetário/tributo (>= 0) a partir de um valor cru do body.
 * Retorna `null` se ausente, inválido ou negativo.
 */
function parseNonNegative(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
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

/**
 * Primeiro valor "presente" de uma lista (ignora null/undefined/string vazia).
 * Usado pra aceitar ALIASES de campo do body (contrato do front x contrato da
 * Fisqal) sem dar precedência artificial a um valor vazio.
 */
function firstNonEmpty(...vals: unknown[]): unknown {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

/** Valida código IBGE de município (7 dígitos). Retorna "" se inválido. */
function cleanIbge(v: unknown): string {
  const s = clean(v);
  return /^\d{7}$/.test(s) ? s : "";
}

/**
 * Deriva `opSimpNac` (CreateNfseDpsDto) do regime tributário do prestador.
 *   '1' = não optante · '2' = optante MEI · '3' = optante Simples (ME/EPP).
 * Regime ausente/desconhecido → null (NÃO enviamos o campo; não se chuta regime).
 */
function opSimpNacFromRegime(regime: unknown): string | null {
  switch (clean(regime).toLowerCase()) {
    case "simples_nacional":
      return "3";
    case "mei":
      return "2";
    case "lucro_presumido":
    case "lucro_real":
      return "1";
    default:
      return null;
  }
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

    // ---- Emissão A PARTIR de um rascunho (opcional). Quando `emissionId` vem,
    // carregamos a linha status='rascunho' do PRÓPRIO tenant e a usamos como FONTE
    // (customer, valores ricos, códigos, município, descrição, competência). O body
    // ainda pode sobrescrever campo a campo. No fim, em vez de INSERT, damos UPDATE
    // nessa MESMA linha (ver bloco de persistência). Sem emissionId → comportamento
    // standalone original 100% preservado.
    const emissionId = clean(body?.emissionId);
    let draft: Record<string, any> | null = null;
    if (emissionId) {
      const { data: draftRow } = await supabase
        .from("nfse_emissions")
        .select("*")
        .eq("id", emissionId)
        .eq("company_id", companyId)
        .eq("status", "rascunho")
        .maybeSingle();
      if (!draftRow) {
        return jsonResponse(
          {
            error: "draft_not_found",
            message: "Rascunho não encontrado.",
          },
          404,
        );
      }
      draft = draftRow;
    }

    // customerId: body sobrescreve; senão vem do rascunho.
    const customerId = clean(body?.customerId) || clean(draft?.customer_id);
    if (!customerId) {
      return jsonResponse(
        { error: "missing_customer", message: "Cliente não informado." },
        400,
      );
    }

    // valorServico: body sobrescreve; senão vem do rascunho.
    const valorServico = Number(
      body?.valores?.valorServico ?? draft?.valor_servico ?? 0,
    );
    if (!(valorServico > 0)) {
      return jsonResponse(
        { error: "invalid_value", message: "Informe um valor de serviço maior que zero." },
        400,
      );
    }

    // dataCompetencia: body (YYYY-MM-DD) OU rascunho OU hoje.
    const dataCompetencia = cleanDate(body?.dataCompetencia) ||
      cleanDate(draft?.data_competencia) ||
      new Date().toISOString().slice(0, 10);

    // ---- Idempotency-Key: body OU determinística estável (sem OS).
    const idempotencyKey = clean(body?.idempotencyKey) ||
      deterministicKey(companyId, customerId, valorServico, dataCompetencia);

    // ---- Idempotência local: se já existe emissão com essa chave, devolve a existente.
    // Emitindo de rascunho: só é "reuso" se a linha achada NÃO for este próprio
    // rascunho (o rascunho ainda tem idempotency_key=null, então não colide sozinho;
    // mas se OUTRA nota já foi emitida com essa chave determinística, devolvemos ela).
    const { data: existing } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing && existing.id !== emissionId) {
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
            "fisqal_company_id, codigo_servico_default, item_lc116, iss_aliquota, serie_dps, ultimo_numero_dps, municipio_ibge, pode_emitir, fiscal_ambiente, inscricao_municipal, codigo_nbs_default, regime_tributario, reg_ap_trib_sn",
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

    // Código de serviço: body → rascunho → padrão da empresa.
    const codigoServico = clean(body?.servico?.codigoServico) ||
      clean(draft?.codigo_servico) ||
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

    // Código NBS do serviço: body → rascunho → padrão da empresa. Obrigatório (servico.required).
    const codigoNbs = clean(body?.servico?.codigoNbs) ||
      clean(draft?.codigo_nbs) ||
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
    // Discriminação: body → rascunho (descricao_servico) → fallback.
    const discriminacao = clean(body?.servico?.descricao) ||
      clean(draft?.descricao_servico) ||
      "Prestação de serviços técnicos.";

    // ---- Alíquota de ISS (%): body (valores.aliquotaIss) → rascunho (aliquota_issqn)
    // → default da empresa (company_fiscal_settings.iss_aliquota).
    // B5: `aliquotaIss` é o nome canônico do NOSSO contrato de edge (e o que o
    // front manda). `aliquotaIssqn` (nome do campo na Fisqal) é aceito como alias
    // tolerante, com a mesma precedência, pra não quebrar chamador antigo.
    const issAliquota = parseAliquota(
      firstNonEmpty(body?.valores?.aliquotaIss, body?.valores?.aliquotaIssqn),
    ) ??
      parseAliquota(draft?.aliquota_issqn) ??
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

    // ---- idDps: layout nacional da DPS (45 chars, conferido contra o layout nacional).
    // "DPS" + codigoMunicipioEmissor(7) + tipoInscricaoPrestador(1) +
    // inscricaoFederalPrestador zero-padded em 14 + serieDps zero-padded em 5 +
    // numeroDps zero-padded em 15 = 3 + 7 + 1 + 14 + 5 + 15 = 45 chars.
    const idDps = "DPS" +
      padLeft(codigoMunicipioEmissor, 7) +
      tipoInscricaoPrestador +
      padLeft(cnpjPrestador, 14) +
      padLeft(serieDps, 5) +
      padLeft(numeroDps, 15);

    // ---- Simples Nacional (opSimpNac / regApTribSN).
    // opSimpNac: '1' não optante · '2' optante MEI · '3' optante Simples (ME/EPP).
    // Derivado de company_fiscal_settings.regime_tributario; o body pode sobrescrever.
    // Regime desconhecido/ausente → NÃO enviamos o campo (não se chuta regime fiscal).
    const opSimpNacOverride = clean(body?.opSimpNac);
    const opSimpNac = /^[1-3]$/.test(opSimpNacOverride)
      ? opSimpNacOverride
      : opSimpNacFromRegime(fiscal.regime_tributario);

    // regApTribSN: obrigatório quando opSimpNac='3' (OpenAPI CreateNfseDpsDto).
    // '1' federais e municipal pelo SN · '2' federais pelo SN e ISSQN por fora ·
    // '3' ambos por fora do SN. Body → company_fiscal_settings.reg_ap_trib_sn → '1'.
    let regApTribSN: string | null = null;
    if (opSimpNac === "3") {
      const regOverride = clean(body?.regApTribSN);
      const regDefault = clean(fiscal.reg_ap_trib_sn);
      regApTribSN = /^[1-3]$/.test(regOverride)
        ? regOverride
        : (/^[1-3]$/.test(regDefault) ? regDefault : "1");
    }

    // ---- Tipo de retenção do ISSQN (tpRetIssqn): '1' NÃO retido · '2' retido pelo
    // tomador · '3' retido pelo intermediário. body → rascunho.
    // `tpRetIssqnInformado` = "" quando ninguém informou (aí NÃO enviamos o campo e
    // o layout nacional trata como não retido). `tpRetIssqnEfetivo` é o valor que
    // vale na prática — usado só para decidir a supressão da alíquota (abaixo).
    const tpRetIssqnInformado = (() => {
      const t = clean(body?.valores?.tpRetIssqn) || clean(draft?.tp_ret_issqn);
      return /^[1-3]$/.test(t) ? t : "";
    })();
    const tpRetIssqnEfetivo = tpRetIssqnInformado || "1";

    // ---- E0625 — "Não é permitido informar alíquota quando não há indicação de
    // retenção do ISSQN". O OpenAPI da Fisqal é explícito: `aliquotaIssqn` é
    // "dispensada (e omitida no XML) para ME/EPP no SN sem retenção
    // (opSimpNac=3, regApTribSN=1, tpRetIssqn=1)".
    //
    // ⚠️ NÃO GENERALIZAR. A supressão vale SÓ para essa TRIPLA exata. Empresa fora
    // do Simples (ou no SN com regApTribSN 2/3, ou com ISS retido) precisa informar
    // a alíquota — suprimir nesses casos quebraria a nota. Este bloco existe porque
    // a alíquota também vem do default da empresa (company_fiscal_settings.
    // iss_aliquota), então "campo em branco na tela" NÃO impede o envio.
    const suprimeAliquotaIssqn = opSimpNac === "3" &&
      regApTribSN === "1" &&
      tpRetIssqnEfetivo === "1";

    // ---- Monta o bloco `valores` (NfseValoresDto §8.1) com os NOMES REAIS da Fisqal.
    // `valorServico` é obrigatório. Quando há alíquota de ISS resolvida (> 0),
    // enviamos `aliquotaIssqn` (nome correto — o campo antigo `aliquota` era ignorado
    // pela Fisqal) e `tribIssqn` = '1' (operação normal tributada) por padrão.
    // Os demais campos entram só quando o body os traz e são válidos.
    const valoresPayload: Record<string, unknown> = { valorServico };
    if (issAliquota > 0) {
      // A supressão da E0625 leva SÓ a alíquota; `tribIssqn` continua sendo enviado.
      if (!suprimeAliquotaIssqn) valoresPayload.aliquotaIssqn = issAliquota;
      valoresPayload.tribIssqn = "1"; // default: operação normal tributada
    }
    // Situação do ISSQN: body → rascunho (trib_issqn). Enum válido ('1'..'4').
    {
      const t = clean(body?.valores?.tribIssqn) || clean(draft?.trib_issqn);
      if (/^[1-4]$/.test(t)) valoresPayload.tribIssqn = t;
    }
    // Só enviamos tpRetIssqn quando ele foi realmente informado (comportamento
    // preservado: ausência = omitido, e o padrão nacional entende "não retido").
    if (tpRetIssqnInformado) valoresPayload.tpRetIssqn = tpRetIssqnInformado;
    // Tributos federais (só quando presentes e > 0). body → rascunho.
    {
      const pis = parseNonNegative(body?.valores?.valorPis ?? draft?.valor_pis);
      if (pis != null && pis > 0) valoresPayload.valorPis = pis;
      const cofins = parseNonNegative(
        body?.valores?.valorCofins ?? draft?.valor_cofins,
      );
      if (cofins != null && cofins > 0) valoresPayload.valorCofins = cofins;
      const csll = parseNonNegative(body?.valores?.valorCsll ?? draft?.valor_csll);
      if (csll != null && csll > 0) valoresPayload.valorCsll = csll;
    }
    // Percentual total de tributos (Simples Nacional): body → rascunho (percentual_trib_sn).
    {
      // B5: front manda `percentualTribSn`; contrato antigo era o nome longo.
      const pct = parseNonNegative(
        firstNonEmpty(
          body?.valores?.percentualTotalTributosSimplesNacional,
          body?.valores?.percentualTribSn,
          draft?.percentual_trib_sn,
        ),
      );
      if (pct != null) {
        valoresPayload.percentualTotalTributosSimplesNacional = pct;
      }
    }

    // ISS registrado na NOSSA linha: quando a alíquota é suprimida (E0625), a nota
    // não carrega ISS destacado — a empresa recolhe pelo DAS. Gravar valor aqui
    // viraria número fantasma no relatório.
    const valorIssRegistrado = suprimeAliquotaIssqn ? null : valorIss;

    // ---- B6: município de incidência do ISSQN.
    // body → rascunho (municipio_incidencia_ibge) → município do emissor (fallback).
    const municipioIncidencia = cleanIbge(body?.servico?.municipioIncidenciaIbge) ||
      cleanIbge(draft?.municipio_incidencia_ibge) ||
      codigoMunicipioEmissor;

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
      // Simples Nacional (só entram quando resolvidos — ver bloco acima).
      ...(opSimpNac ? { opSimpNac } : {}),
      ...(regApTribSN ? { regApTribSN } : {}),
      tomador: {
        tipoInscricao: tomadorTipoInscricao,
        inscricaoFederal: tomadorDocumento,
        razaoSocial: razaoSocialTomador,
        email: clean(customer?.email) || undefined,
      },
      servico: {
        codigoServico,
        codigoNbs,
        municipioIncidencia,
        discriminacao,
      },
      valores: valoresPayload,
    };

    // ---- POST /v1/nfse (§8.1) com Idempotency-Key (§4).
    const created = await fisqal.post<{
      dpsId?: string;
      status?: string;
      fiscalRequestId?: string;
    }>("/v1/nfse", payload, idempotencyHeader(idempotencyKey));

    const fisqalDpsId = clean(created?.dpsId) || null;
    const fisqalRequestId = clean(created?.fiscalRequestId) || null;
    // Status SEMPRE no vocabulário canônico PT-BR (a Fisqal devolve em inglês e a
    // UI/RPC de listagem só entendem PT-BR). Ver _shared/nfse-status.ts.
    const status = mapNfseStatus(created?.status, NFSE_STATUS.PENDENTE);

    // ---- Grava a emissão (company_id carimbado — RLS exige).
    // Emitindo de rascunho (emissionId) → UPDATE da MESMA linha: a nota "vira" emitida
    // no mesmo registro (mantém o id do rascunho). Standalone (sem emissionId) → INSERT
    // novo, comportamento original preservado.
    let emission: Record<string, any> | null = null;
    let insertErr: { message: string } | null = null;

    if (emissionId) {
      const { data: updated, error: updateErr } = await supabase
        .from("nfse_emissions")
        .update({
          customer_id: customer.id,
          status,
          fisqal_dps_id: fisqalDpsId,
          fisqal_fiscal_request_id: fisqalRequestId,
          idempotency_key: idempotencyKey,
          valor_servico: valorServico,
          valor_iss: valorIssRegistrado,
          descricao_servico: discriminacao,
          emitida_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        // Escopo: só este rascunho, deste tenant, ainda em rascunho.
        .eq("id", emissionId)
        .eq("company_id", companyId)
        .eq("status", "rascunho")
        .select("*")
        .maybeSingle();
      emission = updated ?? null;
      insertErr = updateErr;
    } else {
      // STANDALONE: sem service_order_id, sem financial_transaction_id derivado de OS.
      const { data: inserted, error: insErr } = await supabase
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
          valor_iss: valorIssRegistrado,
          descricao_servico: discriminacao,
        })
        .select("*")
        .single();
      emission = inserted ?? null;
      insertErr = insErr;
    }

    if (insertErr || !emission) {
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
      console.error("[fisqal-emit-nfse] persist error", {
        company_id: companyId.slice(0, 8) + "...",
        message: insertErr?.message ?? "row not persisted",
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
