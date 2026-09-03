// =============================================================================
// Testes da CLASSIFICAÇÃO DE FALHA da emissão de NFS-e.
// =============================================================================
// Rodar: deno test supabase/functions/_shared/nfse-handlers/emit.test.ts
//
// O que está sendo protegido: quando a emissão falha, o sistema decide (a) se
// aquilo vira linha em `nfse_emissions` e (b) com qual status. Errar isso tem
// dois custos opostos e ambos caros:
//   - registrar demais → lista do cliente vira lixeira de indisponibilidade;
//   - registrar de menos → a nota "some" e ninguém consegue diagnosticar nada.
//     Foi exatamente o rastro de uma tentativa que revelou, em 2026-09-02, que o
//     provedor antigo roteava o Rio de Janeiro para um endpoint morto.
// =============================================================================

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  NfseProviderError,
  NfseProviderUnconfiguredError,
  NfseProviderUnsupportedError,
} from "../nfse-provider.ts";
import { deveRegistrarTentativa, ehRecusaDeDocumento } from "./emit.ts";

// --- Recusa da administração tributária → linha `rejeitada` -------------------

Deno.test("rejeição do governo (E0312) é recusa de documento e vira linha", () => {
  const err = new NfseProviderError(
    "A prefeitura recusou a nota fiscal: código não administrado pelo município",
    422,
    { codigo: "E0312" },
  );
  assertEquals(ehRecusaDeDocumento(err), true);
  assertEquals(deveRegistrarTentativa(err), true);
});

Deno.test("rejeição do provedor intermediado (NFSE_REJECTED) também vira linha", () => {
  const err = new NfseProviderError("Rejeitada", 422, { codigo: "NFSE_REJECTED" });
  assertEquals(ehRecusaDeDocumento(err), true);
  assertEquals(deveRegistrarTentativa(err), true);
});

Deno.test("erro de validação (400) é recusa de documento", () => {
  const err = new NfseProviderError("Dados inválidos", 400, { codigo: "VALIDATION_ERROR" });
  assertEquals(ehRecusaDeDocumento(err), true);
});

// --- Pré-condição nossa → NÃO vira linha -------------------------------------

Deno.test("certificado ausente não vira nota rejeitada", () => {
  // A prefeitura nunca viu este documento: virar "nota rejeitada" na lista do
  // cliente seria mentira, e o motivo real (configuração) já aparece na tela.
  const err = new NfseProviderError("Envie o certificado digital…", 422, {
    codigo: "certificado_ausente",
  });
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), false);
});

Deno.test("CNPJ ausente não vira nota rejeitada", () => {
  const err = new NfseProviderError("Cadastre o CNPJ…", 422, { codigo: "cnpj_ausente" });
  assertEquals(deveRegistrarTentativa(err), false);
});

Deno.test("limite de plano e rate limit não viram nota rejeitada", () => {
  for (const codigo of ["COMPANY_PLAN_LIMIT", "RATE_LIMITED", "CERTIFICATE_INVALID"]) {
    const err = new NfseProviderError("…", 422, { codigo });
    assertEquals(deveRegistrarTentativa(err), false, codigo);
  }
});

Deno.test("integração não configurada não vira linha", () => {
  assertEquals(deveRegistrarTentativa(new NfseProviderUnconfiguredError()), false);
  assertEquals(deveRegistrarTentativa(new NfseProviderUnsupportedError()), false);
});

// --- Indisponibilidade → NÃO vira linha (evita lixo a cada retentativa) -------

Deno.test("serviço indisponível não vira linha nem recusa", () => {
  const err = new NfseProviderError("Indisponível", 503, { codigo: "servico_indisponivel" });
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), false);
});

// --- Desconhecido → vira linha `falhou` (é onde o rastro vale mais) ----------

Deno.test("erro 502 sem código vira linha, mas como falha e não como recusa", () => {
  const err = new NfseProviderError("Erro do provedor", 502);
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), true);
});

Deno.test("erro inesperado (bug nosso) vira linha: é o caso que ninguém previu", () => {
  const err = new TypeError("undefined is not a function");
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), true);
});
