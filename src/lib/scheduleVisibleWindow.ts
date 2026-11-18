import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type ScheduleVisibleMode = 'month' | 'week' | 'day';

export function getScheduleVisibleWindow(currentDate: Date, viewMode: ScheduleVisibleMode) {
  let start: Date;
  let end: Date;

  if (viewMode === 'month') {
    start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
  } else if (viewMode === 'week') {
    start = startOfWeek(currentDate, { weekStartsOn: 0 });
    end = endOfWeek(currentDate, { weekStartsOn: 0 });
  } else {
    start = startOfDay(currentDate);
    end = endOfDay(currentDate);
  }

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
}
