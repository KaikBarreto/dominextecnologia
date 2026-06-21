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
