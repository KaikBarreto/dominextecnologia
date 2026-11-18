import { describe, expect, it } from 'vitest';

import { getScheduleVisibleWindow } from './scheduleVisibleWindow';

describe('getScheduleVisibleWindow', () => {
  const reference = new Date('2026-11-18T12:00:00');

  it('recorta somente o dia exibido', () => {
    expect(getScheduleVisibleWindow(reference, 'day')).toEqual({
      startDate: '2026-11-18',
      endDate: '2026-11-18',
    });
  });

  it('inclui os sete dias da semana visível', () => {
    expect(getScheduleVisibleWindow(reference, 'week')).toEqual({
      startDate: '2026-11-15',
      endDate: '2026-11-21',
    });
  });

  it('inclui os dias adjacentes renderizados na grade mensal', () => {
    expect(getScheduleVisibleWindow(reference, 'month')).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-12-05',
    });
  });
});
