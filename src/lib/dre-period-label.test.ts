import { describe, expect, it } from 'vitest';
import { formatDrePeriodLabel } from './dre-period-label';

describe('formatDrePeriodLabel', () => {
  it('usa o nome do mês para um mês civil completo', () => {
    expect(formatDrePeriodLabel({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) }))
      .toBe('Outubro de 2026');
  });

  it('resume meses civis completos consecutivos', () => {
    expect(formatDrePeriodLabel({ from: new Date(2026, 8, 1), to: new Date(2026, 9, 31) }))
      .toBe('Setembro a outubro de 2026');
  });

  it('preserva datas exatas em períodos parciais', () => {
    expect(formatDrePeriodLabel({ from: new Date(2026, 9, 3), to: new Date(2026, 9, 20) }))
      .toBe('03/10/2026 a 20/10/2026');
  });
});
