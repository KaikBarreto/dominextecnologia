import { describe, expect, it } from 'vitest';
import {
  calculateDreVariation,
  formatDreComparisonPeriod,
  getDreComparisonRange,
} from './dre-period-comparison';

describe('getDreComparisonRange', () => {
  it('trata mês como mês calendário no período imediatamente anterior', () => {
    const result = getDreComparisonRange(
      { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) },
      'previous_period',
    );

    expect(formatDreComparisonPeriod(result)).toBe('Setembro de 2026');
  });

  it('preserva a quantidade inclusiva de dias em intervalos que não são meses fechados', () => {
    const result = getDreComparisonRange(
      { from: new Date(2026, 9, 10), to: new Date(2026, 9, 20) },
      'previous_period',
    );

    expect(formatDreComparisonPeriod(result)).toBe('29/09/2026 a 09/10/2026');
  });

  it('compara com o mesmo intervalo do ano anterior', () => {
    const result = getDreComparisonRange(
      { from: new Date(2026, 1, 1), to: new Date(2026, 1, 28) },
      'previous_year',
    );

    expect(formatDreComparisonPeriod(result)).toBe('Fevereiro de 2025');
  });

  it('não cria comparação sem intervalo fechado', () => {
    expect(getDreComparisonRange({ from: new Date(2026, 9, 1) }, 'previous_period')).toBeUndefined();
    expect(getDreComparisonRange(undefined, 'previous_year')).toBeUndefined();
    expect(getDreComparisonRange({ from: new Date(), to: new Date() }, 'none')).toBeUndefined();
  });
});

describe('calculateDreVariation', () => {
  it('calcula variação absoluta e percentual com base anterior', () => {
    expect(calculateDreVariation(125, 100)).toEqual({ absolute: 25, percentage: 0.25 });
  });

  it('não inventa percentual quando a base anterior é zero', () => {
    expect(calculateDreVariation(25, 0)).toEqual({ absolute: 25, percentage: null });
  });

  it('usa o módulo da base para valores anteriores negativos', () => {
    expect(calculateDreVariation(-80, -100)).toEqual({ absolute: 20, percentage: 0.2 });
  });
});
