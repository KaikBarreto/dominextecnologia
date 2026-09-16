import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Check, ArrowRight } from 'lucide-react';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, startOfYear, endOfYear, subMonths } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Calendar } from '@/components/ui/calendar';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { todayInBrazil } from '@/lib/today-brazil';
import { useIsMobile } from '@/hooks/use-mobile';

export type DatePreset =
  | 'all'
  | 'today'
  | 'last7'
  | 'this_month'
  | 'last_month'
  | 'last30'
  | 'this_year'
  | 'custom';

const DATE_FNS_LOCALE: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es,
  fr,
};

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangeFilterProps {
  value: DateRange;
  preset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  onRangeChange: (range: DateRange) => void;
}

export function getDateRangeFromPreset(preset: DatePreset): DateRange {
  // Corte de período ancorado no fuso do Brasil, não no fuso do dispositivo
  // (viajante ou máquina em UTC não pode fazer "Este mês" virar o mês errado).
  // Meio-dia local evita qualquer sombra de DST/offset ao converter a
  // string YYYY-MM-DD pra Date — mesmo padrão usado em filterByDate acima.
  const now = new Date(`${todayInBrazil()}T12:00:00`);
  switch (preset) {
    case 'all':
      return { from: undefined, to: undefined };
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'last7':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'this_month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'last_month': {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'last30':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'this_year':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'custom':
      return { from: undefined, to: undefined };
  }
}

export function useDateRangeFilter(defaultPreset: DatePreset = 'this_month') {
  const [preset, setPreset] = useState<DatePreset>(defaultPreset);
  const [range, setRange] = useState<DateRange>(getDateRangeFromPreset(defaultPreset));

  const handlePresetChange = (p: DatePreset) => {
    setPreset(p);
    if (p !== 'custom') {
      setRange(getDateRangeFromPreset(p));
    }
  };

  const filterByDate = <T extends Record<string, any>>(items: T[], dateField: string, fallbackField?: string): T[] => {
    if (!range.from && !range.to) return items;
    return items.filter((item) => {
      const raw = item[dateField] ?? (fallbackField ? item[fallbackField] : null);
      if (!raw) return false;
      const dateStr = String(raw);
      // Parse date-only strings (YYYY-MM-DD) as local noon to avoid UTC shift
      const d = dateStr.length === 10 ? new Date(dateStr + 'T12:00:00') : new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    });
  };

  return { preset, range, setPreset: handlePresetChange, setRange, filterByDate };
}

