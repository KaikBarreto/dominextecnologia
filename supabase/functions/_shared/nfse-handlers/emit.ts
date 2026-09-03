// =============================================================================
// Handler de EMISSÃO de NFS-e (rotas: nfse-emit e a casca legada fisqal-emit-nfse).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Fluxo:
//   - Auth de tenant via fiscal-auth.ts.
//   - Body: { emissionId?, customerId, servico: {...}, valores: {...},
//             dataCompetencia?, idempotencyKey?, opSimpNac?, regApTribSN? }.
//     Overrides por nota têm precedência sobre o rascunho, que tem precedência
//     sobre os defaults da empresa em company_fiscal_settings.
//   - Carrega customers (tomador) + company_fiscal_settings (prestador) + companies.
//     NÃO lê service_orders — emissão é independente da Ordem de Serviço.
//   - Valida (422 PT-BR) ANTES de falar com o provedor.
//   - cTribMun (código da prefeitura, 3 díg.): body → rascunho → herança
//     inequívoca de `service_types.codigo_tributacao_municipal` pelo cTribNac.
//     Body fora do formato = 422 PT-BR; rascunho/herança fora do formato =
//     descarte silencioso (ver validarCTribMunDoBody em common.ts).
//   - Idempotência: idempotencyKey do body OU determinística
//     (company_id + customerId + valor + dataCompetencia). Tentativa que FALHOU
//     não bloqueia nova emissão: a linha é REAPROVEITADA (ver abaixo).
//   - Recusa da administração tributária NÃO some: vira linha `rejeitada` com o
//     motivo + evento com a resposta crua (ver `registrarTentativaFalha`).
//   - Monta a DPS no vocabulário do LAYOUT NACIONAL e entrega ao provedor ativo
//     (`getProvider(fiscal)`), que traduz para o seu próprio protocolo.
//   - Grava nfse_emissions + nfse_events (sempre escopado por company_id).
//
// ⚠️ REGRAS FISCAIS QUE NÃO PODEM REGREDIR (correções de 2026-09-02):
//   - `opSimpNac` derivado de `regime_tributario`; `regApTribSN` obrigatório
//     quando opSimpNac='3'.
//   - `tpRetIssqn` '1' = NÃO retido (o default estava invertido).
//   - Supressão de `aliquotaIssqn` na tripla opSimpNac='3' + regApTribSN='1' +
//     tpRetIssqn='1' (rejeição E0625), inclusive quando a alíquota vem do
//     fallback `company_fiscal_settings.iss_aliquota`.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import {
  friendlyFiscalMessage,
  getProvider,
  NfseProviderError,
  NfseProviderUnconfiguredError,
  NfseProviderUnsupportedError,
} from "../nfse-provider.ts";
import type {
  NfseProviderCtx,
  NfseResultado,
  NfseValores,
} from "../nfse-provider.ts";
import { NFSE_STATUS } from "../nfse-status.ts";
import {
  clean,
  cleanCTribMun,
  COL_CTRIBMUN,
  isUnknownColumnError,
  logId,
  onlyDigits,
  providerErrorResponse,
  validarCTribMunDoBody,
  withoutColumn,
} from "./common.ts";

const TAG = "[nfse-emit]";

/**
 * Status de TENTATIVA que não bloqueiam uma nova emissão com a mesma chave de
 * idempotência. Sem isto, a linha de rejeição criada abaixo viraria uma prisão:
 * o usuário corrige o dado, tenta de novo e recebe "nota já emitida" apontando
 * para a própria rejeição.
 */
const STATUS_DE_TENTATIVA_FALHA = new Set<string>([
  NFSE_STATUS.REJEITADA,
  NFSE_STATUS.FALHOU,
]);

/**
 * Status em que a nota JÁ FOI DOCUMENTO FISCAL: existiu, tem número e chave, e
 * tem guarda legal de 5 anos.
 *
 * Diferença crítica em relação a `STATUS_DE_TENTATIVA_FALHA`: uma tentativa
 * rejeitada nunca existiu para a administração tributária, então a linha pode
 * ser reaproveitada. Uma nota CANCELADA existiu — reaproveitar a linha apagaria
 * o histórico dela. Então aqui a gente NÃO reusa: cria linha nova com uma chave
 * de idempotência sufixada, e a nota cancelada fica intacta para sempre.
 *
 * Por que isto importa: cancelar e reemitir é operação fiscal NORMAL (errou o
 * valor, cancela e emite certo). Antes, a chave determinística
 * (empresa+cliente+valor+competência) fazia a reemissão bater na nota cancelada
 * e devolver "nota já emitida" — travando o usuário até o dia seguinte ou
 * obrigando-o a mudar o valor.
 */
