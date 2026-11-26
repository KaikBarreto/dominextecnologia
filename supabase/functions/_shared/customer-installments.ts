// customer-installments
// ---------------------
// Régua ÚNICA do modo "Cliente escolhe as parcelas" (cobrança avulsa no cartão).
//
// A empresa define só o TETO (ex.: até 10x). A cobrança nasce na Asaas como 1x
// e, se o pagador escolher N ≥ 2 no checkout, o `tenant-asaas-pay-charge-card`
// cria uma venda parcelada nova (POST /payments) e troca a cobrança 1x por ela.
//
// Quem usa esta régua (os TRÊS têm que dar o mesmo número, senão o checkout
// mostra um valor e o cartão é cobrado em outro):
//   • tenant-asaas-create-charge  → teto efetivo gravado na cobrança;
//   • get-tenant-payment-checkout → opções exibidas ao pagador;
//   • tenant-asaas-pay-charge-card → total AUTORITATIVO cobrado no cartão.
//
// Funções PURAS (sem I/O). A taxa vem de `resolveTenantCardFees` e o gross-up é
// o MESMO `grossUpForCustomer` do create-charge: uma régua, um dono.

import { type CardFeeTable, grossUpForCustomer } from "./asaas-card-fees.ts";

/** Menor parcela aceita pela Asaas (R$ 5,00). */
export const MIN_INSTALLMENT_VALUE = 5;
/** Menor teto que faz sentido no modo (1x não é "escolher parcelas"). */
export const MIN_CUSTOMER_MAX_INSTALLMENTS = 2;
/** Maior teto do modo (mesmo limite do select de parcelas da tela). */
export const MAX_CUSTOMER_MAX_INSTALLMENTS = 12;

export type CardFeePayer = "company" | "customer";

/** Uma opção de parcelamento exibida/cobrada no checkout. */
export interface CustomerInstallmentOption {
  count: number;
  /** Valor aproximado de cada parcela (a Asaas ajusta centavos na última). */
  installment_value: number;
  /** Total que o pagador paga nesta opção. */
  total_value: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function toInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

/** Normaliza quem paga a taxa (qualquer coisa fora do enum vira 'company'). */
export function normalizeFeePayer(raw: unknown): CardFeePayer {
  return raw === "customer" ? "customer" : "company";
}

/**
 * Teto EFETIVO de parcelas do modo: o menor entre o teto gravado na cobrança,
 * o `default_max_installments` da conta (o tenant pode ter baixado depois) e 12.
 * Devolve null quando o modo não se aplica (teto < 2 ou ausente).
 *
 * `accountMax` null/ausente = conta sem limite próprio (só o teto de 12).
 */
export function effectiveCustomerMaxInstallments(
  chargeMax: unknown,
  accountMax: unknown,
): number | null {
  const c = toInt(chargeMax);
  if (c === null || c < MIN_CUSTOMER_MAX_INSTALLMENTS) return null;
  const a = toInt(accountMax);
  const accountCap = a !== null && a >= 1 ? a : MAX_CUSTOMER_MAX_INSTALLMENTS;
  const n = Math.min(c, accountCap, MAX_CUSTOMER_MAX_INSTALLMENTS);
  return n >= MIN_CUSTOMER_MAX_INSTALLMENTS ? n : null;
}

/**
 * Total cobrado numa opção de N parcelas.
 *   • N = 1               → `oneTimeValue` (o valor da cobrança 1x que JÁ existe
 *                            na Asaas; é o que payWithCreditCard cobra).
 *   • empresa paga a taxa → `baseValue` (sem juros, o total não muda).
 *   • cliente paga a taxa → gross-up da faixa de N parcelas sobre `baseValue`.
 */
export function totalForInstallments(opts: {
  baseValue: number;
  oneTimeValue: number;
  count: number;
  feePayer: CardFeePayer;
  fees: CardFeeTable;
}): number {
  const n = Math.max(1, Math.floor(opts.count));
  if (n === 1) return round2(opts.oneTimeValue);
  if (opts.feePayer === "company") return round2(opts.baseValue);
  return grossUpForCustomer(opts.baseValue, n, opts.fees).totalValue;
}

/** Parcela de N vezes respeita o mínimo da Asaas? (conta sem arredondar). */
export function installmentMeetsMinimum(total: number, count: number): boolean {
  const n = Math.max(1, Math.floor(count));
  return total / n >= MIN_INSTALLMENT_VALUE - 1e-9;
}

/**
 * Lista de opções 1..teto. Opções com parcela abaixo de R$ 5,00 são OMITIDAS
 * (a Asaas recusaria). A opção 1x sempre entra (é a cobrança que já existe).
 */
export function buildCustomerInstallmentOptions(opts: {
  baseValue: number;
  oneTimeValue: number;
  maxInstallments: number;
  feePayer: CardFeePayer;
  fees: CardFeeTable;
}): CustomerInstallmentOption[] {
  const max = Math.min(
    Math.max(1, Math.floor(opts.maxInstallments)),
    MAX_CUSTOMER_MAX_INSTALLMENTS,
  );
  const out: CustomerInstallmentOption[] = [];
  for (let count = 1; count <= max; count++) {
    const total = totalForInstallments({ ...opts, count });
    if (count > 1 && !installmentMeetsMinimum(total, count)) continue;
    out.push({ count, installment_value: round2(total / count), total_value: total });
  }
  return out;
}
