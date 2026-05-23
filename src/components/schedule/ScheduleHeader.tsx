import { ChevronLeft, ChevronRight, Plus, Filter, Star, PauseCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
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
  onOpenPaused?: () => void;
  pausedCount?: number;
  // Filters — multi-select (vazio = todos)
  technicianFilter: string[];
  onTechnicianFilterChange: (val: string[]) => void;
  technicians: { user_id: string; full_name: string }[];
  customerFilter: string[];
  onCustomerFilterChange: (val: string[]) => void;
  customers: { id: string; name: string }[];
  statusFilter: string[];
  onStatusFilterChange: (val: string[]) => void;
}

const statusOptions: { value: OsStatus; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'pausada', label: 'Pausada' },
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
  onOpenPaused,
  pausedCount = 0,
  technicianFilter,
  onTechnicianFilterChange,
  technicians,
  customerFilter,
  onCustomerFilterChange,
  customers,
  statusFilter,
  onStatusFilterChange,
}: ScheduleHeaderProps) {
  const hasActiveFilters = technicianFilter.length > 0 || customerFilter.length > 0 || statusFilter.length > 0;
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
            <PopoverContent className="w-80 space-y-4" align="end">
              <FilterCheckboxGroup
                label="Técnico"
                options={technicians.map((t) => ({ value: t.user_id, label: t.full_name }))}
                selected={technicianFilter}
                onChange={onTechnicianFilterChange}
              />
              <FilterCheckboxGroup
                label="Cliente"
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                selected={customerFilter}
                onChange={onCustomerFilterChange}
              />
              <FilterCheckboxGroup
                label="Status"
                options={statusOptions.map((s) => ({ value: s.value, label: s.label }))}
                selected={statusFilter}
                onChange={onStatusFilterChange}
              />
            </PopoverContent>
          </Popover>

          {onOpenPaused && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenPaused}
              className={pausedCount > 0 ? 'border-amber-500/40 text-amber-600 hover:bg-amber-500 hover:text-white' : ''}
              aria-label="Ver OS pausadas"
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              {isMobile ? 'Pausadas' : 'OS Pausadas'}
              {pausedCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-semibold">
                  {pausedCount}
                </span>
              )}
            </Button>
          )}

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
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">Legenda:</span>
          {serviceTypes.filter(t => t.is_active).map((st) => (
            <span
              key={st.id}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white"
              style={{ backgroundColor: st.color }}
            >
              {st.name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground">
            <Star className="h-2.5 w-2.5" />
            Feriado
          </span>
        </div>
      )}
    </div>
  );
}
