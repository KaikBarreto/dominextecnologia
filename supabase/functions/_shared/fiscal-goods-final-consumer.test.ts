import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveGoodsFinalConsumer } from "./fiscal-goods-final-consumer.ts";

Deno.test("mantém toda NFC-e como consumidor final", () => {
  assertEquals(resolveGoodsFinalConsumer({ model: 65, direction: "saida", requested: false }), true);
});

Deno.test("força consumidor final na NF-e de saída quando o destinatário não possui IE", () => {
  assertEquals(resolveGoodsFinalConsumer({ model: 55, direction: "saida", stateRegistration: "", requested: false }), true);
});

Deno.test("preserva a escolha explícita do contribuinte", () => {
  const base = { model: 55 as const, direction: "saida" as const, stateRegistration: "110042490114" };
  assertEquals(resolveGoodsFinalConsumer({ ...base, requested: true }), true);
  assertEquals(resolveGoodsFinalConsumer({ ...base, requested: false }), false);
});

Deno.test("mantém o legado contribuinte e as entradas como não consumidor final", () => {
  assertEquals(resolveGoodsFinalConsumer({ model: 55, direction: "saida", stateRegistration: "110042490114" }), false);
  assertEquals(resolveGoodsFinalConsumer({ model: 55, direction: "entrada", requested: true }), false);
});
