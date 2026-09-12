import { describe, it, expect } from 'vitest';
import { evaluateFeeSanity } from './fee-sanity';

/**
 * Regressão do caso real: tarifa de R$ 6.600,00 sobre venda de R$ 795,24
 * (830% da venda) aceita sem aviso. `total_value` do orçamento estava certo;
 * a tarifa é que foi digitada errada.
 */
describe('evaluateFeeSanity', () => {
  it('bloqueia o caso real de produção (tarifa >> venda)', () => {
    const result = evaluateFeeSanity(6600, 795.24);
    expect(result.level).toBe('bloqueia');
  });

  it('bloqueia quando a tarifa é igual à venda (nunca é correto)', () => {
    expect(evaluateFeeSanity(500, 500).level).toBe('bloqueia');
  });

  it('bloqueia quando a tarifa é maior que a venda', () => {
    expect(evaluateFeeSanity(501, 500).level).toBe('bloqueia');
  });

  it('alerta quando a tarifa passa de 20% da venda mas é menor que ela', () => {
    const result = evaluateFeeSanity(150, 500); // 30%
    expect(result.level).toBe('alerta');
    expect(result.ratio).toBeCloseTo(0.3);
  });

  it('ok logo abaixo do limiar de alerta (20%)', () => {
    expect(evaluateFeeSanity(100, 500).level).toBe('ok'); // exatamente 20%
    expect(evaluateFeeSanity(99, 500).level).toBe('ok');
  });

  it('ok para tarifa pequena e plausível', () => {
    expect(evaluateFeeSanity(5, 795.24).level).toBe('ok');
  });

  it('ok quando a tarifa é zero (campo vazio/limpo)', () => {
    const result = evaluateFeeSanity(0, 1000);
    expect(result.level).toBe('ok');
    expect(result.ratio).toBe(0);
  });

  it('ok quando a tarifa é negativa (não é caso real do form, mas não trava a venda)', () => {
    expect(evaluateFeeSanity(-10, 1000).level).toBe('ok');
  });

  it('ok quando a venda é zero, mesmo com tarifa positiva (não dá pra avaliar proporção)', () => {
    const result = evaluateFeeSanity(50, 0);
    expect(result.level).toBe('ok');
    expect(result.ratio).toBeNull();
  });

  it('ok quando venda e tarifa são ambas zero', () => {
    const result = evaluateFeeSanity(0, 0);
    expect(result.level).toBe('ok');
    expect(result.ratio).toBeNull();
  });
});
