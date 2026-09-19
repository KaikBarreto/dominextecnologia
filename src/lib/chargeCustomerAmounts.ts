/**
 * Quanto o CLIENTE paga numa cobrança: com desconto por antecipação e com
 * multa + juros por atraso.
 *
 * Existe separado do componente porque é conta de dinheiro mostrada ao dono da
 * empresa antes de gerar a cobrança, e conta de dinheiro tem teste. O resumo do
 * modal "Nova cobrança" (`ChargeDialog`) mostra o outro lado da moeda do
 * `asaasFeeSimulator` (que responde "quanto SOBRA pra empresa"): aqui a
 * pergunta é "quanto SAI do bolso do cliente".
 *
 * ── Regras (espelham o que a Asaas aplica na fatura) ───────────────────────
 * · Multa: percentual sobre o valor da cobrança OU valor fixo em R$
 *   (`fine.type = PERCENTAGE | FIXED` na API da Asaas). Cobrada UMA vez, no
 *   momento em que a cobrança entra em atraso.
 * · Juros: SEMPRE percentual AO MÊS (a Asaas não aceita juros fixo, o DTO só
 *   tem `value`), cobrado proporcionalmente aos dias de atraso, na base de 30
 *   dias por mês. 1% ao mês com 15 dias de atraso = 0,5%.
 * · Multa e juros incidem sobre o VALOR DA COBRANÇA, nunca um sobre o outro
 *   (não há juros sobre a multa).
 * · Desconto: percentual sobre o valor da cobrança, válido até
 *   `discountDays` dias ANTES do vencimento (0 = até o próprio vencimento,
 *   mesma semântica de `discount.dueDateLimitDays` na Asaas).
 *
 * Tudo arredondado ao centavo, do mesmo jeito que o edge de criação
 * (`Math.round(v * 100) / 100`) — nunca meio centavo na tela.
 */

/** Tipo de multa aceito pela Asaas em `fine.type`. */
export type ChargeFineType = 'PERCENTAGE' | 'FIXED';

/**
 * Recorte de atraso usado no cenário "pagando em atraso" do resumo.
 *
 * 30 dias porque o juros da Asaas é declarado AO MÊS: com 30 dias o número na
 * tela é exatamente a taxa que o usuário digitou (1% ao mês = 1%), sem
 * proporção quebrada pra ele conferir de cabeça. Qualquer outro recorte
 * mostraria um juros "estranho" e pareceria erro de conta.
 *
 * A UI é obrigada a dizer o recorte junto do número: encargo sem premissa
 * escrita vira reclamação de cliente.
 */
export const LATE_SCENARIO_DAYS = 30;

/** Dias por mês que a Asaas usa pra converter juros ao mês em juros ao dia. */
const DAYS_PER_INTEREST_MONTH = 30;

/** Arredonda ao centavo, igual ao edge de criação da cobrança. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Número finito e positivo, senão 0 (campo vazio, NaN, negativo, texto). */
function positiveOrZero(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface CustomerAmountsInput {
  /**
   * Valor que o cliente vê na cobrança, em reais. Quando a taxa do cartão é
   * repassada, é o valor JÁ inflado (o que o cliente paga), não o líquido que
   * a empresa quer receber.
   */
  baseAmount: number;
  /** Ausente → 'PERCENTAGE' (comportamento histórico). */
  fineType?: ChargeFineType;
  /** Multa em % do valor. Usado quando `fineType` é 'PERCENTAGE'. */
  finePercent?: number | null;
  /** Multa em R$. Usado quando `fineType` é 'FIXED'. */
  fineAmount?: number | null;
  /** Juros ao mês em % (a Asaas só aceita percentual aqui). */
  interestPercent?: number | null;
  /** Desconto por antecipação em % do valor. */
  discountPercent?: number | null;
  /** Dias ANTES do vencimento até quando o desconto vale (0 = até o vencimento). */
  discountDays?: number | null;
  /** Dias de atraso do cenário. Ausente → `LATE_SCENARIO_DAYS`. */
  lateDays?: number;
}

export interface CustomerAmounts {
  /** Valor da cobrança já arredondado ao centavo. */
  base: number;
  /** Há desconto configurado E ele muda o valor (nunca "desconto de R$ 0,00"). */
  hasDiscount: boolean;
  discountAmount: number;
  /** Quanto o cliente paga aproveitando o desconto. */
  amountOnTime: number;
  /** Dias antes do vencimento em que o desconto ainda vale. */
  discountDays: number;
  /** Há multa e/ou juros que realmente somam alguma coisa. */
  hasLateCharges: boolean;
  fineAmount: number;
  interestAmount: number;
  lateChargesTotal: number;
  /** Quanto o cliente paga atrasado, com multa e juros. */
  amountWhenLate: number;
  /** Dias de atraso assumidos (a UI precisa escrever isso junto do número). */
  lateDays: number;
}

/**
 * Calcula os dois cenários que o cliente enxerga: pagando adiantado (com
 * desconto) e pagando atrasado (com multa e juros).
 *
 * Nunca inventa cenário: `hasDiscount` / `hasLateCharges` vêm `false` quando
 * não há nada configurado, e a UI só desenha a linha que existe.
 */
export function computeCustomerAmounts(input: CustomerAmountsInput): CustomerAmounts {
  const base = roundCents(positiveOrZero(input.baseAmount));
  const lateDays = Number.isFinite(input.lateDays) ? Math.max(0, Number(input.lateDays)) : LATE_SCENARIO_DAYS;

  const rawDiscountDays = Number(input.discountDays);
  const discountDays = Number.isFinite(rawDiscountDays) && rawDiscountDays > 0
    ? Math.floor(rawDiscountDays)
    : 0;

  // ── Desconto ──────────────────────────────────────────────────────────────
  const discountPercent = positiveOrZero(input.discountPercent);
  // Desconto maior que 100% não zera nem inverte a cobrança: trava no valor.
  const discountAmount = base > 0
    ? Math.min(base, roundCents((base * discountPercent) / 100))
    : 0;
  const amountOnTime = roundCents(base - discountAmount);

  // ── Multa ─────────────────────────────────────────────────────────────────
  const fineType: ChargeFineType = input.fineType === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
  const fineAmount = base > 0
    ? fineType === 'FIXED'
      ? roundCents(positiveOrZero(input.fineAmount))
      : roundCents((base * positiveOrZero(input.finePercent)) / 100)
    : 0;

  // ── Juros (ao mês, proporcional aos dias de atraso) ───────────────────────
  const interestPercent = positiveOrZero(input.interestPercent);
  const interestAmount = base > 0
    ? roundCents((base * interestPercent * lateDays) / (100 * DAYS_PER_INTEREST_MONTH))
    : 0;

  const lateChargesTotal = roundCents(fineAmount + interestAmount);
  const amountWhenLate = roundCents(base + lateChargesTotal);

  return {
    base,
    hasDiscount: base > 0 && discountAmount > 0,
    discountAmount,
    amountOnTime,
    discountDays,
    hasLateCharges: base > 0 && lateChargesTotal > 0,
    fineAmount,
    interestAmount,
    lateChargesTotal,
    amountWhenLate,
    lateDays,
  };
}
