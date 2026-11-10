import { describe, expect, it } from 'vitest';
import { filterItemsByCivilDateRange, isDateInCivilRange } from './date-range';

describe('isDateInCivilRange', () => {
  it('inclui todo o último dia quando `to` chega à meia-noite', () => {
    const range = {
      from: new Date(2026, 1, 1, 0, 0, 0),
      to: new Date(2026, 1, 28, 0, 0, 0),
    };

    expect(isDateInCivilRange(new Date(2026, 1, 28, 12, 0, 0), range)).toBe(true);
    expect(isDateInCivilRange(new Date(2026, 2, 1, 0, 0, 0), range)).toBe(false);
  });

  it('inclui todo o primeiro dia mesmo quando `from` carrega horário', () => {
    const range = { from: new Date(2026, 1, 1, 18, 30, 0) };

    expect(isDateInCivilRange(new Date(2026, 1, 1, 12, 0, 0), range)).toBe(true);
    expect(isDateInCivilRange(new Date(2026, 0, 31, 23, 59, 59), range)).toBe(false);
  });
});

describe('filterItemsByCivilDateRange', () => {
  it('mantém o registro do último dia quando `to` chega à meia-noite', () => {
    const items = [
      { id: 'ultimo-dia', due_date: '2026-02-28' },
      { id: 'dia-seguinte', due_date: '2026-03-01' },
    ];
    const range = {
      from: new Date(2026, 1, 1, 0, 0, 0),
      to: new Date(2026, 1, 28, 0, 0, 0),
    };

    expect(filterItemsByCivilDateRange(items, range, 'due_date')).toEqual([items[0]]);
  });
});
