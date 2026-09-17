import { useMemo } from 'react';
import { List as ListIcon, AlertTriangle } from 'lucide-react';
import { EventCard } from './EventCard';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { ServiceOrder } from '@/types/database';

interface ScheduleListViewProps {
  /** Já filtrado (técnico/cliente/status/tipo) e já recortado pro período
   * navegado (mês/semana/dia) — a MESMA fonte que o calendário usa pro
   * período visível. A lista não aplica nenhum filtro/período por conta própria. */
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
}

/**
 * Visão de lista da Agenda (E4): mesmos itens do calendário pro período
 * navegado, em lista corrida (sem grade), ordenados por data/hora com
 * atrasado primeiro. Reusa o `EventCard` (mesmo card do calendário/resumo do
 * dia) com `showDate` pra mostrar a data de cada item, já que aqui um item
 * pode ser de qualquer dia do período — não só do dia selecionado.
 */
export function ScheduleListView({ orders, onOrderSelect }: ScheduleListViewProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.schedule.list;

  const { overdueItems, restItems } = useMemo(() => {
    const todayKey = new Date().toISOString().split('T')[0];

    const isOverdue = (order: (typeof orders)[number]) => {
      if (!order.scheduled_date) return false;
      if (order.scheduled_date >= todayKey) return false;
      return order.status !== 'concluida' && order.status !== 'cancelada';
    };

    const sortKey = (order: (typeof orders)[number]) => {
      const date = order.scheduled_date || '9999-99-99';
      const time = order.scheduled_time || '00:00';
      return `${date}T${time}`;
    };

    const overdue: typeof orders = [];
    const rest: typeof orders = [];
    for (const order of orders) {
      if (isOverdue(order)) overdue.push(order);
      else rest.push(order);
    }
    overdue.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    rest.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    return { overdueItems: overdue, restItems: rest };
  }, [orders]);

  if (overdueItems.length === 0 && restItems.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<ListIcon className="h-10 w-10" />}
        title={t.emptyTitle}
        description={t.emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-4">
      {overdueItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t.overdueSectionLabel}
          </div>
          <div className="space-y-2">
            {overdueItems.map((order) => (
              <EventCard key={`${order.id}-${order.scheduled_date}`} order={order} onClick={() => onOrderSelect(order)} showDate />
            ))}
          </div>
        </div>
      )}
      {restItems.length > 0 && (
        <div className="space-y-2">
          {restItems.map((order) => (
            <EventCard key={`${order.id}-${order.scheduled_date}`} order={order} onClick={() => onOrderSelect(order)} showDate />
          ))}
        </div>
      )}
    </div>
  );
}
