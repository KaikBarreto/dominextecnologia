import { describe, it, expect } from "vitest";

import { sanitizeNumeric } from "./numeric-input";

describe("sanitizeNumeric — inteiro", () => {
  it("texto vira vazio", () => {
    expect(sanitizeNumeric("asd")).toBe("");
  });

  it("filtra não-dígitos colados", () => {
    expect(sanitizeNumeric("ab12cd")).toBe("12");
  });

  it("remove zero à esquerda travado", () => {
    expect(sanitizeNumeric("048")).toBe("48");
    expect(sanitizeNumeric("007")).toBe("7");
  });

  it("apagar tudo vira vazio (nunca força 0)", () => {
    expect(sanitizeNumeric("")).toBe("");
  });

  it("preserva 0 sozinho", () => {
    expect(sanitizeNumeric("0")).toBe("0");
    expect(sanitizeNumeric("00")).toBe("0");
  });

  it("não aceita sinal/decimal no modo inteiro", () => {
    expect(sanitizeNumeric("-12")).toBe("12");
    expect(sanitizeNumeric("12,5")).toBe("125");
    expect(sanitizeNumeric("12.5")).toBe("125");
  });
});

describe("sanitizeNumeric — decimal", () => {
  const dec = { decimal: true };

  it("texto vira vazio", () => {
    expect(sanitizeNumeric("asd", dec)).toBe("");
  });

  it("remove zero à esquerda travado", () => {
    expect(sanitizeNumeric("048", dec)).toBe("48");
  });

  it("apagar tudo vira vazio", () => {
    expect(sanitizeNumeric("", dec)).toBe("");
  });

  it("preserva 0,5 e 0, durante a digitação", () => {
    expect(sanitizeNumeric("0,5", dec)).toBe("0,5");
    expect(sanitizeNumeric("0,", dec)).toBe("0,");
    expect(sanitizeNumeric(",5", dec)).toBe("0,5");
  });

  it("normaliza ponto pra vírgula", () => {
    expect(sanitizeNumeric("12.5", dec)).toBe("12,5");
  });

  it("colapsa separador duplicado", () => {
    expect(sanitizeNumeric("12,,3", dec)).toBe("12,3");
  });

  it("só um separador (1.2.3 → 1,23)", () => {
    expect(sanitizeNumeric("1.2.3", dec)).toBe("1,23");
  });

  it("não aceita negativo", () => {
    expect(sanitizeNumeric("-12,5", dec)).toBe("12,5");
  });

  it("colar texto sujo extrai o número", () => {
    expect(sanitizeNumeric("ab12,5cd", dec)).toBe("12,5");
  });

  it("respeita maxDecimals", () => {
    expect(sanitizeNumeric("12,3456", { decimal: true, maxDecimals: 2 })).toBe("12,34");
  });
});

