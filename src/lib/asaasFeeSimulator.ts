// ─────────────────────────────────────────────────────────────────────────────
// asaasFeeSimulator — helper PURO (sem React, sem fetch) que simula quanto
// sobra de uma venda depois da taxa da Asaas, com e sem antecipação.
//
// Usado pelo Simulador de venda (Configurações > Integrações) e pelo preview de
// repasse do modal de Nova cobrança. É a ÚNICA fórmula de gross-up do front —
// `grossUpForCustomer` mora aqui e o hook `useTenantCardFees` só reexporta.
//
// ⚠️  ESTIMATIVA. O valor autoritativo do gross-up é calculado no edge
// `tenant-asaas-create-charge` (server-side, com a taxa lida do Vault). Esta
// tela nunca é contratual.
//
// ── Base factual (verificado em 2026-09-06 contra a API real da Asaas) ───────
//
// 1) Taxa de cartão parcelado: a Asaas cobra o percentual da faixa sobre o
//    TOTAL e a tarifa fixa (operationValue) UMA vez por cobrança — não por
//    parcela. Provado: R$ 1.000 em 10x (faixa até 12x = 2,99% + R$ 0,49)
//    devolveu netValue R$ 96,97 por parcela e R$ 969,70 no total
//    → 1000 × 2,99% + 0,49 = 30,39, dividido por 10 = 3,039/parcela,
//      truncado a 3,03 pela Asaas ⇒ 10 × 96,97 = 969,70. ✔
//
// 2) Custo de antecipação: pro-rata simples por dia sobre o percentual AO MÊS.
//        custo = valor × (taxaMensal/100) × (dias/30)
//    Provado com POST /v3/anticipations/simulate numa parcela de R$ 96,97 com
//    anticipationDays = 32 → fee R$ 1,76 ⇒ taxa implícita 1,7016% ≈ 1,70% a.m.
//    (exatamente o `anticipation.creditCard.installmentMonthlyFeeValue` da
//    conta). No plano inteiro (10x) o simulador da Asaas devolveu R$ 96,88;
//    este helper devolve ~R$ 95 pro mesmo cenário (< 2% de desvio, explicado
//    pelo ajuste de dia útil que a Asaas aplica em cada vencimento).
//
// 3) A Asaas NÃO expõe `daysToReceive` para Pix (só boleto = 1 e cartão = 32).
//    Por isso o prazo de Pix cai na constante nomeada abaixo.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tipos de taxa (espelham _shared/asaas-card-fees.ts no edge) ──────────────

export interface CardFeeTable {
  /** Tarifa fixa por cobrança, em R$ (ex.: 0.49). */
  operationValue: number;
  /** % à vista (1x). */
  oneInstallment: number;
  /** % de 2 a 6 parcelas. */
  upToSix: number;
  /** % de 7 a 12 parcelas. */
  upToTwelve: number;
  /** % de 13 a 21 parcelas. */
  upToTwentyOne: number;
}

export interface PixFee {
  /** Tarifa fixa por Pix recebido, em R$. */
  fixed: number;
  /** Percentual sobre o valor recebido (0 no plano de tarifa fixa). */
  percent: number;
  /** Recebimentos Pix isentos por mês. */
  freeCount?: number;
  /** Quantos isentos já usados no mês corrente. */
  freeUsed?: number;
  minFee?: number | null;
  maxFee?: number | null;
}

export interface BankSlipFee {
  /** Tarifa fixa por boleto liquidado, em R$. */
  fixed: number;
}

/** Percentuais AO MÊS de antecipação (pro-rata por dia). */
export interface AnticipationFee {
  monthlyPercent: number;
  bankSlipMonthlyPercent?: number;
  pixMonthlyPercent?: number;
  cardDetachedMonthlyPercent?: number;
  cardInstallmentMonthlyPercent?: number;
}

export interface SettlementDays {
  pix: number | null;
  bankSlip: number | null;
  card: number | null;
}

/** Conjunto de taxas que o simulador consome. `null` = Asaas não informou. */
export interface SimulatorFees {
  card: CardFeeTable;
  pix: PixFee | null;
  bankSlip: BankSlipFee | null;
  anticipation: AnticipationFee | null;
  settlementDays?: Partial<SettlementDays> | null;
}

export type PaymentMethod = 'pix' | 'boleto' | 'card';
export type FeePayer = 'company' | 'customer';

