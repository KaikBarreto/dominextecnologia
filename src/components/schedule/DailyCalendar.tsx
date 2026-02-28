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
const SLOT_HEIGHT = 80; // px per hour

export function DailyCalendar({ currentDate, orders, onOrderSelect, onSlotClick, onDrop }: DailyCalendarProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const dayOrders = useMemo(() => {
    return orders.filter(o => o.scheduled_date === dateKey && o.scheduled_time);
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
        <div className="relative">
          {/* Hour grid lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="flex transition-colors hover:bg-accent/30 cursor-pointer"
              style={{ height: SLOT_HEIGHT }}
              onClick={() => {
                const hasOrders = dayOrders.some(o => {
                  const h = parseInt(o.scheduled_time!.split(':')[0], 10);
                  return h === hour;
                });
                if (!hasOrders) onSlotClick(dateKey, `${String(hour).padStart(2, '0')}:00`);
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnSlot(e, hour)}
            >
              <div className="w-16 shrink-0 py-1 pr-2 text-right text-xs text-muted-foreground">
                {`${String(hour).padStart(2, '0')}:00`}
              </div>
              <div className="flex-1 border-l border-b" />
            </div>
          ))}

          {/* Positioned event cards */}
          <div className="absolute inset-0 pointer-events-none" style={{ left: 64 }}>
            {dayOrders.map((order) => {
              const timeParts = order.scheduled_time!.split(':');
              const hour = parseInt(timeParts[0], 10);
              const minute = parseInt(timeParts[1], 10);
              const duration = (order as any).duration_minutes || 120;
              
              const topOffset = ((hour - HOURS[0]) + minute / 60) * SLOT_HEIGHT;
              const height = Math.max((duration / 60) * SLOT_HEIGHT, 28);

              return (
                <div
                  key={order.id}
                  className="absolute right-1 left-1 pointer-events-auto"
                  style={{ top: topOffset, height }}
                >
                  <EventCard
                    order={order}
                    onClick={() => onOrderSelect(order)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
                    fillHeight
                  />
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
