import { useMemo, useState } from 'react';
import {
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

import { MonthlyCalendar } from '@/components/schedule/MonthlyCalendar';
import { WeeklyCalendar } from '@/components/schedule/WeeklyCalendar';
import { DailyCalendar } from '@/components/schedule/DailyCalendar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ServiceOrder } from '@/types/database';

/**
 * Calendar reutilizável da Onda C — PMOC.
 *
 * Wrapper "extração mínima" sobre os componentes existentes do /agenda
 * (`MonthlyCalendar`, `WeeklyCalendar`, `DailyCalendar`). O objetivo é
 * permitir reuso dentro do contrato PMOC (aba Cronograma) e no portal
 * público sem refatorar `Schedule.tsx`.
 *
 * Diferenças relevantes vs Agenda principal:
 * - `readOnly` desabilita drag&drop, criação por slot e double-click.
 * - Sem painel de detalhes lateral — `onOSClick` é entregue ao parent.
 * - Sem filtros próprios — espera que o consumidor já tenha filtrado
 *   `serviceOrders` (ex: por `contract_id`).
 *
 * Mobile-first.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.5
 */

export type PmocCronogramaView = 'month' | 'week' | 'day';

// O tipo de OS aceito reflete o que os componentes internos da Agenda esperam
// (`MonthlyCalendar` etc.) — `customer` e `equipment` são relations do Supabase
// que vêm como joins, por isso ficam soltos como `unknown` aqui (tratados como
// objeto opaco pelo calendar interno via narrowing).
export type PmocCronogramaCalendarOrder = ServiceOrder & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipment: any;
};

type CalendarOrder = PmocCronogramaCalendarOrder;

export interface PmocCronogramaCalendarProps {
  serviceOrders: CalendarOrder[];
  view?: PmocCronogramaView;
  readOnly?: boolean;
  /**
   * Click em uma OS (renderizada num dia). Em mobile, MonthlyCalendar
   * normalmente trata click no card como "selecionar"; aqui apenas repassamos.
   */
  onOSClick?: (os: CalendarOrder) => void;
  initialDate?: Date;
  /**
   * Permite esconder os controles de navegação (prev/today/next + tabs).
   * Útil quando o pai já tem header próprio.
   */
  showControls?: boolean;
  className?: string;
}

// Noop seguro: o calendar interno espera handlers; em readOnly não fazemos nada.
const noop = () => {};
const noopDrop: (orderId: string, newDate: string, newTime: string) => void = () => {};

export function PmocCronogramaCalendar({
  serviceOrders,
  view: viewProp,
  readOnly = false,
  onOSClick,
  initialDate,
  showControls = true,
  className,
}: PmocCronogramaCalendarProps) {
  const isMobile = useIsMobile();
  const [internalView, setInternalView] = useState<PmocCronogramaView>(viewProp ?? 'month');
  const view = viewProp ?? internalView;
  const [currentDate, setCurrentDate] = useState<Date>(initialDate ?? new Date());

  const handlePrev = () => {
    if (view === 'month') setCurrentDate((d) => subMonths(d, 1));
    else if (view === 'week') setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subDays(d, 1));
  };

  const handleNext = () => {
    if (view === 'month') setCurrentDate((d) => addMonths(d, 1));
    else if (view === 'week') setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addDays(d, 1));
  };

  const handleToday = () => setCurrentDate(new Date());

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const currentKey = format(currentDate, 'yyyy-MM-dd');
  const isToday = todayKey === currentKey;

  // Em readOnly desabilitamos qualquer mutação de estado dos calendars
  const handleOrderSelect = (order: CalendarOrder) => {
    if (onOSClick) onOSClick(order);
  };

  // SlotClick / double-click só fazem sentido quando editável + handler conhecido.
  // Para o uso PMOC (interno e portal público), apenas leitura/seleção.
  const handleSlotClick: (date: string, time: string) => void = noop;
  const handleDateDoubleClick: ((date: Date) => void) | undefined = undefined;
  const handleDrop = noopDrop;

  const renderedCalendar = useMemo(() => {
    if (view === 'month') {
      return (
        <MonthlyCalendar
          currentDate={currentDate}
          serviceOrders={serviceOrders}
          onDateSelect={(d) => setCurrentDate(d)}
          onDateDoubleClick={handleDateDoubleClick}
          onOrderSelect={handleOrderSelect}
          onDrop={handleDrop}
        />
      );
    }
    if (view === 'week') {
      return (
        <WeeklyCalendar
          currentDate={currentDate}
          orders={serviceOrders}
          onOrderSelect={handleOrderSelect}
          onSlotClick={handleSlotClick}
          onDrop={handleDrop}
        />
      );
    }
    return (
      <DailyCalendar
        currentDate={currentDate}
        orders={serviceOrders}
        onOrderSelect={handleOrderSelect}
        onSlotClick={handleSlotClick}
        onDrop={handleDrop}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate, serviceOrders, readOnly]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showControls && (
        <>
          {/* Navegação de período */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Período anterior"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors active:bg-muted/80"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-semibold capitalize truncate">
                {format(currentDate, view === 'day' ? "dd 'de' MMMM yyyy" : 'MMMM yyyy', { locale: ptBR })}
              </h3>
              {!isToday && (
                <button
                  type="button"
                  onClick={handleToday}
                  className="text-[11px] text-primary font-medium leading-tight"
                >
                  Voltar para hoje
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Próximo período"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors active:bg-muted/80"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Toggle dia/semana/mês — só aparece quando o pai não fixou a view. */}
          {!viewProp && (
            <Tabs
              value={view}
              onValueChange={(v) => setInternalView(v as PmocCronogramaView)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="day">Dia</TabsTrigger>
                <TabsTrigger value="week">Semana</TabsTrigger>
                <TabsTrigger value="month">Mês</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </>
      )}

      {/* Indicador "vazio" amigável quando não há OS — defensivo */}
      {serviceOrders.length === 0 && (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
          <CalendarIcon className="mx-auto mb-1 h-4 w-4" aria-hidden="true" />
          Nenhuma ordem de serviço deste contrato neste período.
        </div>
      )}

      <div
        className={cn(
          'rounded-xl border bg-card overflow-hidden',
          isMobile && (view === 'day' || view === 'week') && 'h-[60vh] max-h-[60vh] flex flex-col',
        )}
      >
        {renderedCalendar}
      </div>

      {/* Espaço pra futura legenda — Onda D acrescenta status sanitário */}
    </div>
  );
}

