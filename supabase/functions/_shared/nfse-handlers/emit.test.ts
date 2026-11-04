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
//     Foi exatamente o rastro de uma tentativa que revelou uma falha de
//     roteamento fiscal difícil de reproduzir.
// =============================================================================

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  NfseProviderError,
  NfseProviderUnconfiguredError,
} from "../nfse-provider.ts";
import {
  deveRegistrarTentativa,
  ehRecusaDeDocumento,
  validarProntidaoFiscal,
} from "./emit.ts";

// --- Recusa oficial → linha `rejeitada` ----------------------------------------

Deno.test("rejeição do governo (E0312) é recusa de documento e vira linha", () => {
  const err = new NfseProviderError(
    "A prefeitura recusou a nota fiscal: código não administrado pelo município",
    422,
    { codigo: "E0312" },
  );
  assertEquals(ehRecusaDeDocumento(err), true);
  assertEquals(deveRegistrarTentativa(err), true);
});

Deno.test("rejeição de domínio do motor também vira linha", () => {
  const err = new NfseProviderError("Rejeitada", 422, {
    codigo: "documento_rejeitado",
  });
  assertEquals(ehRecusaDeDocumento(err), true);
  assertEquals(deveRegistrarTentativa(err), true);
});

Deno.test("erro de validação local não afirma recusa da administração tributária", () => {
  const err = new NfseProviderError("Dados inválidos", 400, {
    codigo: "dados_invalidos",
  });
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), true);
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
  const err = new NfseProviderError("Cadastre o CNPJ…", 422, {
    codigo: "cnpj_ausente",
  });
  assertEquals(deveRegistrarTentativa(err), false);
});

Deno.test("falhas de certificado e cobertura não viram nota rejeitada", () => {
  for (const codigo of ["certificado_invalido", "cobertura_indisponivel"]) {
    const err = new NfseProviderError("…", 422, { codigo });
    assertEquals(deveRegistrarTentativa(err), false, codigo);
  }
});

Deno.test("integração não configurada não vira linha", () => {
  assertEquals(
    deveRegistrarTentativa(new NfseProviderUnconfiguredError()),
    false,
  );
});

// --- Indisponibilidade → NÃO vira linha (evita lixo a cada retentativa) -------

Deno.test("serviço indisponível não vira linha nem recusa", () => {
  const err = new NfseProviderError("Indisponível", 503, {
    codigo: "servico_indisponivel",
  });
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), false);
});

// --- Desconhecido → fica aguardando confirmação (o rastro continua) ----------

Deno.test("erro 502 sem código vira linha, mas como falha e não como recusa", () => {
  const err = new NfseProviderError("Erro do motor", 502);
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), true);
});

Deno.test("erro inesperado (bug nosso) vira linha: é o caso que ninguém previu", () => {
  const err = new TypeError("undefined is not a function");
  assertEquals(ehRecusaDeDocumento(err), false);
  assertEquals(deveRegistrarTentativa(err), true);
});

// --- Gate de prontidão antes de qualquer efeito fiscal -----------------------

const AGORA = Date.parse("2026-11-04T23:00:00Z");
const CONFIG_OK = {
  pode_emitir: true,
  certificado_ref: "tenant/certificado-cifrado.b64",
  certificate_expires_at: "2027-11-04T23:00:00Z",
};

Deno.test("configuração pronta passa pelo gate fiscal", () => {
  assertEquals(validarProntidaoFiscal(CONFIG_OK, AGORA), null);
});

Deno.test("município não confirmado falha antes do certificado", () => {
  assertEquals(
    validarProntidaoFiscal({ ...CONFIG_OK, pode_emitir: false }, AGORA)?.error,
    "municipality_not_enabled",
  );
});

Deno.test("certificado ausente ou sem validade conhecida falha fechado", () => {
  assertEquals(
    validarProntidaoFiscal({ ...CONFIG_OK, certificado_ref: null }, AGORA)
      ?.error,
    "certificate_missing",
  );
  assertEquals(
    validarProntidaoFiscal(
      { ...CONFIG_OK, certificate_expires_at: null },
      AGORA,
    )?.error,
    "certificate_expiry_unknown",
  );
});

Deno.test("certificado expirado falha fechado", () => {
  assertEquals(
    validarProntidaoFiscal(
      { ...CONFIG_OK, certificate_expires_at: "2026-11-04T22:59:59Z" },
      AGORA,
    )?.error,
    "certificate_expired",
  );
});
