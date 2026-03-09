import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ServiceOrder, OsType } from '@/types/database';
import { EventCard } from './EventCard';
import type { Holiday } from '@/utils/holidays';

interface MonthlyCalendarProps {
  currentDate: Date;
  serviceOrders: (ServiceOrder & { customer: any; equipment: any })[];
  onDateSelect?: (date: Date) => void;
  onDateDoubleClick?: (date: Date) => void;
  onOrderSelect?: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onDrop?: (orderId: string, newDate: string, newTime: string) => void;
}

const osTypeColors: Record<OsType, string> = {
  manutencao_preventiva: 'bg-success text-success-foreground',
  manutencao_corretiva: 'bg-destructive text-destructive-foreground',
  instalacao: 'bg-info text-info-foreground',
  visita_tecnica: 'bg-warning text-warning-foreground',
};

const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Preventiva',
  manutencao_corretiva: 'Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

export function MonthlyCalendar({
  currentDate,
  serviceOrders,
  onDateSelect,
  onDateDoubleClick,
  onOrderSelect,
  onDrop,
}: MonthlyCalendarProps) {
  const isMobile = useIsMobile();

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const ordersByDate = useMemo(() => {
    const grouped: Record<string, (ServiceOrder & { customer: any; equipment: any })[]> = {};
    serviceOrders.forEach((order) => {
      if (order.scheduled_date) {
        if (!grouped[order.scheduled_date]) grouped[order.scheduled_date] = [];
        grouped[order.scheduled_date].push(order);
      }
    });
    Object.values(grouped).forEach((arr) =>
      arr.sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'))
    );
    return grouped;
  }, [serviceOrders]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary/10');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10');
  };

  const handleDropOnDay = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10');
    const orderId = e.dataTransfer.getData('orderId');
    const time = e.dataTransfer.getData('orderTime') || '08:00';
    if (orderId && onDrop) onDrop(orderId, dateKey, time);
  };

  const weekDaysMobile = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const weekDaysDesktop = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'];
  const weekDays = isMobile ? weekDaysMobile : weekDaysDesktop;

  // Mobile: compact dot-based calendar like reference
  if (isMobile) {
    return (
      <div className="flex flex-col bg-card rounded-xl border shadow-sm overflow-hidden">
        {/* Week Days Header */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid - compact */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayOrders = ordersByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, currentDate);

            return (
              <div
                key={idx}
                onClick={() => onDateSelect?.(day)}
                onDoubleClick={() => onDateDoubleClick?.(day)}
                className={cn(
                  'flex flex-col items-center justify-center py-2.5 cursor-pointer transition-colors',
                  !isCurrentMonth && 'opacity-30',
                  'hover:bg-accent/50'
                )}
              >
                <span
                  className={cn(
                    'text-sm font-medium w-8 h-8 flex items-center justify-center rounded-lg',
                    isToday && !isSelected && 'text-primary font-bold',
                    isSelected && 'bg-primary text-primary-foreground rounded-lg'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {/* Dots for orders */}
                {dayOrders.length > 0 && (
                  <div className="flex gap-0.5 mt-1 h-2">
                    {dayOrders.slice(0, 3).map((order) => {
                      const color = (order as any).service_type?.color || 'hsl(var(--primary))';
                      return (
                        <div
                          key={order.id}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      );
                    })}
                    {dayOrders.length > 3 && (
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    )}
                  </div>
                )}
                {dayOrders.length === 0 && <div className="h-2 mt-1" />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop: full calendar with EventCards
  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden">
      {/* Week Days Header */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {weekDays.map((day) => (
          <div
            key={day}
            className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 flex-1 overflow-auto">
        {calendarDays.map((day, idx) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayOrders = ordersByDate[dateKey] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={idx}
              onClick={() => onDateSelect?.(day)}
              onDoubleClick={() => onDateDoubleClick?.(day)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDropOnDay(e, dateKey)}
              className={cn(
                'min-h-[100px] border-b border-r p-1.5 cursor-pointer transition-colors',
                !isCurrentMonth && 'bg-muted/30',
                isToday && 'bg-primary/5',
                'hover:bg-accent/50'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                    !isCurrentMonth && 'text-muted-foreground',
                    isToday && 'bg-primary text-primary-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dayOrders.length > 3 && (
                  <Badge variant="secondary" className="text-xs h-5 px-1.5">
                    +{dayOrders.length - 3}
                  </Badge>
                )}
              </div>

              <div className="space-y-1 overflow-hidden">
                {dayOrders.slice(0, 3).map((order) => (
                  <EventCard
                    key={order.id}
                    order={order}
                    compact
                    onClick={() => onOrderSelect?.(order)}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('orderId', order.id);
                      e.dataTransfer.setData('orderTime', order.scheduled_time || '08:00');
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
