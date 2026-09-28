import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';

export function buildFinanceCalendarDays(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let cursor = first; cursor <= last; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)) {
    days.push(cursor);
  }
  return days;
}
