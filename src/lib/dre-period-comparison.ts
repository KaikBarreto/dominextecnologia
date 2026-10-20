import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';
import type { DateRange } from '@/components/ui/DateRangeFilter';

export type DreComparisonMode = 'none' | 'previous_period' | 'previous_year';

export interface DreComparisonValue {
  absolute: number;
  /** `null` quando a base anterior é zero e a variação percentual seria enganosa. */
  percentage: number | null;
}

/**
 * Calcula um período inclusivo com a mesma quantidade de dias do intervalo
 * atual ou o intervalo equivalente no ano anterior.
 */
export function getDreComparisonRange(
  range: DateRange | undefined,
  mode: DreComparisonMode,
): DateRange | undefined {
  if (mode === 'none' || !range?.from || !range.to) return undefined;

  if (mode === 'previous_year') {
    return { from: subYears(range.from, 1), to: subYears(range.to, 1) };
  }

  const isWholeCalendarMonths = isSameDay(range.from, startOfMonth(range.from))
    && isSameDay(range.to, endOfMonth(range.to));
  if (isWholeCalendarMonths) {
    const months = differenceInCalendarMonths(range.to, range.from) + 1;
    return {
      from: subMonths(range.from, months),
      to: endOfMonth(subMonths(range.to, months)),
    };
  }

  const inclusiveDays = differenceInCalendarDays(range.to, range.from) + 1;
  const to = subDays(range.from, 1);
  return { from: subDays(to, inclusiveDays - 1), to };
}

export function formatDreComparisonPeriod(range: DateRange | undefined): string {
  if (!range?.from || !range.to) return '';
  return `${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')}`;
}

export function calculateDreVariation(current: number, previous: number): DreComparisonValue {
  const absolute = current - previous;
  if (previous === 0) return { absolute, percentage: null };
  return { absolute, percentage: absolute / Math.abs(previous) };
}
