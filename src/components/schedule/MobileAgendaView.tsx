import { useMemo } from 'react';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { EventCard } from './EventCard';
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
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-base font-medium">Nenhum agendamento</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Não há ordens de serviço para este dia
        </p>
      </div>
    );
  }

  // Simple list - no cascade here
  return (
    <div className="space-y-3">
      {dayHolidays.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dayHolidays.map((h, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning/10 border border-warning/20">
              <span className="text-xs">🏖️</span>
              <span className="text-xs font-medium text-warning-foreground">{h.name}</span>
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
