import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  isSameYear,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CalendarX2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export type TaskAgendaMode = 'month' | 'week' | 'day';

interface TaskAgendaRenderContext {
  compact: boolean;
  mobile: boolean;
}

interface DatedTaskAgendaProps<T> {
  items: T[];
  getId: (item: T) => string;
  getDate: (item: T) => string | null | undefined;
  renderItem: (item: T, context: TaskAgendaRenderContext) => ReactNode;
  storageKey: string;
  emptyNoun?: string;
}

const WEEK_STARTS_ON = 0 as const;
const WEEK_DAYS = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'];

function readInitialMode(storageKey: string): TaskAgendaMode {
  if (typeof window === 'undefined') return 'month';
  const saved = window.localStorage.getItem(storageKey);
  if (saved === 'month' || saved === 'week' || saved === 'day') return saved;
  return window.innerWidth < 1024 ? 'day' : 'month';
}

/**
 * Estrutura compartilhada das agendas de tarefas do CRM tenant e Admin.
 * Datas são comparadas como YYYY-MM-DD para não deslocar tarefas date-only
 * por causa do fuso do navegador.
 */
export function DatedTaskAgenda<T>({
  items,
  getId,
  getDate,
  renderItem,
  storageKey,
  emptyNoun = 'tarefa',
}: DatedTaskAgendaProps<T>) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<TaskAgendaMode>(() => readInitialMode(storageKey));
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [noDateOpen, setNoDateOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const date = getDate(item);
      if (!date) continue;
      const key = date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items, getDate]);

  const noDateItems = useMemo(() => items.filter(item => !getDate(item)), [items, getDate]);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
  const today = new Date();
  const showingCurrentPeriod = mode === 'month'
    ? isSameMonth(currentDate, today)
    : mode === 'week'
      ? isSameWeek(currentDate, today, { weekStartsOn: WEEK_STARTS_ON })
      : isSameDay(currentDate, today);

  const periodTitle = useMemo(() => {
    if (mode === 'month') return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    if (mode === 'day') {
      return `${format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR })} — ${format(currentDate, 'EEEE', { locale: ptBR })}`;
    }
    if (isSameMonth(weekStart, weekEnd)) {
      return `${format(weekStart, 'd')} – ${format(weekEnd, "d 'de' MMMM yyyy", { locale: ptBR })}`;
    }
    if (isSameYear(weekStart, weekEnd)) {
      return `${format(weekStart, "d 'de' MMM", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}`;
    }
    return `${format(weekStart, "d 'de' MMM yyyy", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}`;
  }, [currentDate, mode, weekEnd, weekStart]);

  const movePeriod = (direction: -1 | 1) => setCurrentDate(date => {
    if (mode === 'month') return direction < 0 ? subMonths(date, 1) : addMonths(date, 1);
    if (mode === 'week') return direction < 0 ? subWeeks(date, 1) : addWeeks(date, 1);
    return direction < 0 ? subDays(date, 1) : addDays(date, 1);
  });

  const periodNav = (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => movePeriod(-1)} aria-label="Período anterior" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-muted">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <h3 className="max-w-full truncate text-base font-semibold capitalize">{periodTitle}</h3>
        {!showingCurrentPeriod && (
          <button type="button" onClick={() => setCurrentDate(new Date())} className="text-[11px] font-medium leading-tight text-primary">
            Voltar para hoje
          </button>
        )}
      </div>
      <button type="button" onClick={() => movePeriod(1)} aria-label="Próximo período" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-muted">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );

  const modeTabs = isMobile ? (
    <MobilePillTabs
      tabs={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]}
      activeTab={mode}
      onTabChange={value => setMode(value as TaskAgendaMode)}
    />
  ) : (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
      <Tabs value={mode} onValueChange={value => setMode(value as TaskAgendaMode)}>
        <TabsList className="h-9">
          <TabsTrigger value="month" className="px-3 text-xs">Mês</TabsTrigger>
          <TabsTrigger value="week" className="px-3 text-xs">Semana</TabsTrigger>
          <TabsTrigger value="day" className="px-3 text-xs">Dia</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  const header = isMobile ? (
    <div className="space-y-3">{periodNav}{modeTabs}</div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-[280px] flex-1">{periodNav}</div>{modeTabs}</div>
  );

  const noDateTray = noDateItems.length > 0 && (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button type="button" onClick={() => setNoDateOpen(value => !value)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/50">
        <span className="flex items-center gap-2 text-sm font-medium"><CalendarX2 className="h-4 w-4 text-muted-foreground" /> Sem data <Badge variant="secondary" className="h-5 px-1.5 text-xs">{noDateItems.length}</Badge></span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', noDateOpen && 'rotate-180')} />
      </button>
      {noDateOpen && (
        <div className={cn('border-t', isMobile ? 'divide-y' : 'flex flex-wrap gap-1.5 p-2')}>
          {noDateItems.map(item => <div key={getId(item)} className={isMobile ? undefined : 'max-w-[240px]'}>{renderItem(item, { compact: !isMobile, mobile: isMobile })}</div>)}
        </div>
      )}
    </div>
  );

  const empty = (period: string) => (
    <EmptyState icon={<CalendarDays className="h-12 w-12" />} title={`Nenhuma ${emptyNoun} ${period}`} description={`Não há ${emptyNoun}s com vencimento ${period}.`} />
  );

  const renderGroupedList = (days: Date[], period: string) => {
    const populated = days.map(day => ({ day, key: format(day, 'yyyy-MM-dd') })).filter(({ key }) => itemsByDate.has(key));
    if (!populated.length) return empty(period);
    return populated.map(({ day, key }) => (
      <div key={key} className="space-y-1.5">
        <div className="flex items-center gap-2 px-1">
          <span className={cn('text-xs font-semibold uppercase tracking-wide capitalize', isSameDay(day, today) ? 'text-primary' : 'text-muted-foreground')}>
            {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          {isSameDay(day, today) && <Badge className="h-4 border-0 bg-primary px-1.5 text-[10px] text-primary-foreground">Hoje</Badge>}
        </div>
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {itemsByDate.get(key)!.map(item => <div key={getId(item)}>{renderItem(item, { compact: false, mobile: true })}</div>)}
        </div>
      </div>
    ));
  };

  const renderDay = () => {
    const dayItems = itemsByDate.get(format(currentDate, 'yyyy-MM-dd')) ?? [];
    if (!dayItems.length) return empty('neste dia');
    return <div className="overflow-hidden rounded-xl border bg-card divide-y">{dayItems.map(item => <div key={getId(item)}>{renderItem(item, { compact: false, mobile: isMobile })}</div>)}</div>;
  };

  const renderGrid = (days: Date[], monthly: boolean) => (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {days.slice(0, 7).map((day, index) => (
          <div key={format(day, 'yyyy-MM-dd')} className={cn('py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground', !monthly && isSameDay(day, today) && 'bg-primary/5')}>
            {WEEK_DAYS[index]}{!monthly && <span className={cn('mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm normal-case', isSameDay(day, today) && 'bg-primary text-primary-foreground')}>{format(day, 'd')}</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayItems = itemsByDate.get(key) ?? [];
          return (
            <div key={key} className={cn(monthly ? 'min-h-[110px] border-b border-r p-1.5' : 'min-h-[280px] border-r p-1.5', monthly && !isSameMonth(day, currentDate) && 'bg-muted/30', isSameDay(day, today) && 'bg-primary/5')}>
              {monthly && <div className="mb-1 flex items-center justify-between"><span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium', isSameDay(day, today) && 'bg-primary text-primary-foreground')}>{format(day, 'd')}</span>{dayItems.length > 3 && <Badge variant="secondary" className="h-5 px-1.5 text-xs">+{dayItems.length - 3}</Badge>}</div>}
              <div className="space-y-1">{dayItems.slice(0, monthly ? 3 : undefined).map(item => <div key={getId(item)}>{renderItem(item, { compact: true, mobile: false })}</div>)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const monthDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON }), end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON }) });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div className="space-y-3">
      {header}
      {noDateTray}
      {isMobile && mode === 'month' && renderGroupedList(eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) }), 'neste mês')}
      {isMobile && mode === 'week' && renderGroupedList(weekDays, 'nesta semana')}
      {mode === 'day' && renderDay()}
      {!isMobile && mode === 'month' && renderGrid(monthDays, true)}
      {!isMobile && mode === 'week' && renderGrid(weekDays, false)}
    </div>
  );
}
