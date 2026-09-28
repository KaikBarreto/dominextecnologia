import { describe, expect, it } from 'vitest';
import { buildFinanceCalendarDays } from '@/lib/finance-calendar';

describe('buildFinanceCalendarDays', () => {
  it('gera semanas completas de domingo a sábado', () => {
    const days = buildFinanceCalendarDays(new Date(2026, 8, 15));

    expect(days).toHaveLength(35);
    expect(days[0].getDay()).toBe(0);
    expect(days.at(-1)?.getDay()).toBe(6);
    expect(days.some((day) => day.getMonth() === 8 && day.getDate() === 30)).toBe(true);
  });

  it('inclui seis semanas quando o mês ocupa toda a grade', () => {
    const days = buildFinanceCalendarDays(new Date(2026, 7, 1));

    expect(days).toHaveLength(42);
    expect([days[0].getFullYear(), days[0].getMonth() + 1, days[0].getDate()]).toEqual([2026, 7, 26]);
    const last = days.at(-1)!;
    expect([last.getFullYear(), last.getMonth() + 1, last.getDate()]).toEqual([2026, 9, 5]);
  });
});
