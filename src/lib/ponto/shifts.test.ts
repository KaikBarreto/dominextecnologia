import { describe, it, expect } from 'vitest';
import {
  groupIntoShifts, shiftWorkedMinutes, countShifts, countShiftsPerDay, shiftCountKey,
  formatShiftOutTime, type ShiftCountRecord,
} from './shifts';
import type { PunchType, TimeRecord } from '@/hooks/useTimeRecords';

function toCountRecord(r: TimeRecord): ShiftCountRecord {
  return { employee_id: r.employee_id, date: r.date, type: r.type, recorded_at: r.recorded_at, is_valid: r.is_valid };
}

let seq = 0;
function rec(type: PunchType, recordedAt: string, over: Partial<TimeRecord> = {}): TimeRecord {
  seq += 1;
  return {
    id: `rec-${seq}`,
    company_id: 'company-1',
    user_id: 'user-1',
    employee_id: 'employee-1',
    date: '2026-09-20',
    type,
    recorded_at: recordedAt,
    latitude: null,
    longitude: null,
    address: null,
    photo_url: null,
    device_info: null,
    source: 'app',
    notes: null,
    is_valid: true,
    created_at: recordedAt,
    edited_at: null,
    edited_by: null,
    original_recorded_at: null,
    invalidated_at: null,
    invalidated_by: null,
    ...over,
  };
}

describe('groupIntoShifts', () => {
  it('lista vazia devolve lista vazia', () => {
    expect(groupIntoShifts([])).toEqual([]);
  });

  it('1 jornada simples, sem intervalo', () => {
    const clockIn = rec('clock_in', '2026-09-20T11:00:00Z');
    const clockOut = rec('clock_out', '2026-09-20T15:00:00Z');
    const shifts = groupIntoShifts([clockIn, clockOut]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toEqual({ in: clockIn, out: clockOut, breakMin: 0 });
    expect(shiftWorkedMinutes(shifts[0])).toBe(240); // 4h
  });

  it('1 jornada com intervalo descontado', () => {
    const clockIn = rec('clock_in', '2026-09-20T11:00:00Z'); // 08:00 BRT
    const breakStart = rec('break_start', '2026-09-20T15:00:00Z'); // 12:00
    const breakEnd = rec('break_end', '2026-09-20T16:00:00Z'); // 13:00
    const clockOut = rec('clock_out', '2026-09-20T20:00:00Z'); // 17:00
    const shifts = groupIntoShifts([clockIn, breakStart, breakEnd, clockOut]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].breakMin).toBe(60);
    expect(shiftWorkedMinutes(shifts[0])).toBe(9 * 60 - 60); // 9h - 1h intervalo
  });

  it('2 jornadas no mesmo dia (plantão noturno depois da jornada normal)', () => {
    const inA = rec('clock_in', '2026-09-20T11:00:00Z'); // 08:00
    const breakStart = rec('break_start', '2026-09-20T15:00:00Z'); // 12:00
    const breakEnd = rec('break_end', '2026-09-20T16:00:00Z'); // 13:00
    const outA = rec('clock_out', '2026-09-20T20:00:00Z'); // 17:00
    const inB = rec('clock_in', '2026-09-21T02:00:00Z'); // 23:00 do dia 20
    const outB = rec('clock_out', '2026-09-21T04:10:00Z'); // 01:10 do dia 21
    const shifts = groupIntoShifts([inA, breakStart, breakEnd, outA, inB, outB]);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toEqual({ in: inA, out: outA, breakMin: 60 });
    expect(shifts[1]).toEqual({ in: inB, out: outB, breakMin: 0 });

    const totalWorked = shiftWorkedMinutes(shifts[0]) + shiftWorkedMinutes(shifts[1]);
    expect(totalWorked).toBe(10 * 60 + 10); // 10h10 no total do dia, do exemplo do plano
  });

  it('2ª jornada ainda aberta (sem clock_out) entra com out null', () => {
    const inA = rec('clock_in', '2026-09-20T11:00:00Z');
    const outA = rec('clock_out', '2026-09-20T20:00:00Z');
    const inB = rec('clock_in', '2026-09-21T02:00:00Z');
    const shifts = groupIntoShifts([inA, outA, inB]);
    expect(shifts).toHaveLength(2);
    expect(shifts[1]).toEqual({ in: inB, out: null, breakMin: 0 });
  });

  it('clock_out órfão (sem clock_in antes) não quebra e não some', () => {
    const orphanOut = rec('clock_out', '2026-09-20T12:00:00Z');
    const shifts = groupIntoShifts([orphanOut]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toEqual({ in: null, out: orphanOut, breakMin: 0 });
    expect(shiftWorkedMinutes(shifts[0])).toBe(0);
  });

  it('ignora registros inválidos (is_valid: false)', () => {
    const clockIn = rec('clock_in', '2026-09-20T11:00:00Z');
    const invalidOut = rec('clock_out', '2026-09-20T13:00:00Z', { is_valid: false });
    const clockOut = rec('clock_out', '2026-09-20T15:00:00Z');
    const shifts = groupIntoShifts([clockIn, invalidOut, clockOut]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].out).toEqual(clockOut);
  });
});

