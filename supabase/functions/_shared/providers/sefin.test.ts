import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { coberturaConfirmadaPeloMotor } from "./sefin.ts";

Deno.test("cobertura só libera com conclusão booleana explícita do motor", () => {
  assertEquals(coberturaConfirmadaPeloMotor(true), true);
  for (const valor of [false, null, undefined, 1, "true", {}]) {
    assertEquals(coberturaConfirmadaPeloMotor(valor), false);
  }
});
