import { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EventCard } from './EventCard';
import type { ServiceOrder } from '@/types/database';

interface MobileAgendaViewProps {
  currentDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
}

export function MobileAgendaView({ currentDate, orders, onOrderSelect }: MobileAgendaViewProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const dayOrders = useMemo(() => {
    return orders
      .filter((o) => o.scheduled_date === dateKey)
      .sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
  }, [orders, dateKey]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-base font-semibold capitalize">
            {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {dayOrders.length} {dayOrders.length === 1 ? 'agendamento' : 'agendamentos'}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {dayOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-base font-medium">Nenhum agendamento</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Não há ordens de serviço para este dia
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-4">
            {dayOrders.map((order) => (
              <EventCard
                key={order.id}
                order={order}
                onClick={() => onOrderSelect(order)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
