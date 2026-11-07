import { describe, expect, it } from 'vitest';
import { calculateQuotePricingSummary } from './QuotePricingSummary';

describe('calculateQuotePricingSummary', () => {
  it('exibe a diferença preço/custo do exemplo sem recalcular BDI no resumo', () => {
    const result = calculateQuotePricingSummary({
      laborCost: 340, resourcesCost: 215, inputsCost: 138, materialsCost: 0,
      displacementCost: 150, suggestedPrice: 1239.71, practicedPrice: 1239.71,
      discountAmount: 0, cashDiscountRate: 6, installments: 10,
    });
    expect(result.practicedAfterDiscount).toBe(1239.71);
    expect(result.totalCost).toBe(843);
    expect(result.profit).toBeCloseTo(396.71, 2);
    expect(result.margin).toBeCloseTo(32, 2);
    expect(result.cashPrice).toBeCloseTo(1165.33, 2);
    expect(result.installmentValue).toBeCloseTo(123.97, 2);
  });

  it('separa custos, preço praticado, lucro, margem e pagamentos', () => {
    const result = calculateQuotePricingSummary({
      laborCost: 100,
      resourcesCost: 20,
      materialsCost: 80,
      displacementCost: 50,
      suggestedPrice: 400,
      practicedPrice: 380,
      discountAmount: 30,
      cashDiscountRate: 5,
      installments: 5,
    });

    expect(result.totalCost).toBe(250);
    expect(result.practicedAfterDiscount).toBe(350);
    expect(result.profit).toBe(100);
    expect(result.margin).toBeCloseTo(28.5714, 4);
    expect(result.cashPrice).toBe(332.5);
    expect(result.installmentValue).toBe(70);
  });
});
