// ─────────────────────────────────────────────────────────────────────────────
// asaasWebhookMoney — espelho PURO (sem Deno, testável via vitest) da regra que
// decide se o `netValue` de um evento PAYMENT_RECEIVED/CONFIRMED da Asaas pode
// virar a tarifa automática (financial_transactions, saida, "Tarifas e Taxas").
//
// Fonte da verdade (Deno): supabase/functions/tenant-asaas-webhook/index.ts
// (`isInstallmentPaymentEvent` + o bloco de BAIXA). Mantenha os dois em sync —
// mesmo padrão já usado para as tabelas de taxa (ver cabeçalho de
// asaasFeeSimulator.ts, que espelha _shared/asaas-card-fees.ts).
//
// ── O BUG QUE ISTO EVITA (produção real, 2026-09, Glacial Cold Brasil) ───────
// Venda de R$ 3.133,00 parcelada em 10x no cartão. A Asaas cria um
// `payment.id` DIFERENTE por parcela (todas com o MESMO `payment.installment`,
// o id do agrupamento), mas `tenant_charges.asaas_payment_id` só guarda o id
// da 1ª parcela (é o que a Asaas devolve na criação, via `totalValue` +
// `installmentCount`). Quando a parcela 1 confirma, o webhook recebe
// `payment.value = 313,30` e `payment.netValue = 303,90` — o valor e o
// líquido DAQUELA PARCELA, nunca da venda inteira. Só que
// `apply_tenant_charge_payment` compara esse líquido contra
// `tenant_charges.value` (o TOTAL, R$ 3.133,00) pra calcular a tarifa:
//   tarifa = 3.133,00 − 303,90 = 2.829,10  (90% do valor, quase tudo "taxa")
// em vez da tarifa real da parcela (313,30 − 303,90 = 9,40).
//
// A CORREÇÃO: `payment.installment` está presente em TODAS as parcelas
// (inclusive a 1ª) — é o sinal de que este evento nunca representa a venda
// inteira. Quando presente, o webhook passa `p_net = null` pra
// `apply_tenant_charge_payment`, que então NÃO lança tarifa nenhuma pra este
// evento (em vez de lançar uma tarifa fabricada). Reconciliar a tarifa REAL de
// uma venda parcelada exige rastrear cada parcela (hoje só a 1ª existe em
// tenant_charges) — fora do escopo deste hotfix.
// ─────────────────────────────────────────────────────────────────────────────

/** Shape mínimo do `payment` de um evento de webhook da Asaas que nos interessa aqui. */
export interface AsaasWebhookPayment {
  id?: string;
  value?: number | string | null;
  netValue?: number | string | null;
  installment?: string | null;
  installmentNumber?: number | null;
}

/**
 * É uma PARCELA de uma venda parcelada no cartão? A Asaas manda
 * `payment.installment` (id do agrupamento) em toda parcela, inclusive a 1ª.
 */
export function isInstallmentPaymentEvent(
  payment: AsaasWebhookPayment | null | undefined,
): boolean {
  return typeof payment?.installment === "string" && payment.installment.length > 0;
}

/**
 * Resolve o `p_net` seguro pra mandar em `apply_tenant_charge_payment`:
 * `null` sempre que o evento for de uma PARCELA (o netValue dela não
 * representa o líquido da venda inteira — nunca vira base de tarifa
 * automática). Fora desse caso, é o `netValue` do evento (comportamento
 * original, intacto pra cobrança avulsa/não-parcelada).
 */
export function resolveSafeNetForFeePosting(
  payment: AsaasWebhookPayment | null | undefined,
): number | null {
  if (isInstallmentPaymentEvent(payment)) return null;
  return payment?.netValue != null ? Number(payment.netValue) : null;
}