export function DateRangeFilter({ value, preset, onPresetChange, onRangeChange }: DateRangeFilterProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.common;
  const isMobile = useIsMobile();
  const [presetOpen, setPresetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(value.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(value.to);

  const presets = useMemo<{ key: DatePreset; label: string }[]>(
    () => [
      { key: 'all', label: t.dateRange.allTime },
      { key: 'today', label: t.dateRange.today },
      { key: 'last7', label: t.dateRange.last7 },
      { key: 'this_month', label: t.dateRange.thisMonth },
      { key: 'last_month', label: t.dateRange.lastMonth },
      { key: 'last30', label: t.dateRange.last30 },
      { key: 'this_year', label: t.dateRange.thisYear },
      { key: 'custom', label: t.dateRange.custom },
    ],
    [t],
  );

  const presetLabel = useMemo(
    () => presets.find((p) => p.key === preset)?.label ?? t.dateRange.thisMonth,
    [presets, preset, t],
  );

  const handlePresetSelect = (key: DatePreset) => {
    onPresetChange(key);
    setPresetOpen(false);
    if (key === 'custom') {
      setTempFrom(undefined);
      setTempTo(undefined);
      setCalendarOpen(true);
    }
  };

  const handleApplyCustom = () => {
    onRangeChange({ from: tempFrom, to: tempTo });
    setCalendarOpen(false);
  };

  const handleClearCustom = () => {
    setTempFrom(undefined);
    setTempTo(undefined);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset selector */}
      <Popover open={presetOpen} onOpenChange={setPresetOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            {presetLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1" align="start">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePresetSelect(p.key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                preset === p.key
                  ? 'bg-primary text-primary-foreground font-medium hover:bg-primary/90'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              {preset === p.key && <Check className="h-3.5 w-3.5" />}
              <span className={preset === p.key ? '' : 'ml-5.5'}>{p.label}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Custom date range picker */}
      {preset === 'custom' && (
        isMobile ? (
          // Mobile: Popover não cabe (dois meses estouram a tela e o rodapé de
          // ações fica inalcançável). Vira drawer: cabeçalho e rodapé fixos,
          // só o meio (labels + calendário de 1 mês) rola.
          <Drawer open={calendarOpen} onOpenChange={setCalendarOpen}>
            <DrawerTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {value.from && value.to
                  ? `${formatDate(value.from, locale, timezone)} - ${formatDate(value.to, locale, timezone)}`
                  : t.dateRange.selectDates}
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="shrink-0 pb-2 text-left">
                <DrawerTitle className="flex items-center gap-2 text-sm font-medium">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {t.dateRange.selectPeriod}
                </DrawerTitle>
              </DrawerHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <CustomRangeLabels
                  tempFrom={tempFrom}
                  tempTo={tempTo}
                  locale={locale}
                  timezone={timezone}
                  t={t}
                />

                {/* Um mês por vez no celular: dois meses lado a lado não cabem
                    em ~390px e empurravam o segundo mês (e o rodapé) pra fora da tela. */}
                <Calendar
                  mode="range"
                  selected={tempFrom && tempTo ? { from: tempFrom, to: tempTo } : tempFrom ? { from: tempFrom, to: undefined } : undefined}
                  onSelect={(range) => {
                    setTempFrom(range?.from);
                    setTempTo(range?.to);
                  }}
                  locale={DATE_FNS_LOCALE[locale]}
                  numberOfMonths={1}
                  className="p-0 pointer-events-auto"
                />
              </div>

              <DrawerFooter className="shrink-0 flex-row justify-end gap-2 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
                <Button variant="ghost" size="sm" onClick={handleClearCustom}>
                  {t.clear}
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={handleApplyCustom}
                  disabled={!tempFrom || !tempTo}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t.apply}
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          // Desktop: popover ancorado no botão, dois meses lado a lado (cabe de sobra).
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {value.from && value.to
                  ? `${formatDate(value.from, locale, timezone)} - ${formatDate(value.to, locale, timezone)}`
                  : t.dateRange.selectDates}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {t.dateRange.selectPeriod}
                </div>

                <CustomRangeLabels
                  tempFrom={tempFrom}
                  tempTo={tempTo}
                  locale={locale}
                  timezone={timezone}
                  t={t}
                />

                <Calendar
                  mode="range"
                  selected={tempFrom && tempTo ? { from: tempFrom, to: tempTo } : tempFrom ? { from: tempFrom, to: undefined } : undefined}
                  onSelect={(range) => {
                    setTempFrom(range?.from);
                    setTempTo(range?.to);
                  }}
                  locale={DATE_FNS_LOCALE[locale]}
                  numberOfMonths={2}
                  className="p-0 pointer-events-auto"
                />

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={handleClearCustom}>
                    {t.clear}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={handleApplyCustom}
                    disabled={!tempFrom || !tempTo}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.apply}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )
      )}
    </div>
  );
}

interface CustomRangeLabelsProps {
  tempFrom: Date | undefined;
  tempTo: Date | undefined;
  locale: LocaleCode;
  timezone: string;
  t: (typeof MESSAGES)[LocaleCode]['app']['common'];
}

/** Labels de "Início" / "Fim" acima do calendário, compartilhados entre o drawer (mobile) e o popover (desktop). */
function CustomRangeLabels({ tempFrom, tempTo, locale, timezone, t }: CustomRangeLabelsProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex-1 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t.dateRange.start}</p>
        <p className="text-sm font-medium">
          {tempFrom ? formatDate(tempFrom, locale, timezone) : '—'}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 text-center">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t.dateRange.end}</p>
        <p className="text-sm font-medium">
          {tempTo ? formatDate(tempTo, locale, timezone) : '—'}
        </p>
      </div>
    </div>
  );
}
