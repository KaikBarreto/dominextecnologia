import { describe, expect, it } from 'vitest';
import {
  looksLikeFormulaText,
  normalizeDate,
  normalizeDocument,
  normalizeHeader,
  parseBrazilianNumber,
  sanitizeSpreadsheetText,
} from './normalize';

describe('normalização de importação', () => {
  it('normaliza cabeçalho sem depender de acento, caixa ou pontuação', () => {
    expect(normalizeHeader('  CPF/CNPJ do Cliente  ')).toBe('cpf cnpj do cliente');
    expect(normalizeHeader('Código da Situação Tributária')).toBe('codigo da situacao tributaria');
  });

  it('mantém CPF/CNPJ como dígitos, sem converter para número', () => {
    expect(normalizeDocument('529.982.247-25')).toBe('52998224725');
    expect(normalizeDocument('11.222.333/0001-81')).toBe('11222333000181');
  });

  it.each([
    ['R$ 1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['-2,5', -2.5],
    [17.9, 17.9],
  ])('converte número brasileiro %p', (input, expected) => {
    expect(parseBrazilianNumber(input)).toBe(expected);
  });

  it('valida dia civil e ignora sentinela anterior a 1900', () => {
    expect(normalizeDate('31/10/2026')).toEqual({ value: '2026-10-31', legacy: false, invalid: false });
    expect(normalizeDate('31/02/2026')).toEqual({ value: null, legacy: false, invalid: true });
    expect(normalizeDate('01/01/0001')).toEqual({ value: null, legacy: true, invalid: false });
  });

  it('neutraliza texto que poderia virar fórmula em arquivo gerado', () => {
    expect(sanitizeSpreadsheetText('=SOMA(A1:A2)')).toBe("'=SOMA(A1:A2)");
    expect(sanitizeSpreadsheetText('@comando')).toBe("'@comando");
    expect(sanitizeSpreadsheetText('-12,50')).toBe('-12,50');
    expect(looksLikeFormulaText('+A1')).toBe(true);
    expect(looksLikeFormulaText('-12,50')).toBe(false);
  });
});