describe('countShifts / countShiftsPerDay', () => {
  it('sempre bate com groupIntoShifts(...).length nos mesmos cenários', () => {
    const scenarios: TimeRecord[][] = [
      [],
      [rec('clock_in', '2026-09-20T11:00:00Z'), rec('clock_out', '2026-09-20T15:00:00Z')],
      [
        rec('clock_in', '2026-09-20T11:00:00Z'),
        rec('break_start', '2026-09-20T15:00:00Z'),
        rec('break_end', '2026-09-20T16:00:00Z'),
        rec('clock_out', '2026-09-20T20:00:00Z'),
        rec('clock_in', '2026-09-21T02:00:00Z'),
        rec('clock_out', '2026-09-21T04:10:00Z'),
      ],
      [rec('clock_out', '2026-09-20T12:00:00Z')], // órfão
      [rec('clock_in', '2026-09-20T11:00:00Z'), rec('clock_out', '2026-09-20T20:00:00Z'), rec('clock_in', '2026-09-21T02:00:00Z')], // 2ª aberta
    ];
    for (const records of scenarios) {
      expect(countShifts(records.map(toCountRecord))).toBe(groupIntoShifts(records).length);
    }
  });

  it('agrupa por employee_id + date, dias/funcionários diferentes não se misturam', () => {
    const dayA = [
      rec('clock_in', '2026-09-20T11:00:00Z', { employee_id: 'emp-a', date: '2026-09-20' }),
      rec('clock_out', '2026-09-20T15:00:00Z', { employee_id: 'emp-a', date: '2026-09-20' }),
      rec('clock_in', '2026-09-20T18:00:00Z', { employee_id: 'emp-a', date: '2026-09-20' }),
      rec('clock_out', '2026-09-20T21:00:00Z', { employee_id: 'emp-a', date: '2026-09-20' }),
    ];
    const dayB = [
      rec('clock_in', '2026-09-21T11:00:00Z', { employee_id: 'emp-a', date: '2026-09-21' }),
      rec('clock_out', '2026-09-21T15:00:00Z', { employee_id: 'emp-a', date: '2026-09-21' }),
    ];
    const otherEmployee = [
      rec('clock_in', '2026-09-20T11:00:00Z', { employee_id: 'emp-b', date: '2026-09-20' }),
      rec('clock_out', '2026-09-20T15:00:00Z', { employee_id: 'emp-b', date: '2026-09-20' }),
    ];
    const counts = countShiftsPerDay([...dayA, ...dayB, ...otherEmployee].map(toCountRecord));
    expect(counts.get(shiftCountKey('emp-a', '2026-09-20'))).toBe(2);
    expect(counts.get(shiftCountKey('emp-a', '2026-09-21'))).toBe(1);
    expect(counts.get(shiftCountKey('emp-b', '2026-09-20'))).toBe(1);
  });
});

describe('formatShiftOutTime', () => {
  it('sem sufixo quando a saída é no mesmo dia do espelho', () => {
    expect(formatShiftOutTime('2026-09-20T20:00:00Z', '2026-09-20', 'America/Sao_Paulo', '+1')).toBe('17:00');
  });

  it('com sufixo "+1" quando a saída cai no dia seguinte (jornada noturna)', () => {
    // 2026-09-21T04:10:00Z = 01:10 em America/Sao_Paulo, dia 21 > dia do espelho (20).
    expect(formatShiftOutTime('2026-09-21T04:10:00Z', '2026-09-20', 'America/Sao_Paulo', '+1')).toBe('01:10 +1');
  });
});
