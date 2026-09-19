/**
 * Assinatura: do valor de UM ciclo para o total da assinatura.
 *
 * Existe separado do componente por causa de uma armadilha específica de
 * recorrência: o resumo de uma cobrança avulsa responde "quanto sobra pra
 * empresa" e acabou; o de uma assinatura tem DOIS números possíveis, e mostrar
 * o errado mente feio. Numa assinatura de 12x de R$ 300, "R$ 291,00" é o
 * líquido de UMA cobrança, não da assinatura inteira — quem lê como total
 * acha que vai receber R$ 291 por um contrato de R$ 3.600.
 *
 * Por isso este módulo devolve os dois lados explicitamente separados
 * (`netPerCycle` x `netTotal`) e só calcula o total quando a assinatura TEM
 * fim: assinatura contínua não tem total, e inventar um (ex.: assumir 12
 * meses) seria chutar dinheiro.
 *
 * A conta de "quanto sobra por cobrança" NÃO mora aqui: ela é do
 * `asaasFeeSimulator` (taxa da Asaas), e "quanto o cliente paga" é do
 * `chargeCustomerAmounts` (multa/juros/desconto). Aqui é só a multiplicação
 * pelo número de ciclos, arredondada ao centavo do mesmo jeito que o resto do
 * domínio (`Math.round(v * 100) / 100`).
 */
import { MAX_REPETITION_COUNT } from './finance-installments';

export interface SubscriptionTotalsInput {
  /** Líquido que cai na conta da empresa em UMA cobrança do ciclo. */
  netPerCycle: number;
  /** Quanto o cliente paga em UMA cobrança do ciclo. */
  customerPerCycle: number;
  /**
   * Número de cobranças que a assinatura vai gerar. `null`/ausente = contínua
   * (sem fim definido). Valor fora da faixa aceita (não inteiro, < 1 ou acima
   * de `MAX_REPETITION_COUNT`) é tratado como contínua: melhor não mostrar
   * total nenhum do que mostrar um total calculado em cima de lixo.
   */
  cycles?: number | null;
}

export interface SubscriptionTotals {
  /** Líquido de UMA cobrança, arredondado ao centavo. */
  netPerCycle: number;
  /** Quanto o cliente paga em UMA cobrança, arredondado ao centavo. */
  customerPerCycle: number;
  /** A assinatura tem fim definido (e por isso existe total). */
  isLimited: boolean;
  /** Ciclos considerados (null quando contínua). */
  cycles: number | null;
  /** Líquido somado de todas as cobranças (null quando contínua). */
  netTotal: number | null;
  /** Total que o cliente paga em todas as cobranças (null quando contínua). */
  customerTotal: number | null;
}

/** Arredonda ao centavo, igual aos edges de criação. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Número finito e não-negativo, senão 0. */
function nonNegative(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Ciclos válidos pra fechar um total: inteiro de 1 até `MAX_REPETITION_COUNT`.
 * Acima do teto o formulário já recusa o envio — aqui é só para o resumo não
 * desenhar um total que nunca vai existir.
 */
export function isClosedSubscription(cycles: unknown): boolean {
  const n = Number(cycles);
  return Number.isInteger(n) && n >= 1 && n <= MAX_REPETITION_COUNT;
}

export function computeSubscriptionTotals(input: SubscriptionTotalsInput): SubscriptionTotals {
  const netPerCycle = roundCents(nonNegative(input.netPerCycle));
  const customerPerCycle = roundCents(nonNegative(input.customerPerCycle));

  if (!isClosedSubscription(input.cycles)) {
    return {
      netPerCycle,
      customerPerCycle,
      isLimited: false,
      cycles: null,
      netTotal: null,
      customerTotal: null,
    };
  }

  const cycles = Number(input.cycles);
  return {
    netPerCycle,
    customerPerCycle,
    isLimited: true,
    cycles,
    netTotal: roundCents(netPerCycle * cycles),
    customerTotal: roundCents(customerPerCycle * cycles),
  };
}
