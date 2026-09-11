import { describe, it, expect } from 'vitest';
import {
  addMonthsISO,
  buildInstallmentDates,
  splitInstallmentAmounts,
  buildInstallmentPlan,
} from './finance-installments';

/**
 * Regressão do bug do passo mensal: `Date.setMonth` nativo não faz clamp de fim
 * de mês, então 4 parcelas a partir de 31/01/2026 saíam
 * `31/01, 03/03, 31/03, 01/05`. O certo é `31/01, 28/02, 31/03, 30/04`.
 */
describe('addMonthsISO — passo mensal com clamp', () => {
  it('31/01 avança para 28/02 (ano comum), 31/03 e 30/04', () => {
    expect(buildInstallmentDates('2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('30/01 avança para 28/02 (clamp, nunca 02/03)', () => {
    expect(addMonthsISO('2026-01-30', 1)).toBe('2026-02-28');
  });

  it('29/01 avança para 28/02 em ano comum e 29/02 em bissexto', () => {
    expect(addMonthsISO('2026-01-29', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2028-01-29', 1)).toBe('2028-02-29');
  });

  it('31/01/2028 (bissexto) avança para 29/02', () => {
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('mês de 31 seguido de mês de 30 também faz clamp', () => {
    expect(addMonthsISO('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonthsISO('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('vira o ano corretamente', () => {
    expect(addMonthsISO('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonthsISO('2026-12-31', 2)).toBe('2027-02-28');
  });

  it('dia "seguro" (<=28) nunca desloca', () => {
    expect(buildInstallmentDates('2026-01-15', 6)).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15',
      '2026-04-15', '2026-05-15', '2026-06-15',
    ]);
  });

  it('offset 0 devolve a própria data', () => {
    expect(addMonthsISO('2026-01-31', 0)).toBe('2026-01-31');
  });
});

describe('splitInstallmentAmounts — rateio ao centavo', () => {
  const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

  it('1000 em 3x soma exatamente 1000', () => {
    const parts = splitInstallmentAmounts(1000, 3);
    expect(parts).toEqual([333.33, 333.33, 333.34]);
    expect(soma(parts)).toBe(1000);
  });

  it('0,01 em 2x soma exatamente 0,01 (sobra na última)', () => {
    const parts = splitInstallmentAmounts(0.01, 2);
    expect(soma(parts)).toBe(0.01);
  });

  it('8557,99 em 7x soma exatamente 8557,99', () => {
    const parts = splitInstallmentAmounts(8557.99, 7);
    expect(parts).toHaveLength(7);
    expect(soma(parts)).toBe(8557.99);
  });

  it('soma bate ao centavo para uma varredura de valores e parcelas', () => {
    const valores = [0.01, 0.03, 1, 9.99, 100, 1000, 1234.56, 8557.99, 99999.99];
    for (const total of valores) {
      for (let n = 1; n <= 12; n++) {
        expect(soma(splitInstallmentAmounts(total, n))).toBe(Math.round(total * 100) / 100);
      }
    }
  });

  it('à vista (1x) devolve o total inteiro', () => {
    expect(splitInstallmentAmounts(1234.56, 1)).toEqual([1234.56]);
  });
});

describe('buildInstallmentPlan', () => {
  it('casa data e valor por parcela', () => {
    expect(buildInstallmentPlan('2026-01-31', 1000, 3)).toEqual([
      { number: 1, date: '2026-01-31', amount: 333.33 },
      { number: 2, date: '2026-02-28', amount: 333.33 },
      { number: 3, date: '2026-03-31', amount: 333.34 },
    ]);
  });
});
