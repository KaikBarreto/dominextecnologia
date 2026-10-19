import type { ServiceOrder, ServiceOrderScheduleSlot } from '@/types/database';

export type ScheduledServiceOrderOccurrence<T extends ServiceOrder = ServiceOrder> = T & {
  _scheduledSpanDisplay?: boolean;
  _scheduledSpanDayIndex?: number;
  _scheduledSpanTotalDays?: number;
  _originalScheduledDate?: string;
};

const MAX_SCHEDULED_DAYS = 31;

function timeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

export function getScheduleSlotEndTime(startTime: string, durationMinutes: number): string {
  const startMinutes = timeToMinutes(startTime);
  if (startMinutes === null || !Number.isFinite(durationMinutes)) return '';
  return minutesToTime(startMinutes + durationMinutes);
}

export function getScheduleSlotDurationMinutes(startTime: string, endTime: string): number | null {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return null;
  const difference = endMinutes - startMinutes;
  return difference > 0 ? difference : difference + 1440;
}

function addIsoDays(date: string, amount: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function isScheduleSlot(value: unknown): value is ServiceOrderScheduleSlot {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Partial<ServiceOrderScheduleSlot>;
  return typeof slot.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(slot.date)
    && typeof slot.time === 'string'
    && /^\d{2}:\d{2}(?::\d{2})?$/.test(slot.time)
    && Number.isInteger(slot.duration_minutes)
    && Number(slot.duration_minutes) >= 15
    && Number(slot.duration_minutes) <= 480;
}

export function normalizeServiceOrderSchedulePlan(
  order: Pick<ServiceOrder, 'scheduled_date' | 'scheduled_time' | 'duration_minutes' | 'schedule_plan'>,
): ServiceOrderScheduleSlot[] {
  const uniqueDates = new Set<string>();
  const plan = Array.isArray(order.schedule_plan)
    ? order.schedule_plan
        .filter(isScheduleSlot)
        .filter((slot) => {
          if (uniqueDates.has(slot.date)) return false;
          uniqueDates.add(slot.date);
          return true;
        })
        .slice(0, MAX_SCHEDULED_DAYS)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  if (plan.length > 0) return plan;
  if (!order.scheduled_date || !order.scheduled_time) return [];
  return [{
    date: order.scheduled_date,
    time: order.scheduled_time.slice(0, 5),
    duration_minutes: order.duration_minutes ?? 120,
  }];
}

export function buildDailySchedulePlan(
  startDate: string,
  endDate: string,
  defaultTime: string,
  defaultDurationMinutes: number,
  currentPlan: ServiceOrderScheduleSlot[] = [],
): ServiceOrderScheduleSlot[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const byDate = new Map(currentPlan.map((slot) => [slot.date, slot]));
  const plan: ServiceOrderScheduleSlot[] = [];

  for (let offset = 0; offset < MAX_SCHEDULED_DAYS; offset += 1) {
    const date = addIsoDays(startDate, offset);
    if (!date || date > endDate) break;
    plan.push(byDate.get(date) ?? {
      date,
      time: defaultTime.slice(0, 5),
      duration_minutes: defaultDurationMinutes,
    });
  }

  return plan;
}

export function shiftSchedulePlanToStart(
  plan: ServiceOrderScheduleSlot[],
  nextStartDate: string,
): ServiceOrderScheduleSlot[] {
  if (plan.length === 0) return [];
  const first = new Date(`${plan[0].date}T12:00:00Z`);
  const next = new Date(`${nextStartDate}T12:00:00Z`);
  const offset = Math.round((next.getTime() - first.getTime()) / 86_400_000);
  return plan.map((slot) => ({ ...slot, date: addIsoDays(slot.date, offset) ?? slot.date }));
}

/** Expande as jornadas persistidas da OS em ocorrências visuais da Agenda. */
export function expandServiceOrderScheduledDays<T extends ServiceOrder>(
  orders: T[],
): Array<ScheduledServiceOrderOccurrence<T>> {
  const expanded: Array<ScheduledServiceOrderOccurrence<T>> = [];
  const seen = new Set<string>();

  const pushOnce = (order: ScheduledServiceOrderOccurrence<T>) => {
    const key = `${order.id}:${order.scheduled_date ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    expanded.push(order);
  };

  for (const order of orders) {
    const isCanonicalOs = order.entry_type !== 'tarefa' && !order._resumedDisplay;
    const plan = isCanonicalOs ? normalizeServiceOrderSchedulePlan(order) : [];

    if (plan.length === 0) {
      pushOnce(order);
      continue;
    }

    for (let slotIndex = 0; slotIndex < plan.length; slotIndex += 1) {
      const slot = plan[slotIndex];
      pushOnce({
        ...order,
        scheduled_date: slot.date,
        scheduled_time: slot.time,
        duration_minutes: slot.duration_minutes,
        _scheduledSpanDisplay: slotIndex > 0,
        _scheduledSpanDayIndex: slotIndex,
        _scheduledSpanTotalDays: plan.length,
        _originalScheduledDate: plan[0].date,
      });
    }
  }

  return expanded;
}
