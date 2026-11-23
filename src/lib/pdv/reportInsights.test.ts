import { describe, expect, it } from 'vitest';
import { compareMetric, paymentMethodLabel } from './reportInsights';

describe('insights gerenciais do PDV', () => {
  it('compara períodos sem dividir por zero', () => {
    expect(compareMetric(120, 100)).toEqual({ percent: 20, direction: 'up' });
    expect(compareMetric(0, 0)).toEqual({ percent: 0, direction: 'flat' });
    expect(compareMetric(50, 0)).toEqual({ percent: null, direction: 'new' });
  });

  it('traduz forma conhecida sem expor código interno desconhecido', () => {
    expect(paymentMethodLabel('pix')).toBe('Pix');
    expect(paymentMethodLabel('future_method')).toBe('Outra forma');
  });
});
