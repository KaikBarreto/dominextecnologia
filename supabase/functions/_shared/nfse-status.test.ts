import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isNfseTerminal, mapNfseStatus, NFSE_STATUS } from "./nfse-status.ts";

Deno.test("estado oficial inconclusivo permanece em confirmação e não encerra polling", () => {
  assertEquals(
    mapNfseStatus("aguardando_confirmacao", NFSE_STATUS.PENDENTE),
    NFSE_STATUS.CONFIRMACAO_PENDENTE,
  );
  assertEquals(isNfseTerminal(NFSE_STATUS.CONFIRMACAO_PENDENTE), false);
  assertEquals(isNfseTerminal(NFSE_STATUS.FALHOU), false);
});

Deno.test("somente desfechos fiscais comprováveis são terminais", () => {
  assertEquals(isNfseTerminal(NFSE_STATUS.AUTORIZADA), true);
  assertEquals(isNfseTerminal(NFSE_STATUS.REJEITADA), true);
  assertEquals(isNfseTerminal(NFSE_STATUS.CANCELADA), true);
});
