// Testes das regras de TOMADOR/INTERMEDIÁRIO AVULSO (common.ts).
//
// São funções puras de propósito: é o único ponto do fluxo de NFS-e onde dá pra
// provar comportamento sem falar com o governo. Emitir nota de verdade pra
// testar tem efeito fiscal e cancelar depois custa caro.
//
// Rodar: deno test supabase/functions/_shared/nfse-handlers/avulso.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enderecoAvulsoCompleto,
  normalizarPessoaAvulsa,
  validarPessoaAvulsaParaEmissao,
} from "./common.ts";

// ---------------------------------------------------------------------------
// normalizarPessoaAvulsa
// ---------------------------------------------------------------------------

Deno.test("ausente, nulo ou não-objeto vira null (nunca {} gravado na coluna)", () => {
  assertEquals(normalizarPessoaAvulsa(undefined), null);
  assertEquals(normalizarPessoaAvulsa(null), null);
  assertEquals(normalizarPessoaAvulsa("Fulano"), null);
  assertEquals(normalizarPessoaAvulsa([{ nome: "Fulano" }]), null);
});

Deno.test("objeto sem nenhum campo preenchido é ausente, não 'tomador vazio'", () => {
  assertEquals(normalizarPessoaAvulsa({}), null);
  assertEquals(normalizarPessoaAvulsa({ nome: "   ", endereco: { cep: "" } }), null);
});

Deno.test("documento, CEP e IBGE são gravados SÓ EM DÍGITOS, uma vez só", () => {
  const p = normalizarPessoaAvulsa({
    nome: "  Padaria do Zé LTDA ",
    documento: "11.222.333/0001-81",
    endereco: { cep: "20040-020", ibge: "3304557", uf: "rj" },
  });
  assertEquals(p?.documento, "11222333000181");
  assertEquals(p?.nome, "Padaria do Zé LTDA");
  assertEquals(p?.endereco?.cep, "20040020");
  assertEquals(p?.endereco?.uf, "RJ");
});

Deno.test("campo vazio não vira string vazia no jsonb", () => {
  const p = normalizarPessoaAvulsa({ nome: "Fulano", email: "", endereco: {} });
  assertEquals(p, { nome: "Fulano" });
});

// ---------------------------------------------------------------------------
// validarPessoaAvulsaParaEmissao
// ---------------------------------------------------------------------------

const COMPLETO = {
  nome: "Padaria do Zé LTDA",
  documento: "11222333000181",
  endereco: {
    logradouro: "Rua das Flores",
    numero: "120",
    bairro: "Centro",
    cep: "20040020",
    ibge: "3304557",
  },
};

Deno.test("tomador completo passa", () => {
  assertEquals(validarPessoaAvulsaParaEmissao(COMPLETO, "tomador"), "");
});

Deno.test("tomador SEM endereço nenhum passa (o bloco é opcional na DPS)", () => {
  assertEquals(
    validarPessoaAvulsaParaEmissao(
      { nome: "Padaria", documento: "11222333000181" },
      "tomador",
    ),
    "",
  );
});

Deno.test("nome e documento são obrigatórios, em PT-BR e com o rótulo certo", () => {
  assertEquals(
    validarPessoaAvulsaParaEmissao({ documento: "11222333000181" }, "tomador"),
    "Informe o nome do tomador.",
  );
  assertEquals(
    validarPessoaAvulsaParaEmissao({ nome: "Padaria" }, "intermediário"),
    "Informe o CPF/CNPJ do intermediário.",
  );
  assertEquals(validarPessoaAvulsaParaEmissao(null, "tomador"), "Informe os dados do tomador.");
});

Deno.test("documento passa pelo dígito verificador (não só pelo tamanho)", () => {
  // 14 dígitos, tamanho certo, DV errado — o caminho do cliente cadastrado
  // deixaria passar e a prefeitura recusaria. Aqui o dado nasce agora.
  const erro = validarPessoaAvulsaParaEmissao(
    { nome: "Padaria", documento: "11222333000199" },
    "tomador",
  );
  assertEquals(erro, "O CPF/CNPJ do tomador é inválido. Confira os números digitados.");
  // CPF válido (11 dígitos) passa.
  assertEquals(
    validarPessoaAvulsaParaEmissao({ nome: "Zé", documento: "52998224725" }, "tomador"),
    "",
  );
});

Deno.test("endereço PELA METADE é 422 dizendo o que falta (armadilha E1235)", () => {
  const erro = validarPessoaAvulsaParaEmissao(
    {
      nome: "Padaria",
      documento: "11222333000181",
      endereco: { logradouro: "Rua das Flores", numero: "120", cidade: "Rio de Janeiro" },
    },
    "tomador",
  );
  assertEquals(
    erro,
    "Complete o endereço do tomador (falta: bairro, CEP, código IBGE do município (preenchido pela busca do CEP)) ou deixe o endereço todo em branco.",
  );
});

Deno.test("IBGE sozinho ausente já derruba: foi o campo que quebrou a 1ª nota real", () => {
  const erro = validarPessoaAvulsaParaEmissao(
    { ...COMPLETO, endereco: { ...COMPLETO.endereco, ibge: "" } },
    "tomador",
  );
  assertEquals(erro.includes("código IBGE"), true);
});

// ---------------------------------------------------------------------------
// enderecoAvulsoCompleto — decide se o bloco `end` vai no XML
// ---------------------------------------------------------------------------

Deno.test("bloco de endereço só é montado quando TODOS os exigidos existem", () => {
  assertEquals(enderecoAvulsoCompleto(COMPLETO.endereco), true);
  assertEquals(enderecoAvulsoCompleto({ ...COMPLETO.endereco, bairro: "" }), false);
  assertEquals(enderecoAvulsoCompleto(undefined), false);
  // cidade/uf NÃO entram: não existem na DPS (o município vai pelo IBGE).
  assertEquals(
    enderecoAvulsoCompleto({ ...COMPLETO.endereco, cidade: undefined, uf: undefined }),
    true,
  );
});