// ── Constantes de referência ─────────────────────────────────────────────────

/**
 * Tabela de cartão de REFERÊNCIA (tabela pública da Asaas). Só entra quando a
 * conta do tenant ainda não foi lida. Conservadora: se a taxa real for menor,
 * o simulador mostra um líquido um pouco menor, nunca maior.
 */
export const REFERENCE_CARD_FEES: CardFeeTable = {
  operationValue: 0.49,
  oneInstallment: 2.99,
  upToSix: 3.49,
  upToTwelve: 3.99,
  upToTwentyOne: 4.29,
};

/** Tarifa de Pix de REFERÊNCIA (tabela cheia publicada: R$ 1,99 por recebimento). */
export const REFERENCE_PIX_FEE: PixFee = { fixed: 1.99, percent: 0, freeCount: 0 };

/** Tarifa de boleto de REFERÊNCIA (tabela cheia publicada: R$ 1,99). */
export const REFERENCE_BANK_SLIP_FEE: BankSlipFee = { fixed: 1.99 };

/** Antecipação de REFERÊNCIA (tabela publicada da Asaas). */
export const REFERENCE_ANTICIPATION: AnticipationFee = {
  monthlyPercent: 5.79,
  bankSlipMonthlyPercent: 5.79,
  pixMonthlyPercent: 5.79,
  cardDetachedMonthlyPercent: 1.25,
  cardInstallmentMonthlyPercent: 1.70,
};

/**
 * Prazos de liquidação (D+) usados quando a Asaas NÃO expõe `daysToReceive`.
 *
 * • pix = 0 — a Asaas credita o Pix na hora; o endpoint /myAccount/fees não
 *   traz `daysToReceive` no bloco `pix` (verificado em conta sandbox e de
 *   produção em 2026-09-06).
 * • bankSlip = 1 — a API devolveu `daysToReceive: 1` nas duas contas.
 * • card = 32 — a API devolveu `daysToReceive: 32` nas duas contas.
 *
 * NUNCA usar esses números soltos no meio de um cálculo: sempre por esta
 * constante, e a UI sinaliza quando o número veio daqui (referência) em vez de
 * ter vindo da conta do tenant.
 */
export const SETTLEMENT_DAYS_FALLBACK: Readonly<Record<PaymentMethod, number>> = Object.freeze({
  pix: 0,
  boleto: 1,
  card: 32,
});

/** Dias até o dinheiro cair quando a venda é antecipada (Asaas credita em D+1). */
export const ANTICIPATED_SETTLEMENT_DAYS = 1;

/** Intervalo (em dias) entre os vencimentos das parcelas do cartão. */
export const INSTALLMENT_INTERVAL_DAYS = 30;

/** Teto de parcelas aceito pela Asaas. */
export const MAX_INSTALLMENTS = 21;

// ── Formatação (a Asaas opera só em BRL) ─────────────────────────────────────

/** Formata um valor em reais no padrão brasileiro. */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(value) ? value : 0,
  );
}