const STATUS_JA_FOI_DOCUMENTO = new Set<string>([
  NFSE_STATUS.CANCELADA,
  NFSE_STATUS.CANCELAMENTO_PENDENTE,
]);

/**
 * Códigos de erro em que a nota NÃO chegou à administração tributária — falha de
 * pré-condição nossa ou da conta, não do documento.
 *
 * Estes NÃO viram linha em `nfse_emissions`: seriam ruído na lista do cliente
 * (uma "nota rejeitada" que a prefeitura nunca viu), e a tela já mostra o motivo
 * real, que é de configuração. O que precisa deixar rastro é a tentativa que
 * chegou a ser julgada — essa sim vira linha.
 *
 * ⚠️ `servico_indisponivel` entra aqui de propósito: quando o motor próprio ou o
 * governo está fora, o documento não foi processado e o usuário vai repetir em
 * seguida. Criar linha a cada tentativa encheria a lista de lixo.
 */
const ERROS_SEM_TENTATIVA = new Set<string>([
  // motor próprio — falham ANTES de transmitir
  "certificado_ausente",
  "certificado_ilegivel",
  "cnpj_ausente",
  "servico_indisponivel",
  // provedor intermediado — pré-condição da conta, não do documento
  "CERTIFICATE_INVALID",
  "COMPANY_INACTIVE",
  "COMPANY_PLAN_LIMIT",
  "RATE_LIMITED",
]);

/** `true` quando o erro representa RECUSA DO DOCUMENTO (e não indisponibilidade). */
export function ehRecusaDeDocumento(err: unknown): boolean {
  if (!(err instanceof NfseProviderError)) return false;
  if (ERROS_SEM_TENTATIVA.has(clean(err.codigo))) return false;
  return err.status === 400 || err.status === 422;
}

/** `true` quando a tentativa merece virar linha em `nfse_emissions`. */
export function deveRegistrarTentativa(err: unknown): boolean {
  // Integração não configurada / capacidade inexistente: não houve tentativa.
  if (err instanceof NfseProviderUnconfiguredError) return false;
  if (err instanceof NfseProviderUnsupportedError) return false;
  if (err instanceof NfseProviderError) {
    return !ERROS_SEM_TENTATIVA.has(clean(err.codigo));
  }
  // Erro inesperado (bug nosso): não sabemos se transmitiu. Registrar como
  // `falhou` é a leitura honesta — e é justamente o caso em que o rastro vale
  // mais, porque é o que ninguém previu.
  return true;
}

