import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Check, ArrowRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, startOfYear, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

export type DatePreset =
  | 'all'
  | 'today'
  | 'last7'
  | 'this_month'
  | 'last_month'
  | 'last30'
  | 'this_year'
  | 'custom';

const presets: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Todos os tempos' },
  { key: 'today', label: 'Hoje' },
  { key: 'last7', label: 'Últimos 7 dias' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'last30', label: 'Últimos 30 dias' },
  { key: 'this_year', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
];

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
  const now = new Date();
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
      return { from: startOfYear(now), to: endOfDay(now) };
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

  const filterByDate = <T extends Record<string, any>>(items: T[], dateField: string): T[] => {
    if (!range.from && !range.to) return items;
    return items.filter((item) => {
      const d = new Date(item[dateField]);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    });
  };

  return { preset, range, setPreset: handlePresetChange, setRange, filterByDate };
}

export function DateRangeFilter({ value, preset, onPresetChange, onRangeChange }: DateRangeFilterProps) {
  const [presetOpen, setPresetOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(value.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(value.to);

  const presetLabel = useMemo(() => presets.find((p) => p.key === preset)?.label ?? 'Este mês', [preset]);

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
                  ? 'bg-primary text-white font-medium'
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
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-9">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {value.from && value.to
                ? `${format(value.from, 'dd/MM/yyyy')} - ${format(value.to, 'dd/MM/yyyy')}`
                : 'Selecionar datas'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                Selecione o período
              </div>

              {/* Start / End labels */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Início</p>
                  <p className="text-sm font-medium">
                    {tempFrom ? format(tempFrom, 'dd/MM/yyyy') : '—'}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Fim</p>
                  <p className="text-sm font-medium">
                    {tempTo ? format(tempTo, 'dd/MM/yyyy') : '—'}
                  </p>
                </div>
              </div>

              {/* Two calendars side by side */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={(d) => setTempFrom(d)}
                  locale={ptBR}
                  className="p-0 pointer-events-auto"
                />
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={(d) => setTempTo(d)}
                  locale={ptBR}
                  defaultMonth={tempTo || new Date(new Date().getFullYear(), new Date().getMonth() + 1)}
                  className="p-0 pointer-events-auto"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleClearCustom}>
                  Limpar
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={handleApplyCustom}
                  disabled={!tempFrom || !tempTo}
                >
                  <Check className="h-3.5 w-3.5" />
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