/** Formata percentual sem zeros à toa (2.99 → "2,99%", 3 → "3%"). */
export function formatPercent(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

// ── Aritmética de dinheiro (centavos, sem float acumulado) ───────────────────

/** Reais → centavos inteiros. */
export function toCents(value: number): number {
  return Math.round((Number(value) || 0) * 100);
}

/** Centavos inteiros → reais. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// ── Gross-up (repasse da taxa ao cliente) ────────────────────────────────────

/** Percentual da faixa correspondente ao número de parcelas. */
export function tierPercent(fees: CardFeeTable, installmentCount: number): number {
  const n = Math.max(1, Math.floor(installmentCount));
  if (n <= 1) return fees.oneInstallment;
  if (n <= 6) return fees.upToSix;
  if (n <= 12) return fees.upToTwelve;
  return fees.upToTwentyOne;
}

/**
 * Núcleo do gross-up, agnóstico de meio de pagamento:
 *
 *   total = (V + fixo) / (1 - pct/100)
 *
 * `V` é o líquido que a empresa quer receber. Se pct <= 0, total = V + fixo.
 * Nunca devolve menos que V. É esta função — e só ela — que define a fórmula
 * de repasse no front; `grossUpForCustomer` (cartão) delega aqui.
 */
export function grossUpValue(value: number, percent: number, fixed: number): number {
  const safeFixed = Number.isFinite(fixed) && fixed > 0 ? fixed : 0;
  const rate = Number.isFinite(percent) && percent > 0 ? Math.min(percent, 100) / 100 : 0;
  const rawTotal = rate < 1 ? (value + safeFixed) / (1 - rate) : value + safeFixed;
  return Math.max(value, Math.round(rawTotal * 100) / 100);
}

export interface CardGrossUp {
  totalValue: number;
  installmentValue: number;
  feePassedOn: number;
}

/**
 * Gross-up do CARTÃO — mesma fórmula do edge (_shared/asaas-card-fees.ts),
 * mantida com a assinatura histórica porque o modal de cobrança depende dela.
 */
export function grossUpForCustomer(
  value: number,
  installmentCount: number,
  fees: CardFeeTable,
): CardGrossUp {
  const n = Math.max(1, Math.floor(installmentCount));
  const totalValue = grossUpValue(value, tierPercent(fees, n), fees.operationValue);
  const installmentValue = Math.round((totalValue / n) * 100) / 100;
  const feePassedOn = Math.round((totalValue - value) * 100) / 100;
  return { totalValue, installmentValue, feePassedOn };
}

// ── Simulação ────────────────────────────────────────────────────────────────

export interface SimulateInput {
  /** Valor da venda em R$. Com feePayer='company' é o valor cobrado do cliente;
   *  com 'customer' é o líquido que a empresa quer receber. */
  amount: number;
  method: PaymentMethod;
  /** Só vale no cartão. Default 1. */
  installments?: number;
  /** Quem absorve a taxa. Default 'company'. */
  feePayer?: FeePayer;
  fees: SimulatorFees;
  /** Antecipar o recebimento (crédito em D+1 com custo). Default false. */
  anticipate?: boolean;
  /** Data-base da simulação. Default = hoje. Injetável pra teste. */
  startDate?: Date;
  /** Dias até o vencimento da 1ª parcela/cobrança. Default 0 (hoje). */
  dueDays?: number;
}

export interface ScheduleItem {
  /** Data de crédito na conta, em ISO curto (YYYY-MM-DD). */
  date: string;
  /** Valor creditado nessa data, em R$. */
  amount: number;
  /** 1-based. 1 quando não há parcelamento. */
  installmentNumber: number;
  /** Esse crédito foi antecipado? */
  anticipated: boolean;
}

export interface FeeBreakdown {
  /** Percentual aplicado (0 quando a tarifa é só fixa). */
  percent: number;
  /** Quanto o percentual gerou em R$. */
  percentAmount: number;
  /** Tarifa fixa em R$. */
  fixed: number;
}

export interface SimulationResult {
  /** Total pago pelo cliente (com repasse, se houver). */
  gross: number;
  /** Taxa total da Asaas sobre a venda, em R$. */
  feeTotal: number;
  /** Líquido que cai na conta da empresa (já sem a taxa, ANTES da antecipação). */
  net: number;
  /** Valor de cada parcela para o cliente (null fora do cartão parcelado). */
  installmentValue: number | null;
  /** Quando cada valor cai na conta da empresa. Soma = líquido final. */
  schedule: { date: string; amount: number }[];
  /** Custo da antecipação em R$ (null quando não antecipa ou falta a taxa). */
  anticipationCost: number | null;
  /** Dias até o PRIMEIRO crédito cair na conta. */
  settlementDays: number;

  // ── Extras (aditivos — a assinatura acima é o contrato mínimo) ─────────────
  /** Cronograma detalhado (com nº da parcela e flag de antecipação). */
  scheduleDetailed: ScheduleItem[];
  /** Composição da taxa (%, valor do %, fixo). */
  feeBreakdown: FeeBreakdown;
  /** Líquido depois de descontar a antecipação (= net quando não antecipa). */
  netAfterAnticipation: number;
  /** Quanto de taxa foi repassado ao cliente (0 quando a empresa absorve). */
  feePassedOn: number;
  /** Percentual efetivo de custo sobre o bruto (taxa + antecipação). */
  effectiveCostPercent: number;
  /** Prazo veio da conta do tenant? false = SETTLEMENT_DAYS_FALLBACK. */
  settlementDaysFromAsaas: boolean;
  /** Alguma taxa usada veio da tabela de referência (não da conta do tenant)? */
  usedReferenceFees: boolean;
  /** Nº de parcelas efetivamente usado. */
  installments: number;
  /** Cronograma do que o CLIENTE paga (parcelas do cartão), com as datas de
   *  vencimento dele. Independe de antecipação — antecipar muda quando a EMPRESA
   *  recebe, nunca quando o cliente paga. */
  customerSchedule: ScheduleItem[];
}

/** Soma N dias a uma data e devolve ISO curto (YYYY-MM-DD), sem fuso. */
function addDaysIso(base: Date, days: number): string {
  const d = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Divide um total (em centavos) em N parcelas SEM perder centavo: todas iguais
 * e o resto vai inteiro na ÚLTIMA. Garante que a soma feche com o total.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(totalCents / n);
  const out = new Array(n).fill(base);
  out[n - 1] = totalCents - base * (n - 1);
  return out;
}

/** Taxa de antecipação (% ao mês) aplicável ao meio/parcelamento escolhido. */
function anticipationRateFor(
  anticipation: AnticipationFee | null,
  method: PaymentMethod,
  installments: number,
): number | null {
  if (!anticipation) return null;
  if (method === 'card') {
    const r = installments > 1
      ? anticipation.cardInstallmentMonthlyPercent
      : anticipation.cardDetachedMonthlyPercent;
    return r ?? anticipation.cardInstallmentMonthlyPercent ?? anticipation.monthlyPercent ?? null;
  }
  if (method === 'boleto') return anticipation.bankSlipMonthlyPercent ?? anticipation.monthlyPercent ?? null;
  return anticipation.pixMonthlyPercent ?? anticipation.monthlyPercent ?? null;
}

/**
 * Simula uma venda: quanto o cliente paga, quanto a Asaas leva, quanto sobra e
 * quando cada pedaço cai na conta — com e sem antecipação.
 *
 * ESTIMATIVA (ver cabeçalho): o número contratual é o do edge de criação.
 */
export function simulateNetAmount(input: SimulateInput): SimulationResult {
  const method = input.method;
  const feePayer: FeePayer = input.feePayer === 'customer' ? 'customer' : 'company';
  const startDate = input.startDate ?? new Date();
  const dueDays = Number.isFinite(input.dueDays) ? Math.max(0, Math.floor(input.dueDays!)) : 0;

  const installments = method === 'card'
    ? Math.min(MAX_INSTALLMENTS, Math.max(1, Math.floor(Number(input.installments) || 1)))
    : 1;

  const amount = Math.max(0, Number(input.amount) || 0);

  // ── 1. Componentes da taxa por meio de pagamento ──────────────────────────
  let percent = 0;
  let fixed = 0;
  let usedReferenceFees = false;

  if (method === 'card') {
    percent = tierPercent(input.fees.card, installments);
    fixed = Math.max(0, Number(input.fees.card.operationValue) || 0);
  } else if (method === 'boleto') {
    const slip = input.fees.bankSlip;
    if (slip) {
      fixed = Math.max(0, Number(slip.fixed) || 0);
    } else {
      fixed = REFERENCE_BANK_SLIP_FEE.fixed;
      usedReferenceFees = true;
    }
  } else {
    const pix = input.fees.pix;
    if (pix) {
      fixed = Math.max(0, Number(pix.fixed) || 0);
      percent = Math.max(0, Number(pix.percent) || 0);
    } else {
      fixed = REFERENCE_PIX_FEE.fixed;
      percent = REFERENCE_PIX_FEE.percent;
      usedReferenceFees = true;
    }
  }

  // ── 2. Bruto (com repasse quando o cliente paga a taxa) ───────────────────
  const gross = feePayer === 'customer' ? grossUpValue(amount, percent, fixed) : amount;
  const grossCents = toCents(gross);

  // ── 3. Taxa da Asaas sobre o bruto ────────────────────────────────────────
  let percentCents = Math.round((grossCents * percent) / 100);
  // Piso/teto da tarifa percentual do Pix, quando o plano do tenant tiver.
  const pixFee = method === 'pix' ? input.fees.pix : null;
  if (pixFee && percent > 0) {
    if (pixFee.minFee != null) percentCents = Math.max(percentCents, toCents(pixFee.minFee));
    if (pixFee.maxFee != null) percentCents = Math.min(percentCents, toCents(pixFee.maxFee));
  }
  const fixedCents = toCents(fixed);
  const feeCents = Math.min(grossCents, percentCents + fixedCents);
  const netCents = grossCents - feeCents;

  // ── 4. Cronograma (quando cada pedaço cai na conta da empresa) ────────────
  const configuredDays = input.fees.settlementDays ?? null;
  const asaasDays = method === 'card'
    ? configuredDays?.card
    : method === 'boleto'
      ? configuredDays?.bankSlip
      : configuredDays?.pix;
  const settlementDaysFromAsaas = asaasDays != null && Number.isFinite(asaasDays);
  const baseSettlementDays = settlementDaysFromAsaas
    ? Number(asaasDays)
    : SETTLEMENT_DAYS_FALLBACK[method];

  const parts = splitCents(netCents, installments);
  /** Dias (a partir de hoje) até o crédito ORIGINAL de cada parcela. */
  const originalDays = parts.map((_, i) => dueDays + baseSettlementDays + i * INSTALLMENT_INTERVAL_DAYS);

  // ── 5. Antecipação ────────────────────────────────────────────────────────
  const anticipate = input.anticipate === true;
  const rate = anticipationRateFor(input.fees.anticipation, method, installments);
  const rateFromReference = anticipate && input.fees.anticipation == null;
  const effectiveRate = anticipate
    ? (rate ?? anticipationRateFor(REFERENCE_ANTICIPATION, method, installments))
    : null;
  if (rateFromReference && anticipate) usedReferenceFees = true;

  let anticipationCostCents: number | null = null;
  const anticipatedDays: number[] = [];

  if (anticipate && effectiveRate != null && effectiveRate > 0) {
    let sum = 0;
    parts.forEach((cents, i) => {
      // Dias efetivamente antecipados: do crédito em D+1 até o crédito original.
      const days = Math.max(0, originalDays[i] - ANTICIPATED_SETTLEMENT_DAYS);
      anticipatedDays.push(days);
      // Pro-rata simples ao mês — fórmula confirmada contra /anticipations/simulate.
      sum += Math.round((cents * (effectiveRate / 100) * days) / 30);
    });
    anticipationCostCents = Math.min(netCents, sum);
  }

  const finalNetCents = netCents - (anticipationCostCents ?? 0);
  const finalParts = anticipate && anticipationCostCents != null
    ? splitCents(finalNetCents, installments)
    : parts;

  const scheduleDetailed: ScheduleItem[] = finalParts.map((cents, i) => ({
    date: addDaysIso(
      startDate,
      anticipate && anticipationCostCents != null ? ANTICIPATED_SETTLEMENT_DAYS : originalDays[i],
    ),
    amount: fromCents(cents),
    installmentNumber: i + 1,
    anticipated: anticipate && anticipationCostCents != null,
  }));

  const firstSettlementDays = anticipate && anticipationCostCents != null
    ? ANTICIPATED_SETTLEMENT_DAYS
    : originalDays[0];

  const effectiveCostPercent = grossCents > 0
    ? ((feeCents + (anticipationCostCents ?? 0)) / grossCents) * 100
    : 0;

  // ── 6. Cronograma do CLIENTE (o que ele paga, nunca muda com antecipação) ──
  const customerParts = splitCents(grossCents, installments);
  const customerSchedule: ScheduleItem[] = customerParts.map((cents, i) => ({
    date: addDaysIso(startDate, dueDays + i * INSTALLMENT_INTERVAL_DAYS),
    amount: fromCents(cents),
    installmentNumber: i + 1,
    anticipated: false,
  }));

  return {
    gross: fromCents(grossCents),
    feeTotal: fromCents(feeCents),
    net: fromCents(netCents),
    installmentValue: installments > 1 ? Math.round((grossCents / installments)) / 100 : null,
    schedule: scheduleDetailed.map((s) => ({ date: s.date, amount: s.amount })),
    anticipationCost: anticipationCostCents != null ? fromCents(anticipationCostCents) : null,
    settlementDays: firstSettlementDays,

    scheduleDetailed,
    feeBreakdown: { percent, percentAmount: fromCents(percentCents), fixed },
    netAfterAnticipation: fromCents(finalNetCents),
    feePassedOn: feePayer === 'customer' ? fromCents(grossCents - toCents(amount)) : 0,
    effectiveCostPercent: Math.round(effectiveCostPercent * 100) / 100,
    settlementDaysFromAsaas,
    usedReferenceFees,
    installments,
    customerSchedule,
  };
}
