import { useMemo } from 'react';
import { format } from 'date-fns';
import { Clock, Star } from 'lucide-react';
import { EventCard } from './EventCard';
import { EmptyState } from '@/components/mobile/EmptyState';
import type { ServiceOrder } from '@/types/database';
import type { Holiday } from '@/utils/holidays';

interface MobileAgendaViewProps {
  currentDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  holidayMap?: Record<string, Holiday[]>;
}

export function MobileAgendaView({ currentDate, orders, onOrderSelect, holidayMap = {} }: MobileAgendaViewProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const dayHolidays = holidayMap[dateKey] || [];

  const dayOrders = useMemo(() => {
    return orders
      .filter((o) => o.scheduled_date === dateKey)
      .sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
  }, [orders, dateKey]);

  if (dayOrders.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-12 w-12" />}
        title="Nenhum agendamento"
        description="Não há ordens de serviço para este dia"
      />
    );
  }

  // Simple list - no cascade here
  return (
    <div className="space-y-3">
      {dayHolidays.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dayHolidays.map((h, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary">
              <Star className="h-3 w-3 text-secondary-foreground" />
              <span className="text-xs font-medium text-secondary-foreground">{h.name}</span>
            </div>
          ))}
        </div>
      )}
      {dayOrders.map((order) => (
        <EventCard
          key={order.id}
          order={order}
          onClick={() => onOrderSelect(order)}
        />
      ))}
    </div>
  );
}
