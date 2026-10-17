import { describe, expect, it } from 'vitest';
import { companyClock } from '../../supabase/functions/activate-scheduled-orders/timezone';

describe('activate-scheduled-orders timezone', () => {
  const instant = new Date('2026-10-16T23:30:45.000Z');

  it('resolve data e hora civil separadamente por tenant', () => {
    expect(companyClock(instant, 'America/Sao_Paulo')).toMatchObject({
      date: '2026-10-16',
      time: '20:30:45',
    });
    expect(companyClock(instant, 'Europe/Lisbon')).toMatchObject({
      date: '2026-10-17',
      time: '00:30:45',
    });
  });

  it('falha fechado quando o timezone é inválido ou ausente', () => {
    expect(companyClock(instant, 'timezone-invalido')).toBeNull();
    expect(companyClock(instant, null)).toBeNull();
  });
});
