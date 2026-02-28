import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import type { ServiceOrder } from '@/types/database';

interface DailyCalendarProps {
  currentDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onSlotClick: (date: string, time: string) => void;
  onDrop: (orderId: string, date: string, time: string) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 - 20:00

export function DailyCalendar({ currentDate, orders, onOrderSelect, onSlotClick, onDrop }: DailyCalendarProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const ordersByHour = useMemo(() => {
    const map: Record<number, (ServiceOrder & { customer: any; equipment: any })[]> = {};
    orders.forEach((order) => {
      if (order.scheduled_date === dateKey && order.scheduled_time) {
        const hour = parseInt(order.scheduled_time.split(':')[0], 10);
        if (!map[hour]) map[hour] = [];
        map[hour].push(order);
      }
    });
    return map;
  }, [orders, dateKey]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary/10');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10');
  };

  const handleDropOnSlot = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10');
    const orderId = e.dataTransfer.getData('text/plain');
    if (orderId) {
      onDrop(orderId, dateKey, `${String(hour).padStart(2, '0')}:00`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <h3 className="text-base font-semibold capitalize">
          {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y">
          {HOURS.map((hour) => {
            const hourOrders = ordersByHour[hour] || [];
            return (
              <div
                key={hour}
                className="flex min-h-[80px] transition-colors hover:bg-accent/30 cursor-pointer"
                onClick={() => hourOrders.length === 0 && onSlotClick(dateKey, `${String(hour).padStart(2, '0')}:00`)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDropOnSlot(e, hour)}
              >
                <div className="w-16 shrink-0 py-2 pr-2 text-right text-xs text-muted-foreground">
                  {`${String(hour).padStart(2, '0')}:00`}
                </div>
                <div className="flex-1 p-1 space-y-1 border-l">
                  {hourOrders.map((order) => (
                    <EventCard
                      key={order.id}
                      order={order}
                      onClick={() => onOrderSelect(order)}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
