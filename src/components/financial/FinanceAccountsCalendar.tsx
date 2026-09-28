import { useMemo, useState } from 'react';
import { addMonths, format, isSameMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildFinanceCalendarDays } from '@/lib/finance-calendar';

export interface FinanceCalendarItem {
  id: string;
  title: string;
  date: string;
  amount: number;
  direction: 'entrada' | 'saida';
  status: 'paga' | 'vencida' | 'parcial' | 'pendente';
  subtitle?: string;
}

interface FinanceAccountsCalendarProps {
  items: FinanceCalendarItem[];
  formatAmount: (value: number) => string;
  initialDate?: Date;
}

const dateKey = (date: Date) => format(date, 'yyyy-MM-dd');

export function FinanceAccountsCalendar({ items, formatAmount, initialDate }: FinanceAccountsCalendarProps) {
  const [month, setMonth] = useState(initialDate ?? new Date());
  const days = useMemo(() => buildFinanceCalendarDays(month), [month]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, FinanceCalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);
  const monthItems = useMemo(
    () => items.filter((item) => item.date.startsWith(format(month, 'yyyy-MM'))),
    [items, month],
  );

  const renderItem = (item: FinanceCalendarItem, compact = false) => (
    <div
      key={item.id}
      className={cn(
        'min-w-0 rounded-lg px-2 py-1.5',
        item.direction === 'entrada' ? 'bg-success/10' : 'bg-destructive/10',
      )}
      title={`${item.title} — ${formatAmount(item.amount)}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', item.direction === 'entrada' ? 'bg-success' : 'bg-destructive')} />
        <span className="truncate text-[11px] font-medium">{item.title}</span>
      </div>
      {!compact && (
        <p className={cn('pl-3.5 text-[10px] font-semibold tabular-nums', item.direction === 'entrada' ? 'text-success' : 'text-destructive')}>
          {item.direction === 'entrada' ? '+' : '−'} {formatAmount(item.amount)}
        </p>
      )}
    </div>
  );

  return (
    <section className="space-y-4" aria-label="Calendário de contas">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="icon" onClick={() => setMonth((value) => subMonths(value, 1))} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</h3>
        <Button variant="ghost" size="icon" onClick={() => setMonth((value) => addMonths(value, 1))} aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="hidden md:block overflow-hidden rounded-2xl bg-muted/25">
        <div className="grid grid-cols-7 border-b border-border/50 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <div key={day} className="py-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const entries = itemsByDay.get(dateKey(day)) ?? [];
            return (
              <div key={dateKey(day)} className={cn('min-h-28 border-b border-r border-border/40 p-2', !isSameMonth(day, month) && 'opacity-35')}>
                <span className="text-xs font-medium tabular-nums">{format(day, 'd')}</span>
                <div className="mt-1.5 space-y-1">
                  {entries.slice(0, 3).map((item) => renderItem(item, true))}
                  {entries.length > 3 && <p className="px-1 text-[10px] text-muted-foreground">+{entries.length - 3} contas</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {monthItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarDays className="h-9 w-9" />
            <p className="text-sm">Nenhuma conta com vencimento neste mês.</p>
          </div>
        ) : Array.from(itemsByDay.entries())
          .filter(([key]) => key.startsWith(format(month, 'yyyy-MM')))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entries]) => (
            <div key={key} className="grid grid-cols-[52px_1fr] gap-3">
              <div className="pt-1 text-center">
                <p className="text-lg font-bold leading-none">{format(new Date(`${key}T12:00:00`), 'dd')}</p>
                <p className="text-[10px] uppercase text-muted-foreground">{format(new Date(`${key}T12:00:00`), 'EEE', { locale: ptBR })}</p>
              </div>
              <div className="space-y-1.5 border-b border-border/50 pb-3">{entries.map((item) => renderItem(item))}</div>
            </div>
          ))}
      </div>
    </section>
  );
}
