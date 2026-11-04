import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classificarCoberturaAdn } from "./sefin.ts";

Deno.test("cobertura do ADN só libera com resposta oficial 2xx", () => {
  assertEquals(classificarCoberturaAdn(200), true);
  assertEquals(classificarCoberturaAdn(204), true);
});

Deno.test("404 confirma município não parametrizado", () => {
  assertEquals(classificarCoberturaAdn(404), false);
});

Deno.test("auth, rate limit e indisponibilidade ficam desconhecidos", () => {
  for (const status of [0, 401, 403, 429, 500, 503]) {
    assertEquals(classificarCoberturaAdn(status), null, String(status));
  }
});