// Bug real (2026-09-17): sócio do CEO colou "R$ 4.550" numa Nova Receita do
// contrato "PMOC - Daluz Freguesia" e as 72 parcelas nasceram de R$ 4,55 (mil
// vezes menor). Causa: "." era sempre lido como separador decimal, mesmo
// quando o texto colado inteiro era claramente milhar PT-BR. `pasted: true`
// é o modo usado pelo NumericInput no evento de colar (ver handlePaste).
describe("sanitizeNumeric — decimal colado (paste), notação PT-BR", () => {
  const pasteDec = (maxDecimals = 2) => ({ decimal: true, maxDecimals, pasted: true } as const);

  it("milhar simples: 4.550 → 4550 (não 4,55)", () => {
    expect(sanitizeNumeric("4.550", pasteDec())).toBe("4550");
  });

  it("com prefixo de moeda e espaço: 'R$ 4.550' → 4550", () => {
    expect(sanitizeNumeric("R$ 4.550", pasteDec())).toBe("4550");
  });

  it("formato BR completo com milhar e centavos: 1.234.567,89 → 1234567,89", () => {
    expect(sanitizeNumeric("1.234.567,89", pasteDec())).toBe("1234567,89");
  });

  it("vírgula é sempre decimal, mesmo colada: 4,55 → 4,55", () => {
    expect(sanitizeNumeric("4,55", pasteDec())).toBe("4,55");
  });

  it("centavos de verdade colados: 1.234,56 → 1234,56", () => {
    expect(sanitizeNumeric("1.234,56", pasteDec())).toBe("1234,56");
  });

  it("milhar encadeado sem centavos: 1.234.567 → 1234567", () => {
    expect(sanitizeNumeric("1.234.567", pasteDec())).toBe("1234567");
  });

  it("formato internacional (vírgula de milhar, ponto decimal): 1,234.56 → 1234,56", () => {
    expect(sanitizeNumeric("1,234.56", pasteDec())).toBe("1234,56");
  });

  // Ambíguos: só ponto, sem confirmação por vírgula. Decisão: ponto seguido
  // de EXATAMENTE 3 dígitos é milhar (dinheiro nunca tem 3 casas decimais em
  // BRL); qualquer outra contagem é decimal.
  it("ambíguo 4.55 (2 dígitos após o ponto) → decimal, 4,55", () => {
    expect(sanitizeNumeric("4.55", pasteDec())).toBe("4,55");
  });

  it("ambíguo 1.5 (1 dígito após o ponto) → decimal, 1,5", () => {
    expect(sanitizeNumeric("1.5", pasteDec())).toBe("1,5");
  });

  it("4.5555 (4 dígitos após o ponto) → decimal, maxDecimals corta pra 4,55", () => {
    expect(sanitizeNumeric("4.5555", pasteDec())).toBe("4,55");
  });

  it("texto sujo com milhar colado: 'Total: R$ 4.550,00 à vista' → 4550,00", () => {
    expect(sanitizeNumeric("Total: R$ 4.550,00 à vista", pasteDec())).toBe("4550,00");
  });

  it("sem separador nenhum: 4550 → 4550", () => {
    expect(sanitizeNumeric("4550", pasteDec())).toBe("4550");
  });

  it("maxDecimals indefinido preserva todas as casas coladas", () => {
    expect(sanitizeNumeric("1.234,5678", { decimal: true, pasted: true })).toBe("1234,5678");
  });
});

// Digitação incremental: prova que nenhum estado intermediário, caractere a
// caractere, quebra — em especial que a digitação NUNCA aciona a heurística
// de milhar (só paste aciona), porque digitar "4", ".", "5", "5", "0" passa
// por "4.55" (2 dígitos, decimal) antes de virar "4.550" (3 dígitos) — se a
// heurística de milhar valesse aqui, o campo saltaria de 4,55 pra 4550 no
// meio da digitação, o que é pior que o bug original.
describe("sanitizeNumeric — digitação incremental (sem pasted)", () => {
  function typeChars(chars: string, opts: { decimal?: boolean; maxDecimals?: number } = { decimal: true }) {
    let value = "";
    const steps: string[] = [];
    for (const ch of chars) {
      value = sanitizeNumeric(value + ch, opts);
      steps.push(value);
    }
    return steps;
  }

  it("digitar 4550,00 char a char nunca quebra e termina certo", () => {
    const steps = typeChars("4550,00", { decimal: true, maxDecimals: 2 });
    expect(steps).toEqual(["4", "45", "455", "4550", "4550,", "4550,0", "4550,00"]);
  });

  it("digitar 4.550 char a char NÃO ativa milhar no meio (fica decimal até o fim, maxDecimals corta pra 2)", () => {
    const steps = typeChars("4.550", { decimal: true, maxDecimals: 2 });
    // "4.55" (2 casas) é decimal legítimo enquanto digita; só ao colar o
    // texto inteiro de uma vez a heurística de milhar entra em ação.
    expect(steps).toEqual(["4", "4,", "4,5", "4,55", "4,55"]);
  });

  it("digitar 0,5 char a char nunca trava no zero", () => {
    expect(typeChars("0,5")).toEqual(["0", "0,", "0,5"]);
  });

  it("apagar tudo no meio da digitação some sem forçar 0", () => {
    const step1 = sanitizeNumeric("4,5", { decimal: true });
    const stepApagado = sanitizeNumeric("", { decimal: true });
    expect(step1).toBe("4,5");
    expect(stepApagado).toBe("");
  });

  it("digitar quantidade com 3 casas decimais válidas (maxDecimals indefinido) não é tratado como milhar", () => {
    const steps = typeChars("1,234", { decimal: true });
    expect(steps).toEqual(["1", "1,", "1,2", "1,23", "1,234"]);
  });
});
