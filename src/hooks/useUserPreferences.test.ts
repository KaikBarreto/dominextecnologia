import { describe, expect, it } from 'vitest';
import { normalizeScheduleEntryTypeFilter } from './useUserPreferences';

describe('normalizeScheduleEntryTypeFilter', () => {
  it('mantem os tres estados canonicos da Agenda', () => {
    expect(normalizeScheduleEntryTypeFilter([])).toEqual([]);
    expect(normalizeScheduleEntryTypeFilter(['os'])).toEqual(['os']);
    expect(normalizeScheduleEntryTypeFilter(['tarefa'])).toEqual(['tarefa']);
  });

  it('trata os dois tipos e valores desconhecidos como Tudo', () => {
    expect(normalizeScheduleEntryTypeFilter(['tarefa', 'os'])).toEqual([]);
    expect(normalizeScheduleEntryTypeFilter(['desconhecido'])).toEqual([]);
  });

  it('remove duplicatas e preserva apenas valores permitidos', () => {
    expect(normalizeScheduleEntryTypeFilter(['os', 'os', 'desconhecido'])).toEqual(['os']);
  });
});
