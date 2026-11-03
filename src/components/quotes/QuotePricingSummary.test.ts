import { describe, expect, it } from 'vitest';
import { calculateQuotePricingSummary } from './QuotePricingSummary';

describe('calculateQuotePricingSummary', () => {
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
