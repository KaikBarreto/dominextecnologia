// Testes puros da régua "Cliente escolhe as parcelas".
//
//   deno test supabase/functions/_shared/customer-installments.test.ts
//
// O que estes testes travam: o checkout mostra as opções e o pay-charge-card
// cobra o total com a MESMA função. Se a régua mudar sem querer, o pagador vê
// um valor e o cartão é cobrado em outro.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CardFeeTable } from "./asaas-card-fees.ts";
import {
  buildCustomerInstallmentOptions,
  effectiveCustomerMaxInstallments,
  installmentMeetsMinimum,
  normalizeFeePayer,
  totalForInstallments,
} from "./customer-installments.ts";

const FEES: CardFeeTable = {
  operationValue: 0.49,
  oneInstallment: 2.99,
  upToSix: 3.49,
  upToTwelve: 3.99,
  upToTwentyOne: 4.29,
};

Deno.test("teto efetivo: menor entre cobrança, conta e 12", () => {
  assertEquals(effectiveCustomerMaxInstallments(10, 12), 10);
  assertEquals(effectiveCustomerMaxInstallments(10, 6), 6);
  assertEquals(effectiveCustomerMaxInstallments(12, null), 12);
  assertEquals(effectiveCustomerMaxInstallments(20, null), 12);
  // Conta baixou para 1x depois de criar: o modo some.
  assertEquals(effectiveCustomerMaxInstallments(10, 1), null);
  // Cobrança fora do modo.
  assertEquals(effectiveCustomerMaxInstallments(null, 12), null);
  assertEquals(effectiveCustomerMaxInstallments(1, 12), null);
  assertEquals(effectiveCustomerMaxInstallments("abc", 12), null);
});

Deno.test("quem paga a taxa: só 'customer' é cliente", () => {
  assertEquals(normalizeFeePayer("customer"), "customer");
  assertEquals(normalizeFeePayer("company"), "company");
  assertEquals(normalizeFeePayer(null), "company");
  assertEquals(normalizeFeePayer("CUSTOMER"), "company");
});

Deno.test("empresa paga a taxa: total igual em todas as opções (sem juros)", () => {
  const opts = buildCustomerInstallmentOptions({
    baseValue: 600,
    oneTimeValue: 600,
    maxInstallments: 10,
    feePayer: "company",
    fees: FEES,
  });
  assertEquals(opts.length, 10);
  for (const o of opts) assertEquals(o.total_value, 600);
  assertEquals(opts[9], { count: 10, installment_value: 60, total_value: 600 });
});

Deno.test("cliente paga a taxa: 1x é o valor da cobrança, Nx é o gross-up da faixa", () => {
  // 1x já nasceu com o gross-up de 1x: (600 + 0,49) / (1 - 0,0299) = 618,98
  const oneTime = 618.98;
  const opts = buildCustomerInstallmentOptions({
    baseValue: 600,
    oneTimeValue: oneTime,
    maxInstallments: 10,
    feePayer: "customer",
    fees: FEES,
  });
  assertEquals(opts[0], { count: 1, installment_value: 618.98, total_value: 618.98 });
  // 2..6 → 3,49%: (600,49) / 0,9651 = 622,20
  assertEquals(opts[1].total_value, 622.2);
  assertEquals(opts[5].total_value, 622.2);
  // 7..12 → 3,99%: (600,49) / 0,9601 = 625,45
  assertEquals(opts[9], { count: 10, installment_value: 62.55, total_value: 625.45 });
  // O total de cada opção é exatamente o que o pay-charge-card cobra.
  assertEquals(
    totalForInstallments({ baseValue: 600, oneTimeValue: oneTime, count: 10, feePayer: "customer", fees: FEES }),
    625.45,
  );
});

Deno.test("opção com parcela abaixo de R$ 5,00 é omitida", () => {
  const opts = buildCustomerInstallmentOptions({
    baseValue: 20,
    oneTimeValue: 20,
    maxInstallments: 12,
    feePayer: "company",
    fees: FEES,
  });
  // 20 / 4 = 5,00 entra; 20 / 5 = 4,00 sai.
  assertEquals(opts.map((o) => o.count), [1, 2, 3, 4]);
  assertEquals(installmentMeetsMinimum(20, 4), true);
  assertEquals(installmentMeetsMinimum(20, 5), false);
});

Deno.test("teto acima de 12 é cortado em 12", () => {
  const opts = buildCustomerInstallmentOptions({
    baseValue: 1000,
    oneTimeValue: 1000,
    maxInstallments: 21,
    feePayer: "company",
    fees: FEES,
  });
  assertEquals(opts.length, 12);
});
