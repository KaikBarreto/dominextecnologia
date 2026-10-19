import { Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Label } from '@/components/ui/label';
import { TimePicker } from '@/components/ui/TimePicker';
import {
  buildDailySchedulePlan,
  getScheduleSlotDurationMinutes,
  getScheduleSlotEndTime,
} from '@/lib/serviceOrderSchedule';
import type { LocaleCode } from '@/lib/i18n/locales';
import type { ServiceOrderScheduleSlot } from '@/types/database';

interface SchedulePlannerLabels {
  period: string;
  startDate: string;
  endDate: string;
  dailyPlan: string;
  dailyPlanHelp: string;
  applyFirstToAll: string;
  scheduledDaySingular: string;
  scheduledDayPlural: string;
  startTime: string;
  endTime: string;
  invalidTimeRange: string;
}

interface ServiceOrderSchedulePlannerProps {
  plan: ServiceOrderScheduleSlot[];
  onChange: (plan: ServiceOrderScheduleSlot[]) => void;
  locale: LocaleCode;
  labels: SchedulePlannerLabels;
}

const LOCALE_TAG: Record<LocaleCode, string> = {
  'pt-br': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
};

export function ServiceOrderSchedulePlanner({
  plan,
  onChange,
  locale,
  labels,
}: ServiceOrderSchedulePlannerProps) {
  const first = plan[0];
  const startDate = first?.date ?? '';
  const endDate = plan.at(-1)?.date ?? startDate;
  const defaultTime = first?.time ?? '08:00';
  const defaultDuration = first?.duration_minutes ?? 120;

  const updateRange = (nextStart: string, nextEnd: string) => {
    if (!nextStart) return;
    const safeEnd = !nextEnd || nextEnd < nextStart ? nextStart : nextEnd;
    onChange(buildDailySchedulePlan(nextStart, safeEnd, defaultTime, defaultDuration, plan));
  };

  const updateSlot = (index: number, changes: Partial<ServiceOrderScheduleSlot>) => {
    onChange(plan.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...changes } : slot));
  };

  const updateStartTime = (index: number, startTime: string) => {
    const slot = plan[index];
    const currentEndTime = getScheduleSlotEndTime(slot.time, slot.duration_minutes);
    const durationMinutes = getScheduleSlotDurationMinutes(startTime, currentEndTime);
    if (durationMinutes === null) return;
    updateSlot(index, { time: startTime, duration_minutes: durationMinutes });
  };

  const updateEndTime = (index: number, endTime: string) => {
    const durationMinutes = getScheduleSlotDurationMinutes(plan[index].time, endTime);
    if (durationMinutes === null) return;
    updateSlot(index, { duration_minutes: durationMinutes });
  };

  const applyFirstToAll = () => {
    if (!first) return;
    onChange(plan.map((slot) => ({
      ...slot,
      time: first.time,
      duration_minutes: first.duration_minutes,
    })));
  };

  const dayLabel = (date: string) => new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">{labels.period}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{labels.dailyPlanHelp}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{labels.startDate}</Label>
          <DatePicker value={startDate} onValueChange={(value) => updateRange(value, endDate)} />
        </div>
        <div className="space-y-2">
          <Label>{labels.endDate}</Label>
          <DatePicker value={endDate} onValueChange={(value) => updateRange(startDate, value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div>
          <p className="text-sm font-medium">{labels.dailyPlan}</p>
          <p className="text-xs text-muted-foreground">
            {plan.length} {plan.length === 1 ? labels.scheduledDaySingular : labels.scheduledDayPlural}
          </p>
        </div>
        {plan.length > 1 && (
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={applyFirstToAll}>
            <Copy className="h-3.5 w-3.5" />
            {labels.applyFirstToAll}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {plan.map((slot, index) => (
          <div key={slot.date} className="grid items-start gap-3 rounded-md border bg-background p-3 sm:grid-cols-[minmax(120px,1fr)_150px_150px]">
            <div>
              <p className="text-sm font-medium capitalize">{dayLabel(slot.date)}</p>
              <p className="text-xs text-muted-foreground">{slot.date.split('-').reverse().join('/')}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{labels.startTime}</Label>
              <TimePicker
                value={slot.time.slice(0, 5)}
                minuteStep={15}
                ariaLabel={`${labels.startTime} — ${dayLabel(slot.date)}`}
                onValueChange={(value) => updateStartTime(index, value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{labels.endTime}</Label>
              <TimePicker
                value={getScheduleSlotEndTime(slot.time, slot.duration_minutes)}
                minuteStep={15}
                ariaLabel={`${labels.endTime} — ${dayLabel(slot.date)}`}
                ariaInvalid={slot.duration_minutes < 15 || slot.duration_minutes > 480}
                onValueChange={(value) => updateEndTime(index, value)}
              />
              {(slot.duration_minutes < 15 || slot.duration_minutes > 480) && (
                <p className="text-xs text-destructive sm:col-span-2">{labels.invalidTimeRange}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