/** Valida YYYY-MM-DD; devolve a string limpa ou "" se inválida. */
function cleanDate(v: unknown): string {
  const s = clean(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * Idempotency-Key determinística estável por (company, cliente, valor, competência).
 * Combina com a UNIQUE (company_id, idempotency_key). NÃO depende da OS.
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

interface EmitBody {
  // emissionId: emite A PARTIR de um rascunho já salvo (status='rascunho').
  // Quando presente, o rascunho é a FONTE dos dados; o body sobrescreve campo a
  // campo se vier. Em vez de INSERT, a MESMA linha do rascunho "vira" emitida.
  emissionId?: string;
  customerId?: string;
  servico?: {
    descricao?: string;
    codigoServico?: string;
    codigoNbs?: string;
    // Município de incidência do ISSQN (IBGE, 7 dígitos). Ausente → rascunho →
    // município do emissor (fallback histórico).
    municipioIncidenciaIbge?: string;
    // cTribMun (3 dígitos) — código da prefeitura, complementar ao nacional.
    // number aceito porque campo numérico no front manda 101, não "101".
    codigoTributacaoMunicipal?: string | number;
  };
  valores?: {
    valorServico?: number | string;
    aliquotaIss?: number | string;
    // Alias histórico do front. Mesma precedência.
    aliquotaIssqn?: number | string;
    // tribIssqn: situação do ISSQN — enum '1'..'4'.
    tribIssqn?: string;
    // tpRetIssqn: tipo de retenção do ISSQN — enum '1'..'3' ('1' = NÃO retido).
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
  // Overrides fiscais por nota. Quando ausentes, derivamos de
  // company_fiscal_settings (regime_tributario / reg_ap_trib_sn).
  opSimpNac?: string;
  regApTribSN?: string;
}

/** Valor monetário/tributo (>= 0). `null` se ausente, inválido ou negativo. */
function parseNonNegative(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Alíquota (%) a partir de valor cru do body/banco. `null` se ausente/inválido. */
function parseAliquota(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Primeiro valor "presente" (ignora null/undefined/string vazia). */
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
 * Deriva `opSimpNac` do regime tributário do prestador.
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

/**
 * Herança do cTribMun a partir do CADASTRO DE TIPO DE SERVIÇO (fallback).
 *
 * ⚠️ Não existe vínculo direto nota↔tipo de serviço no schema: `service_order_id`
 * foi removida de `nfse_emissions` por decisão de produto (migration
 * 20260614150000) e a tela de nota escolhe o cTribNac num catálogo oficial, não
 * um tipo de serviço. O único elo confiável é o próprio cTribNac.
 *
 * Por isso a herança só acontece quando é INEQUÍVOCA: entre os tipos de serviço
 * ATIVOS do tenant com aquele cTribNac, todos os que têm cTribMun preenchido
 * apontam para o MESMO código. Divergência → não herda (carimbar o serviço errado
 * na prefeitura é pior que omitir e receber a rejeição E0312, que é legível).
 *
 * Qualquer falha de leitura (inclusive coluna ainda inexistente no banco) devolve
 * "" e a emissão segue: isto é um conforto, nunca um bloqueio.
 */
async function herdarCTribMunDoTipoDeServico(
  supabase: { from: (t: string) => any },
  companyId: string,
  codigoServico: string,
): Promise<string> {
  if (!codigoServico) return "";
  try {
    const { data, error } = await supabase
      .from("service_types")
      .select("codigo_tributacao_municipal")
      .eq("company_id", companyId)
      .eq("codigo_servico", codigoServico)
      .eq("is_active", true)
      .limit(50);
    if (error || !Array.isArray(data)) return "";
    const distintos = new Set<string>();
    for (const row of data) {
      const c = cleanCTribMun((row as Record<string, unknown>)?.codigo_tributacao_municipal);
      if (c) distintos.add(c);
    }
    return distintos.size === 1 ? [...distintos][0] : "";
  } catch {
    return "";
  }
}

export async function handleNfseEmit(req: Request): Promise<Response> {
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
      return jsonResponse({ error: "invalid_body", message: "Requisição inválida." }, 400);
    }

    // ---- Emissão A PARTIR de um rascunho (opcional).
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
          { error: "draft_not_found", message: "Rascunho não encontrado." },
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
    const valorServico = Number(body?.valores?.valorServico ?? draft?.valor_servico ?? 0);
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
    let idempotencyKey = clean(body?.idempotencyKey) ||
      deterministicKey(companyId, customerId, valorServico, dataCompetencia);

    // ---- Idempotência local: se já existe emissão com essa chave, devolve a existente.
    const { data: existing } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    // Tentativa anterior que FALHOU não bloqueia: a linha é reaproveitada pela
    // nova tentativa (UPDATE), em vez de virar 200 "já emitida" ou colidir com a
    // UNIQUE (company_id, idempotency_key) num INSERT.
    const tentativaAnterior = existing &&
        existing.id !== emissionId &&
        STATUS_DE_TENTATIVA_FALHA.has(clean(existing.status).toLowerCase())
      ? String(existing.id)
      : "";

    // Nota que já foi documento fiscal e foi cancelada: NÃO bloqueia a
    // reemissão e NÃO é reaproveitada. Geramos uma chave sufixada (#2, #3, ...)
    // para o INSERT novo não colidir com a UNIQUE, e a linha cancelada
    // permanece com seu número e sua chave de acesso.
    let reemissaoPosCancelamento = false;
    if (
      existing && existing.id !== emissionId &&
      STATUS_JA_FOI_DOCUMENTO.has(clean(existing.status).toLowerCase())
    ) {
      const base = idempotencyKey;
      const { data: irmas } = await supabase
        .from("nfse_emissions")
        .select("idempotency_key")
        .eq("company_id", companyId)
        .like("idempotency_key", `${base}%`);
      // A chave base conta como a #1. A próxima é o total + 1.
      const proxima = (irmas?.length ?? 1) + 1;
      idempotencyKey = `${base}#${proxima}`.slice(0, 512);
      reemissaoPosCancelamento = true;
      console.log(`${TAG} reemissao pos-cancelamento`, {
        company_id: logId(companyId),
        cancelada: logId(String(existing.id)),
        sequencia: proxima,
      });
    }

    if (
      existing && existing.id !== emissionId && !tentativaAnterior &&
      !reemissaoPosCancelamento
    ) {
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
    // (reemissão de nota existente NÃO consome cota) e ANTES de chamar o provedor.
    // O `error: "nfse_quota_exceeded"` é contrato com o front — não mudar.
    {
      const { data: quota, error: quotaErr } = await supabase.rpc("nfse_can_emit", {
        p_company_id: companyId,
      });
      if (quotaErr) {
        console.error(`${TAG} nfse_can_emit error`, {
          company_id: logId(companyId),
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

    // ---- Carrega tomador (cliente) + config fiscal do prestador + CNPJ da empresa.
    // `select("*")` em company_fiscal_settings: a linha inteira é o contexto do
    // provedor (NfseProviderCtx.fiscal) e o select tolera colunas novas (ex.
    // `provedor`) sem precisar de deploy sincronizado com a migration.
    const [{ data: customer }, { data: fiscal }, { data: companyRow }] = await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, name, company_name, customer_type, document, email, address, address_number, neighborhood, city, state, zip_code, ibge_municipality_code",
        )
        .eq("id", customerId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("company_fiscal_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
      // `email` entra no XML como `prest/email` — é o ÚNICO dado do prestador
      // além de CNPJ e regime que o layout nacional aceita quando ele é o
      // emitente (nome/endereço/IM são rejeitados: E0121/E0128/E0120).
      supabase.from("companies").select("cnpj, email").eq("id", companyId).maybeSingle(),
    ]);

    if (!customer) {
      return jsonResponse(
        { error: "customer_not_found", message: "Cliente não encontrado." },
        404,
      );
    }

    // ---- VALIDAÇÕES (422 PT-BR antes de falar com o provedor).
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

    const provider = getProvider(fiscal as Record<string, unknown>);

    // Registro prévio da empresa: exigência do provedor intermediado. O motor
    // próprio (governo) não tem cadastro — a credencial é o certificado A1.
    if (provider.registrarEmpresa && !clean(fiscal.fisqal_company_id)) {
      missing.push("Empresa não registrada na emissão fiscal");
    }

    // Código de serviço: body → rascunho → padrão da empresa.
    const codigoServico = clean(body?.servico?.codigoServico) ||
      clean(draft?.codigo_servico) ||
      clean(fiscal.codigo_servico_default);
    if (!codigoServico) missing.push("Código de serviço");
    if (!clean(fiscal.municipio_ibge)) missing.push("Código IBGE do município");

    // CNPJ do PRESTADOR (só dígitos) — obrigatório na DPS nacional.
    const cnpjPrestador = onlyDigits(companyRow?.cnpj);
    if (!cnpjPrestador) missing.push("CNPJ da empresa (prestador)");

    const tomadorDocumento = onlyDigits(customer?.document);
    if (!tomadorDocumento) missing.push("CPF/CNPJ do cliente");

    // Código NBS: body → rascunho → padrão da empresa. Obrigatório.
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

    // ---- cTribMun informado EXPLICITAMENTE nesta emissão: valida agora (422) em
    // vez de descartar. Roda depois da idempotência (nota já emitida continua
    // devolvendo 200) e ANTES da RPC de numeração — erro de formato não pode
    // queimar um número de DPS.
    const cTribMunBody = validarCTribMunDoBody(body?.servico?.codigoTributacaoMunicipal);
    if (cTribMunBody.erro) {
      return jsonResponse(
        { error: "invalid_ctribmun", message: cTribMunBody.erro },
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
    const razaoSocialTomador = clean(customer?.company_name) || clean(customer?.name) ||
      "Consumidor";
    // Discriminação: body → rascunho (descricao_servico) → fallback.
    const discriminacao = clean(body?.servico?.descricao) ||
      clean(draft?.descricao_servico) ||
      "Prestação de serviços técnicos.";

    // ---- Alíquota de ISS (%): body → rascunho → default da empresa.
    const issAliquota = parseAliquota(
      firstNonEmpty(body?.valores?.aliquotaIss, body?.valores?.aliquotaIssqn),
    ) ??
      parseAliquota(draft?.aliquota_issqn) ??
      parseAliquota(fiscal.iss_aliquota) ?? 0;
    const valorIss = issAliquota > 0
      ? Math.round(valorServico * (issAliquota / 100) * 100) / 100
      : null;

    // ---- numeroDps: RPC atômica SÓ AGORA (após TODAS as validações e a
    // checagem de idempotência). Reuso de emissão existente já retornou antes
    // deste ponto → não consome número de DPS.
    const codigoMunicipioEmissor = clean(fiscal.municipio_ibge);
    const tipoInscricaoPrestador = "2"; // 2 = CNPJ do prestador
    const serieDps = clean(fiscal.serie_dps) || "1"; // obrigatório: nunca undefined

    const { data: numeroDpsRaw, error: numeroErr } = await supabase.rpc(
      "fisqal_next_dps_number",
      { p_company_id: companyId },
    );
    if (numeroErr || numeroDpsRaw == null) {
      console.error(`${TAG} next_dps_number error`, {
        company_id: logId(companyId),
        message: numeroErr?.message ?? "null",
      });
      return jsonResponse(
        {
          error: "dps_number_failed",
          message: "Não foi possível gerar o número da nota. Tente novamente em instantes.",
        },
        500,
      );
    }
    const numeroDps = String(numeroDpsRaw);

    // ---- idDps: layout nacional da DPS (45 chars).
    // "DPS" + municipioEmissor(7) + tipoInscricaoPrestador(1) +
    // inscricaoFederalPrestador(14) + serieDps(5) + numeroDps(15) = 45.
    const idDps = "DPS" +
      padLeft(codigoMunicipioEmissor, 7) +
      tipoInscricaoPrestador +
      padLeft(cnpjPrestador, 14) +
      padLeft(serieDps, 5) +
      padLeft(numeroDps, 15);

    // ---- Simples Nacional (opSimpNac / regApTribSN).
    // '1' não optante · '2' optante MEI · '3' optante Simples (ME/EPP).
    // Derivado de regime_tributario; o body pode sobrescrever. Regime
    // desconhecido/ausente → NÃO enviamos o campo (não se chuta regime fiscal).
    const opSimpNacOverride = clean(body?.opSimpNac);
    const opSimpNac = /^[1-3]$/.test(opSimpNacOverride)
      ? opSimpNacOverride
      : opSimpNacFromRegime(fiscal.regime_tributario);

    // regApTribSN: obrigatório quando opSimpNac='3'.
    // '1' federais e municipal pelo SN · '2' federais pelo SN e ISSQN por fora ·
    // '3' ambos por fora do SN. Body → reg_ap_trib_sn da empresa → '1'.
    let regApTribSN: string | null = null;
    if (opSimpNac === "3") {
      const regOverride = clean(body?.regApTribSN);
      const regDefault = clean(fiscal.reg_ap_trib_sn);
      regApTribSN = /^[1-3]$/.test(regOverride)
        ? regOverride
        : (/^[1-3]$/.test(regDefault) ? regDefault : "1");
    }

    // ---- Retenção do ISSQN (tpRetIssqn): '1' NÃO retido · '2' retido pelo
    // tomador · '3' retido pelo intermediário. body → rascunho.
    // `tpRetIssqnInformado` = "" quando ninguém informou (NÃO enviamos o campo e o
    // layout nacional trata como não retido). `tpRetIssqnEfetivo` é o valor que
    // vale na prática — usado só para decidir a supressão da alíquota (abaixo).
    const tpRetIssqnInformado = (() => {
      const t = clean(body?.valores?.tpRetIssqn) || clean(draft?.tp_ret_issqn);
      return /^[1-3]$/.test(t) ? t : "";
    })();
    const tpRetIssqnEfetivo = tpRetIssqnInformado || "1";

    // ---- E0625 — "Não é permitido informar alíquota quando não há indicação de
    // retenção do ISSQN". `aliquotaIssqn` é dispensada (e omitida no XML) para
    // ME/EPP no SN sem retenção (opSimpNac=3, regApTribSN=1, tpRetIssqn=1).
    //
    // ⚠️ NÃO GENERALIZAR. A supressão vale SÓ para essa TRIPLA exata. Empresa fora
    // do Simples (ou no SN com regApTribSN 2/3, ou com ISS retido) precisa informar
    // a alíquota — suprimir nesses casos quebraria a nota. Este bloco existe porque
    // a alíquota também vem do default da empresa (iss_aliquota), então "campo em
    // branco na tela" NÃO impede o envio.
    const suprimeAliquotaIssqn = opSimpNac === "3" &&
      regApTribSN === "1" &&
      tpRetIssqnEfetivo === "1";

    // ---- Bloco `valores` no vocabulário do layout nacional.
    // Campo AUSENTE = não enviar (diferente de zero).
    const valores: NfseValores = { valorServico };
    if (issAliquota > 0) {
      // A supressão da E0625 leva SÓ a alíquota; `tribIssqn` continua sendo enviado.
      if (!suprimeAliquotaIssqn) valores.aliquotaIssqn = issAliquota;
      valores.tribIssqn = "1"; // default: operação normal tributada
    }
    // Situação do ISSQN: body → rascunho (trib_issqn). Enum válido ('1'..'4').
    {
      const t = clean(body?.valores?.tribIssqn) || clean(draft?.trib_issqn);
      if (/^[1-4]$/.test(t)) valores.tribIssqn = t;
    }
    // Só enviamos tpRetIssqn quando realmente informado.
    if (tpRetIssqnInformado) valores.tpRetIssqn = tpRetIssqnInformado;
    // Tributos federais (só quando presentes e > 0). body → rascunho.
    {
      const pis = parseNonNegative(body?.valores?.valorPis ?? draft?.valor_pis);
      if (pis != null && pis > 0) valores.valorPis = pis;
      const cofins = parseNonNegative(body?.valores?.valorCofins ?? draft?.valor_cofins);
      if (cofins != null && cofins > 0) valores.valorCofins = cofins;
      const csll = parseNonNegative(body?.valores?.valorCsll ?? draft?.valor_csll);
      if (csll != null && csll > 0) valores.valorCsll = csll;
    }
    // Percentual total de tributos (Simples Nacional): body → rascunho.
    {
      const pct = parseNonNegative(
        firstNonEmpty(
          body?.valores?.percentualTotalTributosSimplesNacional,
          body?.valores?.percentualTribSn,
          draft?.percentual_trib_sn,
        ),
      );
      if (pct != null) valores.percentualTotalTributosSimplesNacional = pct;
    }

    // ISS registrado na NOSSA linha: quando a alíquota é suprimida (E0625), a nota
    // não carrega ISS destacado — a empresa recolhe pelo DAS. Gravar valor aqui
    // viraria número fantasma no relatório.
    const valorIssRegistrado = suprimeAliquotaIssqn ? null : valorIss;

    // ---- Município de incidência do ISSQN.
    // body → rascunho → município do emissor (fallback).
    const municipioIncidencia = cleanIbge(body?.servico?.municipioIncidenciaIbge) ||
      cleanIbge(draft?.municipio_incidencia_ibge) ||
      codigoMunicipioEmissor;

    // ---- cTribMun (código de tributação municipal, 3 dígitos).
    // Precedência: override por nota (body, já validado) → rascunho → tipo de
    // serviço do tenant (herança inequívoca por cTribNac). Em NENHUM caso um
    // valor fora do formato chega à prefeitura.
    // Sem cTribMun a nota tende a ser rejeitada com E0312 nos municípios que
    // administram o código; não bloqueamos aqui porque nem todo município exige.
    // O valor do body já foi validado acima (422 se o usuário mandou lixo);
    // rascunho e herança passam por descarte silencioso de propósito.
    const codigoTributacaoMunicipal = cTribMunBody.valor ||
      cleanCTribMun(draft?.codigo_tributacao_municipal) ||
      await herdarCTribMunDoTipoDeServico(supabase, companyId, codigoServico);

    // ---- Persistência da linha: SUCESSO e FRACASSO passam pelo mesmo caminho.
    //
    // Alvo do UPDATE (quando existe):
    //   - `emissionId`      → rascunho que está virando emissão;
    //   - `tentativaAnterior` → linha de tentativa que falhou e será reaproveitada.
    // Sem alvo → INSERT.
    const alvoId = emissionId || tentativaAnterior;

    const camposComuns: Record<string, unknown> = {
      customer_id: customer.id,
      idempotency_key: idempotencyKey,
      valor_servico: valorServico,
      valor_iss: valorIssRegistrado,
      descricao_servico: discriminacao,
      // Registra o cTribMun EFETIVAMENTE enviado (pode ter vindo da herança do
      // tipo de serviço) — a linha tem que espelhar o que foi à prefeitura.
      [COL_CTRIBMUN]: codigoTributacaoMunicipal || null,
    };

    /**
     * Grava a linha da emissão, seja qual for o desfecho.
     *
     * O `.eq("status", ...)` no UPDATE é guarda de corrida: só sobrescreve a
     * linha que ainda está no estado que esperávamos. Uma nota que virou
     * autorizada entre a leitura e a escrita NUNCA é rebaixada por aqui.
     *
     * O retry sem a coluna do cTribMun cobre a janela de deploy em que a edge
     * já subiu e a migration não: perder um campo OPCIONAL é muito melhor que
     * perder o registro de uma nota que já foi enviada ao provedor.
     */
    const persistirLinha = async (
      extra: Record<string, unknown>,
    ): Promise<{ row: Record<string, any> | null; err: { message: string } | null }> => {
      if (alvoId) {
        const payload: Record<string, unknown> = {
          ...camposComuns,
          ...extra,
          updated_at: new Date().toISOString(),
        };
        const runUpdate = (p: Record<string, unknown>) => {
          const base = supabase
            .from("nfse_emissions")
            .update(p)
            .eq("id", alvoId)
            .eq("company_id", companyId);
          return (emissionId
            ? base.eq("status", "rascunho")
            : base.in("status", [...STATUS_DE_TENTATIVA_FALHA]))
            .select("*")
            .maybeSingle();
        };
        let { data, error } = await runUpdate(payload);
        if (error && isUnknownColumnError(error, COL_CTRIBMUN)) {
          ({ data, error } = await runUpdate(withoutColumn(payload, COL_CTRIBMUN)));
        }
        return { row: data ?? null, err: error };
      }

      // STANDALONE: sem service_order_id, sem financial_transaction_id de OS.
      const payload: Record<string, unknown> = {
        company_id: companyId,
        financial_transaction_id: null,
        ...camposComuns,
        ...extra,
      };
      const runInsert = (p: Record<string, unknown>) =>
        supabase.from("nfse_emissions").insert(p).select("*").single();
      let { data, error } = await runInsert(payload);
      if (error && isUnknownColumnError(error, COL_CTRIBMUN)) {
        ({ data, error } = await runInsert(withoutColumn(payload, COL_CTRIBMUN)));
      }
      return { row: data ?? null, err: error };
    };

    /**
     * Registra a TENTATIVA que não virou nota.
     *
     * ⚠️ Isto existe por causa de um diagnóstico real: quando a emissão falha, o
     * usuário levava um toast e a nota SUMIA — sem rastro de que tentou nem do
     * motivo. Foi a resposta crua guardada em `nfse_events` que permitiu
     * descobrir, em 2026-09-02, que o provedor antigo roteava o Rio de Janeiro
     * para um endpoint morto. Sem linha, aquele diagnóstico seria impossível.
     *
     * Não pode derrubar a resposta ao usuário: falha ao registrar vai para o log
     * e o erro original segue seu caminho.
     */
    const registrarTentativaFalha = async (err: unknown): Promise<void> => {
      const recusa = ehRecusaDeDocumento(err);
      const statusFalha = recusa ? NFSE_STATUS.REJEITADA : NFSE_STATUS.FALHOU;
      const codigo = err instanceof NfseProviderError ? clean(err.codigo) : "";
      // Mesma mensagem PT-BR que o usuário vê na tela — a linha não pode contar
      // uma história diferente do toast.
      const mensagem = err instanceof NfseProviderError
        ? friendlyFiscalMessage(err.codigo, err.message)
        : "Falha inesperada ao emitir a nota fiscal.";

      try {
        const { row, err: erroGravacao } = await persistirLinha({
          status: statusFalha,
          error_message: mensagem,
          ...(emissionId ? { emitida_em: new Date().toISOString() } : {}),
        });

        if (erroGravacao || !row) {
          console.error(`${TAG} falha ao registrar tentativa`, {
            company_id: logId(companyId),
            status: statusFalha,
            message: erroGravacao?.message ?? "linha não persistida",
          });
          return;
        }

        // A resposta CRUA do provedor é o ouro do diagnóstico. Fica no evento
        // (append-only), nunca na tela.
        await supabase.from("nfse_events").insert({
          nfse_emission_id: row.id,
          company_id: companyId,
          event_type: statusFalha,
          status: statusFalha,
          payload: {
            codigo: codigo || null,
            mensagem,
            provedor: provider.nome,
            raw: err instanceof NfseProviderError ? (err.raw ?? null) : null,
          },
        });
      } catch (erroInterno) {
        console.error(`${TAG} falha ao registrar tentativa`, {
          company_id: logId(companyId),
          message: (erroInterno as Error)?.message ?? String(erroInterno),
        });
      }
    };

    // ---- Entrega ao provedor ativo.
    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: fiscal as Record<string, unknown>,
    };

    let resultado: NfseResultado;
    try {
      resultado = await provider.emitir(ctx, {
        idempotencyKey,
        dps: {
          idDps,
          serieDps,
          numeroDps,
          dataCompetencia,
          codigoMunicipioEmissor,
          tipoInscricaoPrestador,
          inscricaoFederalPrestador: cnpjPrestador,
          opSimpNac,
          regApTribSN,
          emailPrestador: clean(companyRow?.email) || null,
        },
        tomador: {
          tipoInscricao: tomadorTipoInscricao,
          inscricaoFederal: tomadorDocumento,
          razaoSocial: razaoSocialTomador,
          email: clean(customer?.email) || undefined,
          // Endereço do CLIENTE (nunca do prestador). O provedor intermediado
          // ignora; o motor próprio manda no XML quando disponível.
          endereco: {
            municipioIbge: cleanIbge(customer?.ibge_municipality_code) || undefined,
            cep: onlyDigits(customer?.zip_code) || undefined,
            logradouro: clean(customer?.address) || undefined,
            numero: clean(customer?.address_number) || undefined,
            bairro: clean(customer?.neighborhood) || undefined,
          },
        },
        servico: {
          codigoServico,
          codigoNbs,
          municipioIncidencia,
          discriminacao,
          codigoTributacaoMunicipal: codigoTributacaoMunicipal || undefined,
        },
        valores,
      });
    } catch (err) {
      // Recusa da prefeitura / falha do provedor: a TENTATIVA não pode sumir.
      // O número de DPS já foi consumido e continua consumido — buraco na
      // numeração de DPS não é infração; perder o registro da tentativa é que
      // deixa o cliente (e nós) sem diagnóstico.
      if (deveRegistrarTentativa(err)) await registrarTentativaFalha(err);
      // A resposta ao usuário continua sendo a do catch externo (PT-BR amigável).
      throw err;
    }

    const referencia = resultado.referencia ?? null;
    const requisicaoId = resultado.requisicaoId ?? null;
    const status = resultado.status || NFSE_STATUS.PENDENTE;

    // ---- Provedor SÍNCRONO (motor próprio): a nota já volta autorizada, com
    // número e chave. Gravar agora evita a janela em que a tela mostra
    // "autorizada" sem número até alguém consultar o status.
    // Provedor assíncrono nunca entra aqui (ele devolve "pendente").
    const dadosAutorizacao: Record<string, unknown> = {};
    if (status === NFSE_STATUS.AUTORIZADA) {
      if (resultado.numero) dadosAutorizacao.numero_nfse = resultado.numero;
      if (resultado.chaveAcesso) dadosAutorizacao.chave_acesso = resultado.chaveAcesso;
      if (resultado.protocolo) dadosAutorizacao.protocolo = resultado.protocolo;
      dadosAutorizacao.emitida_em = resultado.emitidaEm || new Date().toISOString();
    }

    // ---- Grava a emissão (company_id carimbado — RLS exige).
    const { row: emission, err: insertErr } = await persistirLinha({
      status,
      fisqal_dps_id: referencia,
      fisqal_fiscal_request_id: requisicaoId,
      // Retentativa que agora deu certo: o motivo da falha anterior sai da linha.
      error_message: null,
      // Mantém o comportamento histórico: rascunho que vira emissão carimba a
      // data; emissão standalone só carimba quando o provedor já autorizou.
      ...(emissionId ? { emitida_em: new Date().toISOString() } : {}),
      ...dadosAutorizacao,
    });

    if (insertErr || !emission) {
      // Corrida: outra emissão com a mesma chave entrou em paralelo → devolve a existente.
      const { data: raced } = await supabase
        .from("nfse_emissions")
        .select("*")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        // A linha pode ser uma TENTATIVA que falhou (rejeitada/falhou), não uma
        // nota emitida — dizer "já emitida" nesse caso seria mentira na tela.
        const racedFalhou = STATUS_DE_TENTATIVA_FALHA.has(
          clean(raced.status).toLowerCase(),
        );
        return jsonResponse(
          {
            emission: raced,
            already_emitted: !racedFalhou,
            message: racedFalhou
              ? "Já existe uma tentativa registrada para este cliente e valor. Confira o motivo na lista de notas."
              : "Nota fiscal já emitida.",
          },
          200,
        );
      }
      console.error(`${TAG} persist error`, {
        company_id: logId(companyId),
        message: insertErr?.message ?? "row not persisted",
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message:
            "A nota foi enviada para emissão, mas houve falha ao registrá-la. Consulte o status antes de tentar de novo.",
          fisqal_dps_id: referencia,
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
      payload: resultado.raw ?? null,
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
    // Erro do provedor: mensagem amigável PT-BR (friendlyFiscalMessage).
    const providerResp = providerErrorResponse(err, { friendly: true });
    if (providerResp) return providerResp;

    console.error(`${TAG} unexpected error`, {
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
}
