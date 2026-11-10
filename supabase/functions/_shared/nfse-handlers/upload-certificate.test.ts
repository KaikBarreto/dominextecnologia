import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compararIdentidadeCertificado,
  custodiaCompleta,
  validarIdentidadeAntesDePersistir,
} from "./upload-certificate.ts";

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

Deno.test("A1 só é aceito quando o CNPJ exato do tenant confere", () => {
  assertEquals(
    compararIdentidadeCertificado(
      "12.345.678/0001-90",
      "12345678000190",
    ),
    "ok",
  );
  assertEquals(
    compararIdentidadeCertificado(
      "12.345.678/0001-90",
      "12.345.678/0002-70",
    ),
    "cnpj_divergente",
  );
});

Deno.test("identidade ausente ou malformada falha fechado", () => {
  assertEquals(
    compararIdentidadeCertificado(null, "12345678000190"),
    "empresa_sem_cnpj",
  );
  assertEquals(
    compararIdentidadeCertificado("12345678000190", undefined),
    "certificado_sem_cnpj",
  );
  assertEquals(
    compararIdentidadeCertificado("123", "12345678000190"),
    "empresa_sem_cnpj",
  );
  assertEquals(
    compararIdentidadeCertificado("12345678000190", "123"),
    "certificado_sem_cnpj",
  );
});

Deno.test("rejeição de identidade remove o objeto novo antes de persistir", async () => {
  let remocoes = 0;
  const remover = async () => {
    remocoes += 1;
  };

  assertEquals(
    await validarIdentidadeAntesDePersistir(
      "12345678000190",
      "12345678000270",
      remover,
    ),
    "cnpj_divergente",
  );
  assertEquals(remocoes, 1);

  assertEquals(
    await validarIdentidadeAntesDePersistir(
      "12345678000190",
      "12345678000190",
      remover,
    ),
    "ok",
  );
  assertEquals(remocoes, 1);
});
