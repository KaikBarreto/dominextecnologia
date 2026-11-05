import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fiscalContextForEmission,
  normalizeFiscalEnvironment,
  scopeNfseIdempotencyKey,
} from "./environment.ts";

Deno.test("normaliza somente os dois ambientes fiscais", () => {
  assertEquals(normalizeFiscalEnvironment("homologacao"), "homologacao");
  assertEquals(normalizeFiscalEnvironment("producao"), "producao");
  assertEquals(normalizeFiscalEnvironment(""), null);
  assertEquals(normalizeFiscalEnvironment(null), null);
});

Deno.test("idempotencia distingue homologacao de producao", () => {
  const raw = "pedido-do-cliente-123";
  const homologacao = scopeNfseIdempotencyKey(raw, "homologacao");
  const producao = scopeNfseIdempotencyKey(raw, "producao");
  assertNotEquals(homologacao, producao);
  assertEquals(homologacao, "homologacao:pedido-do-cliente-123");
  assertEquals(producao, "producao:pedido-do-cliente-123");
});

Deno.test("chave longa preserva ambiente, limite e entropia final", () => {
  const a = scopeNfseIdempotencyKey("x".repeat(520) + "a", "producao");
  const b = scopeNfseIdempotencyKey("x".repeat(520) + "b", "producao");
  assertEquals(a.length <= 512, true);
  assertEquals(a.startsWith("producao:"), true);
  assertNotEquals(a, b);
});

Deno.test("operacao usa ambiente imutavel da emissao", () => {
  const ctx = fiscalContextForEmission(
    { fiscal_ambiente: "producao", certificado_ref: "cert" },
    { fiscal_ambiente: "homologacao" },
  );
  assertEquals(ctx?.fiscal_ambiente, "homologacao");
  assertEquals(ctx?.certificado_ref, "cert");
});

Deno.test("emissao legada sem ambiente comprovado falha fechado", () => {
  assertEquals(
    fiscalContextForEmission({ fiscal_ambiente: "producao" }, {
      fiscal_ambiente: null,
    }),
    null,
  );
});
