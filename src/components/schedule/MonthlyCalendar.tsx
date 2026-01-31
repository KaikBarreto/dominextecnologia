import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ServiceOrder, OsType } from '@/types/database';

interface MonthlyCalendarProps {
  serviceOrders: (ServiceOrder & { customer: any; equipment: any })[];
  onDateSelect?: (date: Date) => void;
  onOrderSelect?: (order: ServiceOrder & { customer: any; equipment: any }) => void;
  onNewOrder?: () => void;
}

const osTypeColors: Record<OsType, string> = {
  manutencao_preventiva: 'bg-success text-success-foreground',
  manutencao_corretiva: 'bg-destructive text-destructive-foreground',
  instalacao: 'bg-info text-info-foreground',
  visita_tecnica: 'bg-warning text-warning-foreground',
};

const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'PRV',
  manutencao_corretiva: 'COR',
  instalacao: 'INS',
  visita_tecnica: 'VIS',
};

export function MonthlyCalendar({
  serviceOrders,
  onDateSelect,
  onOrderSelect,
  onNewOrder,
}: MonthlyCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const ordersByDate = useMemo(() => {
    const grouped: Record<string, (ServiceOrder & { customer: any; equipment: any })[]> = {};
    
    serviceOrders.forEach((order) => {
      if (order.scheduled_date) {
        const dateKey = order.scheduled_date;
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(order);
      }
    });

    // Sort orders by time within each day
    Object.keys(grouped).forEach((dateKey) => {
      grouped[dateKey].sort((a, b) => {
        const timeA = a.scheduled_time || '00:00';
        const timeB = b.scheduled_time || '00:00';
        return timeA.localeCompare(timeB);
      });
    });

    return grouped;
  }, [serviceOrders]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const weekDays = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'];

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevMonth}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextMonth}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize ml-2">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Hoje
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          {onNewOrder && (
            <Button size="sm" onClick={onNewOrder} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Nova OS
            </Button>
          )}
        </div>
      </div>

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
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDate && isSameDay(day, selectedDate);

          return (
            <div
              key={idx}
              onClick={() => handleDateClick(day)}
              className={cn(
                'min-h-[120px] border-b border-r p-1.5 cursor-pointer transition-colors',
                !isCurrentMonth && 'bg-muted/30',
                isToday && 'bg-primary/5',
                isSelected && 'ring-2 ring-primary ring-inset',
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
                  <div
                    key={order.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOrderSelect?.(order);
                    }}
                    className={cn(
                      'group flex items-center gap-1 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-all hover:scale-[1.02]',
                      osTypeColors[order.os_type]
                    )}
                  >
                    <span className="font-medium shrink-0">
                      {order.scheduled_time?.slice(0, 5) || '--:--'}
                    </span>
                    <span className="truncate">
                      {osTypeLabels[order.os_type]} - {order.customer?.name || 'Cliente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-3 border-t bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">Legenda:</span>
        {Object.entries(osTypeLabels).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn('w-3 h-3 rounded-sm', osTypeColors[type as OsType])} />
            <span className="text-xs text-muted-foreground">
              {label} - {type === 'manutencao_preventiva' ? 'Preventiva' : 
                       type === 'manutencao_corretiva' ? 'Corretiva' :
                       type === 'instalacao' ? 'Instalação' : 'Visita'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
