import { describe, expect, it } from 'vitest';

import type { ServiceOrder } from '@/types/database';
import {
  buildDailySchedulePlan,
  expandServiceOrderScheduledDays,
  getScheduleSlotDurationMinutes,
  getScheduleSlotEndTime,
  shiftSchedulePlanToStart,
} from './serviceOrderSchedule';

function makeOrder(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: 'os-1',
    order_number: 1,
    customer_id: 'customer-1',
    os_type: 'instalacao',
    status: 'agendada',
    scheduled_date: '2026-10-20',
    scheduled_time: '07:30',
    duration_minutes: 480,
    scheduled_days: 1,
    created_at: '2026-10-19T10:00:00.000Z',
    updated_at: '2026-10-19T10:00:00.000Z',
    ...overrides,
  };
}

describe('expandServiceOrderScheduledDays', () => {
  it('usa horário e duração próprios de cada jornada', () => {
    const original = makeOrder({ schedule_plan: [
      { date: '2026-10-20', time: '07:30', duration_minutes: 480 },
      { date: '2026-10-21', time: '09:00', duration_minutes: 360 },
    ] });
    const result = expandServiceOrderScheduledDays([original]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ scheduled_date: '2026-10-20', scheduled_time: '07:30', duration_minutes: 480 });
    expect(result[1]).toMatchObject({
      id: 'os-1',
      scheduled_date: '2026-10-21',
      scheduled_time: '09:00',
      duration_minutes: 360,
      _scheduledSpanDisplay: true,
      _scheduledSpanDayIndex: 1,
      _scheduledSpanTotalDays: 2,
      _originalScheduledDate: '2026-10-20',
    });
  });

  it('gera a lista inclusiva do período sem depender do fuso do aparelho', () => {
    expect(buildDailySchedulePlan('2026-12-31', '2027-01-02', '07:30', 480)).toEqual([
      { date: '2026-12-31', time: '07:30', duration_minutes: 480 },
      { date: '2027-01-01', time: '07:30', duration_minutes: 480 },
      { date: '2027-01-02', time: '07:30', duration_minutes: 480 },
    ]);
  });

  it('não expande tarefas nem cópias visuais de retomada', () => {
    const plan = [
      { date: '2026-10-20', time: '07:30', duration_minutes: 480 },
      { date: '2026-10-21', time: '07:30', duration_minutes: 480 },
    ];
    const task = makeOrder({ id: 'task-1', entry_type: 'tarefa', schedule_plan: plan });
    const resumed = { ...makeOrder({ id: 'os-2', schedule_plan: plan }), _resumedDisplay: true } as ServiceOrder;

    expect(expandServiceOrderScheduledDays([task, resumed])).toHaveLength(2);
  });

  it('não duplica a mesma OS quando uma retomada coincide com uma jornada', () => {
    const original = makeOrder({ schedule_plan: [
      { date: '2026-10-20', time: '07:30', duration_minutes: 480 },
      { date: '2026-10-21', time: '07:30', duration_minutes: 480 },
    ] });
    const resumed = { ...original, scheduled_date: '2026-10-21', _resumedDisplay: true } as ServiceOrder;

    const result = expandServiceOrderScheduledDays([original, resumed]);
    expect(result.filter((order) => order.scheduled_date === '2026-10-21')).toHaveLength(1);
  });

  it('desloca o plano mantendo horário e duração de cada jornada', () => {
    expect(shiftSchedulePlanToStart([
      { date: '2026-10-20', time: '07:30', duration_minutes: 480 },
      { date: '2026-10-21', time: '09:00', duration_minutes: 360 },
    ], '2026-11-03')).toEqual([
      { date: '2026-11-03', time: '07:30', duration_minutes: 480 },
      { date: '2026-11-04', time: '09:00', duration_minutes: 360 },
    ]);
  });

  it('calcula o horário de término a partir da duração persistida', () => {
    expect(getScheduleSlotEndTime('07:30', 480)).toBe('15:30');
    expect(getScheduleSlotEndTime('20:00', 480)).toBe('04:00');
  });

  it('calcula a duração pelo início e término, inclusive após meia-noite', () => {
    expect(getScheduleSlotDurationMinutes('07:30', '15:30')).toBe(480);
    expect(getScheduleSlotDurationMinutes('20:00', '04:00')).toBe(480);
    expect(getScheduleSlotDurationMinutes('08:00', '08:00')).toBe(1440);
  });
});
