import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { EventCard } from './EventCard';
import type { ServiceOrder } from '@/types/database';
import type { Holiday } from '@/utils/holidays';

interface WeeklyCalendarProps {
  currentDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onSlotClick: (date: string, time: string) => void;
  onDrop: (orderId: string, date: string, time: string) => void;
  movingOrderId?: string | null;
  onTouchPickUp?: (orderId: string) => void;
  onTouchDrop?: (date: string, time: string) => void;
  holidayMap?: Record<string, Holiday[]>;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 - 20:00
const SLOT_HEIGHT = 80; // px per hour
const CASCADE_OFFSET = 28; // px offset for each overlapping card

type PositionedOrder = {
  order: (ServiceOrder & { customer: any; equipment: any });
  startMin: number;
  endMin: number;
  index: number; // cascade index within cluster
};

function layoutCascade(
  dayOrders: (ServiceOrder & { customer: any; equipment: any })[]
): PositionedOrder[] {
  const items = dayOrders.map((order) => {
    const [h, m] = order.scheduled_time!.split(':').map(Number);
    const startMin = h * 60 + m;
    const duration = (order as any).duration_minutes || 120;
    return { order, startMin, endMin: startMin + duration, index: 0 };
  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Group into clusters of overlapping events
  const clusters: PositionedOrder[][] = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster.some(c => c.startMin < item.endMin && item.startMin < c.endMin)) {
        item.index = cluster.length;
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }

  return items;
}

export function WeeklyCalendar({ currentDate, orders, onOrderSelect, onSlotClick, onDrop, movingOrderId, onTouchPickUp, onTouchDrop, holidayMap = {} }: WeeklyCalendarProps) {
  const isMobile = useIsMobile();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const ordersByDate = useMemo(() => {
    const map: Record<string, (ServiceOrder & { customer: any; equipment: any })[]> = {};
    orders.forEach((order) => {
      if (order.scheduled_date && order.scheduled_time) {
        if (!map[order.scheduled_date]) map[order.scheduled_date] = [];
        map[order.scheduled_date].push(order);
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

  const getHourFromY = (e: React.DragEvent, colElement: HTMLElement) => {
    const rect = colElement.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hourIndex = Math.floor(y / SLOT_HEIGHT);
    return HOURS[Math.max(0, Math.min(hourIndex, HOURS.length - 1))];
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden max-w-full">
      <div className="overflow-x-auto max-w-full">
      {/* Days header */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(100px,1fr))] border-b bg-muted/30 min-w-[820px]">
        <div className="py-3 text-center text-xs font-medium text-muted-foreground" />
        {weekDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayHolidays = holidayMap[dateKey] || [];
          return (
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
              {dayHolidays.length > 0 && (
                <div className="text-[9px] leading-tight font-medium text-secondary-foreground bg-secondary rounded px-1 py-0.5 truncate mx-0.5 mt-0.5 flex items-center gap-0.5 justify-center">
                  <Star className="h-2 w-2 shrink-0" /> {dayHolidays[0].name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-[60px_repeat(7,minmax(100px,1fr))] min-w-[820px]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="flex items-start justify-end pr-2 pt-1 text-xs text-muted-foreground border-b" style={{ height: SLOT_HEIGHT }}>
                {`${String(hour).padStart(2, '0')}:00`}
              </div>
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                return (
                  <div
                    key={`${dateKey}-${hour}`}
                    className={cn(
                      'border-l border-b relative transition-colors cursor-pointer hover:bg-accent/30',
                      isSameDay(day, new Date()) && 'bg-primary/5'
                    )}
                    style={{ height: SLOT_HEIGHT }}
                    onClick={() => {
                      if (isMobile && movingOrderId && onTouchDrop) {
                        onTouchDrop(dateKey, `${String(hour).padStart(2, '0')}:00`);
                        return;
                      }
                      const cellOrders = (ordersByDate[dateKey] || []).filter(o => {
                        const h = parseInt(o.scheduled_time!.split(':')[0], 10);
                        return h === hour;
                      });
                      if (cellOrders.length === 0) onSlotClick(dateKey, `${String(hour).padStart(2, '0')}:00`);
                    }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey, hour)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Overlay for positioned events per day column */}
        <div className="absolute inset-0 grid grid-cols-[60px_repeat(7,minmax(100px,1fr))] min-w-[820px] pointer-events-none" style={{ top: 0 }}>
          <div /> {/* spacer for time column */}
          {weekDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayOrders = ordersByDate[dateKey] || [];
            const positioned = layoutCascade(dayOrders);
            return (
              <div key={dateKey} className="relative border-l">
                {positioned.map(({ order, startMin, endMin, index }) => {
                  const h = Math.floor(startMin / 60);
                  const m = startMin % 60;
                  const duration = endMin - startMin;

                  const topOffset = ((h - HOURS[0]) + m / 60) * SLOT_HEIGHT + (index * CASCADE_OFFSET);
                  const height = Math.max((duration / 60) * SLOT_HEIGHT - (index * CASCADE_OFFSET), 24);

                  return (
                    <div
                      key={order.id}
                      className="absolute left-0.5 right-0.5 pointer-events-auto"
                      style={{ top: topOffset, height, zIndex: index + 1 }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const orderId = e.dataTransfer.getData('text/plain');
                        if (orderId) {
                          const col = e.currentTarget.closest('.relative') as HTMLElement;
                          if (col) {
                            const hour = getHourFromY(e, col);
                            onDrop(orderId, dateKey, `${String(hour).padStart(2, '0')}:00`);
                          }
                        }
                      }}
                    >
                      <EventCard
                        order={order}
                        compact
                        onClick={() => {
                          if (isMobile && onTouchPickUp) {
                            onTouchPickUp(order.id);
                          } else {
                            onOrderSelect(order);
                          }
                        }}
                        draggable={!isMobile}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
                        fillHeight
                        colorShift={index}
                        isMoving={movingOrderId === order.id}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
      </div>
    </div>
  );
}
