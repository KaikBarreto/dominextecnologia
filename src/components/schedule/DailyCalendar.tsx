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

type PositionedOrder = {
  order: (ServiceOrder & { customer: any; equipment: any });
  startMin: number;
  endMin: number;
  col: number;
  totalCols: number;
};

function layoutOverlapping(
  dayOrders: (ServiceOrder & { customer: any; equipment: any })[]
): PositionedOrder[] {
  const items = dayOrders.map((order) => {
    const [h, m] = order.scheduled_time!.split(':').map(Number);
    const startMin = h * 60 + m;
    const duration = (order as any).duration_minutes || 120;
    return { order, startMin, endMin: startMin + duration, col: 0, totalCols: 1 };
  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Group into clusters of overlapping events
  const clusters: PositionedOrder[][] = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster.some(c => c.startMin < item.endMin && item.startMin < c.endMin)) {
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }

  // Assign columns within each cluster
  for (const cluster of clusters) {
    const cols: number[][] = []; // cols[colIndex] = array of endMin
    for (const item of cluster) {
      let assigned = false;
      for (let c = 0; c < cols.length; c++) {
        if (cols[c].every(end => end <= item.startMin)) {
          item.col = c;
          cols[c].push(item.endMin);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        item.col = cols.length;
        cols.push([item.endMin]);
      }
    }
    const totalCols = cols.length;
    for (const item of cluster) item.totalCols = totalCols;
  }

  return items;
}

export function DailyCalendar({ currentDate, orders, onOrderSelect, onSlotClick, onDrop }: DailyCalendarProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const dayOrders = useMemo(() => {
    return orders.filter(o => o.scheduled_date === dateKey && o.scheduled_time);
  }, [orders, dateKey]);

  const positionedOrders = useMemo(() => layoutOverlapping(dayOrders), [dayOrders]);

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

  const getHourFromY = (e: React.DragEvent) => {
    // Walk up to find the grid container (the relative div)
    const grid = (e.currentTarget.closest('.relative') || e.currentTarget) as HTMLElement;
    const rect = grid.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hourIndex = Math.floor(y / SLOT_HEIGHT);
    return HOURS[Math.max(0, Math.min(hourIndex, HOURS.length - 1))];
  };

  const handleCardDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCardDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const orderId = e.dataTransfer.getData('text/plain');
    if (orderId) {
      const hour = getHourFromY(e);
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
            {positionedOrders.map(({ order, startMin, endMin, col, totalCols }) => {
              const hour = Math.floor(startMin / 60);
              const minute = startMin % 60;
              const duration = endMin - startMin;

              const topOffset = ((hour - HOURS[0]) + minute / 60) * SLOT_HEIGHT;
              const height = Math.max((duration / 60) * SLOT_HEIGHT, 28);
              const widthPercent = 100 / totalCols;
              const leftPercent = col * widthPercent;

              return (
                <div
                  key={order.id}
                  className="absolute pointer-events-auto px-0.5"
                  style={{ top: topOffset, height, left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  onDragOver={handleCardDragOver}
                  onDrop={handleCardDrop}
                >
                  <EventCard
                    order={order}
                    onClick={() => onOrderSelect(order)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', order.id)}
                    fillHeight
                    colorShift={col}
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
