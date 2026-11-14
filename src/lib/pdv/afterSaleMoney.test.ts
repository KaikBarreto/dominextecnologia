import { describe, expect, it } from 'vitest';
import { parsePdvMoneyText, pdvMoneyCentsFromNumber, pdvMoneyDecimalFromCents, pdvMoneyInputFromCents } from './afterSaleMoney';

describe('dinheiro do pós-venda em centavos', () => {
  it.each([
    ['0,29', 29, '0.29'],
    ['0.29', 29, '0.29'],
    ['1,10', 110, '1.10'],
    ['1.10', 110, '1.10'],
  ])('converte %s sem aritmética de ponto flutuante', (input, cents, decimal) => {
    expect(parsePdvMoneyText(input)).toEqual({ cents, decimal });
  });

  it.each(['0,001', 'abc', '-1,00', '1e2', '1.234,56'])('rejeita entrada monetária inválida: %s', (input) => {
    expect(parsePdvMoneyText(input)).toBeNull();
  });

  it('aplica limites em centavos, inclusive o disponível', () => {
    expect(parsePdvMoneyText('10,00', { minCents: 1, maxCents: 1_000 })?.cents).toBe(1_000);
    expect(parsePdvMoneyText('10,01', { minCents: 1, maxCents: 1_000 })).toBeNull();
    expect(parsePdvMoneyText('0', { minCents: 1, maxCents: 1_000 })).toBeNull();
  });

  it('normaliza fronteiras vindas do servidor e do campo', () => {
    expect(pdvMoneyCentsFromNumber(0.29)).toBe(29);
    expect(pdvMoneyCentsFromNumber(1.1)).toBe(110);
    expect(pdvMoneyCentsFromNumber(0.001)).toBeNull();
    expect(pdvMoneyDecimalFromCents(110)).toBe('1.10');
    expect(pdvMoneyInputFromCents(110)).toBe('1,10');
  });
});
