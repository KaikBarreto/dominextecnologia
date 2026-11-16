import { describe, expect, it } from 'vitest';
import { canUseDomiLinkWeight, domiLinkWeightQuantity } from './weight';

describe('peso explícito do DomiLink', () => {
  const reading = { weight_kg: 1.25, stable: true, unit: 'kg' as const };
  it('converte kg e g sem modificar a leitura', () => {
    expect(domiLinkWeightQuantity(reading, 'KG', 2)).toBe(1.25);
    expect(domiLinkWeightQuantity(reading, 'g', 2000)).toBe(1250);
    expect(reading.weight_kg).toBe(1.25);
    expect(canUseDomiLinkWeight('m')).toBe(false);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('recusa peso inválido %s', value => {
    expect(() => domiLinkWeightQuantity({ ...reading, weight_kg: value }, 'kg', 10)).toThrow();
  });
  it('recusa instabilidade, unidade incompatível e peso maior que o estoque', () => {
    expect(() => domiLinkWeightQuantity({ ...reading, stable: false }, 'kg', 10)).toThrow(/estável/);
    expect(() => domiLinkWeightQuantity(reading, 'un', 10)).toThrow(/kg ou g/);
    expect(() => domiLinkWeightQuantity(reading, 'kg', 1)).toThrow(/estoque/);
  });
});
