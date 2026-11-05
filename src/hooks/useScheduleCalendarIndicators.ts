import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface ScheduleCalendarIndicator {
  date: string;
  hasContractOccurrence: boolean;
  hasServiceOrder: boolean;
  contractOccurrenceMatchesEquipment: boolean;
  serviceOrderMatchesEquipment: boolean;
}

interface UseScheduleCalendarIndicatorsOptions {
  month: Date;
  customerId?: string | null;
  equipmentIds?: string[];
  excludeServiceOrderId?: string | null;
  enabled?: boolean;
}

// Mantém a raiz canônica de service-orders: qualquer mutation que invalida OSs
// também atualiza os pontos do calendário, sem depender do chamador do modal.
export const SCHEDULE_CALENDAR_INDICATORS_KEY = ['service-orders', 'calendar-indicators'] as const;

/**
 * Busca apenas o resumo dos dias ocupados no mês visível do DatePicker.
 * A RPC roda como invoker, portanto a RLS de service_orders continua sendo a
 * fonte de verdade do tenant e nenhuma informação operacional da OS é exposta.
 */
export function useScheduleCalendarIndicators({
  month,
  customerId,
  equipmentIds = [],
  excludeServiceOrderId,
  enabled = true,
}: UseScheduleCalendarIndicatorsOptions) {
  const startDate = format(startOfWeek(startOfMonth(month)), 'yyyy-MM-dd');
  const endDate = format(endOfWeek(endOfMonth(month)), 'yyyy-MM-dd');

  return useQuery({
    queryKey: [
      ...SCHEDULE_CALENDAR_INDICATORS_KEY,
      startDate,
      endDate,
      customerId ?? null,
      [...equipmentIds].sort(),
      excludeServiceOrderId ?? null,
    ],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ScheduleCalendarIndicator[]> => {
      const { data, error } = await supabase.rpc('get_schedule_calendar_indicators', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_customer_id: customerId ?? undefined,
        p_equipment_ids: equipmentIds.length > 0 ? equipmentIds : undefined,
        p_exclude_service_order_id: excludeServiceOrderId ?? undefined,
      });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        date: row.schedule_date,
        hasContractOccurrence: row.has_contract_occurrence,
        hasServiceOrder: row.has_service_order,
        contractOccurrenceMatchesEquipment: row.contract_occurrence_matches_equipment,
        serviceOrderMatchesEquipment: row.service_order_matches_equipment,
      }));
    },
  });
}
