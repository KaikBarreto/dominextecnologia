import { ChevronLeft, ChevronRight, Plus, Filter, Star } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { OsStatus } from '@/types/database';
import { useServiceTypes } from '@/hooks/useServiceTypes';

export type ViewMode = 'month' | 'week' | 'day';

interface ScheduleHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewOrder?: () => void;
  // Filters
  technicianFilter: string;
  onTechnicianFilterChange: (val: string) => void;
  technicians: { user_id: string; full_name: string }[];
  customerFilter: string;
  onCustomerFilterChange: (val: string) => void;
  customers: { id: string; name: string }[];
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
}

const statusOptions: { value: OsStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
];

export function ScheduleHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onNewOrder,
  technicianFilter,
  onTechnicianFilterChange,
  technicians,
  customerFilter,
  onCustomerFilterChange,
  customers,
  statusFilter,
  onStatusFilterChange,
}: ScheduleHeaderProps) {
  const hasActiveFilters = technicianFilter !== 'all' || customerFilter !== 'all' || statusFilter !== 'all';
  const { serviceTypes } = useServiceTypes();
  const isMobile = useIsMobile();
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={onPrev} className="h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onNext} className="h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize ml-2">
            {format(currentDate, viewMode === 'day' ? "dd 'de' MMMM yyyy" : 'MMMM yyyy', { locale: ptBR })}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={onToday} className="hover:bg-secondary hover:text-secondary-foreground">
            Hoje
          </Button>

          <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="month" className="text-xs px-3">Mês</TabsTrigger>
              {!isMobile && <TabsTrigger value="week" className="text-xs px-3">Semana</TabsTrigger>}
              <TabsTrigger value="day" className="text-xs px-3">Dia</TabsTrigger>
            </TabsList>
          </Tabs>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={hasActiveFilters ? 'border-primary text-primary' : ''}>
                <Filter className="h-4 w-4 mr-2" />
                Filtros
                {hasActiveFilters && <span className="ml-1 w-2 h-2 rounded-full bg-primary" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Técnico</label>
                <Select value={technicianFilter} onValueChange={onTechnicianFilterChange}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          {onNewOrder && (
            <Button size="sm" onClick={onNewOrder}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa/OS
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      {serviceTypes.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-xs text-muted-foreground font-medium">Legenda:</span>
          {serviceTypes.filter(t => t.is_active).map((st) => (
            <div key={st.id} className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: st.color }} />
              <span className="text-xs text-muted-foreground">{st.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-secondary flex items-center justify-center">
              <Star className="h-2 w-2 text-secondary-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">Feriado</span>
          </div>
        </div>
      )}
    </div>
  );
}
