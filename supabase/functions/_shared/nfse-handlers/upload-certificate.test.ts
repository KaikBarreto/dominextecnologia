import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { custodiaCompleta } from "./upload-certificate.ts";

const CUSTODIA = {
  certificadoRef: "empresa/certificado-cifrado.b64",
  dekEnvelopada: "dek-cifrada",
  senhaCifrada: "senha-cifrada",
  nonce: "nonce",
  algoritmo: "AES-256-GCM",
};

Deno.test("custódia completa pode ser persistida", () => {
  assertEquals(custodiaCompleta(CUSTODIA), true);
});

Deno.test("custódia parcial nunca é aceita", () => {
  assertEquals(custodiaCompleta(undefined), false);
  assertEquals(custodiaCompleta({ ...CUSTODIA, certificadoRef: "" }), false);
  assertEquals(custodiaCompleta({ ...CUSTODIA, dekEnvelopada: "" }), false);
  assertEquals(custodiaCompleta({ ...CUSTODIA, senhaCifrada: "" }), false);
  assertEquals(custodiaCompleta({ ...CUSTODIA, nonce: "" }), false);
});
