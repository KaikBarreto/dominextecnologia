import { useEffect, useMemo, useState } from 'react';
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
  /**
   * Click em UM DIA do calendário (vazio ou cheio). Usado pra drill-in lateral:
   * o pai recebe a data e pode renderizar painel com as OSs do dia. Diferente
   * de `onOSClick`, que dispara só ao clicar numa OS específica.
   */
  onDayClick?: (date: Date) => void;
  /**
   * Data selecionada (controlada externamente). Quando preenchida, o calendário
   * navega pra essa data como "current". Mantém `initialDate` para casos não
   * controlados.
   */
  selectedDate?: Date;
  initialDate?: Date;
  /**
   * Permite esconder os controles de navegação (prev/today/next + tabs).
   * Útil quando o pai já tem header próprio.
   */
  showControls?: boolean;
  /**
   * Quando true, sobrescreve a cor de cada OS no calendário pelo status
   * PMOC: verde (concluída), laranja (pendente futura), vermelho (atrasada).
   * Texto branco em todos os casos. Usa tokens semânticos via `hsl(var(--…))`
   * pra respeitar white-label e modo claro/escuro.
   *
   * Implementação: injeta `service_type.color` derivado do status em cada
   * OS antes de passar pro calendário interno — o `EventCard` já aplica
   * a cor custom como background e texto branco quando vê `service_type.color`.
   */
  pmocStatusColors?: boolean;
  className?: string;
}

/**
 * Mapeia status da OS pra cor semântica PMOC. Usado quando `pmocStatusColors`
 * está ligado. Retorna o valor CSS que vai direto no `style.backgroundColor`.
 */
function getPmocStatusColor(
  order: CalendarOrder,
  todayKey: string,
): string {
  if (order.status === 'concluida') {
    return 'hsl(var(--success))';
  }
  const isLate =
    order.status !== 'cancelada' &&
    !!order.scheduled_date &&
    order.scheduled_date < todayKey;
  if (isLate) {
    return 'hsl(var(--destructive))';
  }
  // Tudo o mais (agendada/pendente/em_andamento/a_caminho/pausada/cancelada
  // futura): laranja "pendente".
  return 'hsl(var(--warning))';
}

// Noop seguro: o calendar interno espera handlers; em readOnly não fazemos nada.
const noop = () => {};
const noopDrop: (orderId: string, newDate: string, newTime: string) => void = () => {};

export function PmocCronogramaCalendar({
  serviceOrders,
  view: viewProp,
  readOnly = false,
  onOSClick,
  onDayClick,
  selectedDate,
  initialDate,
  showControls = true,
  pmocStatusColors = false,
  className,
}: PmocCronogramaCalendarProps) {
  const isMobile = useIsMobile();
  const [internalView, setInternalView] = useState<PmocCronogramaView>(viewProp ?? 'month');
  const view = viewProp ?? internalView;
  // Quando o pai controla `selectedDate`, ele vira a fonte da verdade — assim
  // o calendário acompanha cliques no painel lateral. Internalmente ainda
  // mantemos `currentDate` pra navegação prev/next/today.
  const [currentDate, setCurrentDate] = useState<Date>(selectedDate ?? initialDate ?? new Date());

  // Sincroniza `currentDate` quando o pai muda `selectedDate` (controlled).
  // Usamos `getTime()` no dep array pra comparar por valor — instâncias Date
  // diferentes com o mesmo timestamp não causam re-render desnecessário.
  useEffect(() => {
    if (selectedDate) setCurrentDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate?.getTime()]);

  // Pré-processa as OSs quando `pmocStatusColors` está ligado: injeta uma
  // `service_type.color` sintética baseada em status. Isso aciona o caminho
  // de cor custom do EventCard (background colorido + texto branco) sem
  // mexer no componente compartilhado da Agenda.
  const decoratedOrders = useMemo<CalendarOrder[]>(() => {
    if (!pmocStatusColors) return serviceOrders;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayKey = `${y}-${m}-${d}`;
    return serviceOrders.map((order) => ({
      ...order,
      service_type: {
        ...((order as any).service_type ?? {}),
        color: getPmocStatusColor(order, todayKey),
      },
    } as CalendarOrder));
  }, [serviceOrders, pmocStatusColors]);

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

  // Click num dia do mês: notifica o pai (drill-in lateral) E atualiza o
  // "current" interno pra manter o feedback visual de seleção.
  const handleDateSelect = (d: Date) => {
    setCurrentDate(d);
    if (onDayClick) onDayClick(d);
  };

  const renderedCalendar = useMemo(() => {
    if (view === 'month') {
      return (
        <MonthlyCalendar
          currentDate={currentDate}
          serviceOrders={decoratedOrders}
          onDateSelect={handleDateSelect}
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
          orders={decoratedOrders}
          onOrderSelect={handleOrderSelect}
          onSlotClick={handleSlotClick}
          onDrop={handleDrop}
        />
      );
    }
    return (
      <DailyCalendar
        currentDate={currentDate}
        orders={decoratedOrders}
        onOrderSelect={handleOrderSelect}
        onSlotClick={handleSlotClick}
        onDrop={handleDrop}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate, decoratedOrders, readOnly]);

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

