import { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { EventCard } from './EventCard';
import type { ServiceOrder } from '@/types/database';

interface WeeklyCalendarProps {
  currentDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onSlotClick: (date: string, time: string) => void;
  onDrop: (orderId: string, date: string, time: string) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 - 20:00

export function WeeklyCalendar({ currentDate, orders, onOrderSelect, onSlotClick, onDrop }: WeeklyCalendarProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const ordersByDateAndHour = useMemo(() => {
    const map: Record<string, (ServiceOrder & { customer: any; equipment: any })[]> = {};
    orders.forEach((order) => {
      if (order.scheduled_date && order.scheduled_time) {
        const hour = parseInt(order.scheduled_time.split(':')[0], 10);
        const key = `${order.scheduled_date}-${hour}`;
        if (!map[key]) map[key] = [];
        map[key].push(order);
      }
    });
    return map;
  }, [orders]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary/10');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10');
  };

  const handleDrop = (e: React.DragEvent, date: string, hour: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10');
    const orderId = e.dataTransfer.getData('text/plain');
    if (orderId) {
      onDrop(orderId, date, `${String(hour).padStart(2, '0')}:00`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden">
      {/* Days header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
        <div className="py-3 text-center text-xs font-medium text-muted-foreground" />
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'py-3 text-center border-l',
              isSameDay(day, new Date()) && 'bg-primary/5'
            )}
          >
            <div className="text-xs text-muted-foreground uppercase">
              {format(day, 'EEE', { locale: ptBR })}
            </div>
            <div
              className={cn(
                'text-sm font-semibold mt-0.5',
                isSameDay(day, new Date()) && 'text-primary'
              )}
            >
              {format(day, 'dd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="h-20 flex items-start justify-end pr-2 pt-1 text-xs text-muted-foreground border-b">
                {`${String(hour).padStart(2, '0')}:00`}
              </div>
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const cellOrders = ordersByDateAndHour[`${dateKey}-${hour}`] || [];
                return (
                  <div
                    key={`${dateKey}-${hour}`}
                    className={cn(
                      'h-20 border-l border-b p-0.5 transition-colors cursor-pointer hover:bg-accent/30',
                      isSameDay(day, new Date()) && 'bg-primary/5'
                    )}
                    onClick={() => cellOrders.length === 0 && onSlotClick(dateKey, `${String(hour).padStart(2, '0')}:00`)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey, hour)}
                  >
                    {cellOrders.map((order) => (
                      <EventCard
                        key={order.id}
                        order={order}
                        compact
                        onClick={() => onOrderSelect(order)}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
