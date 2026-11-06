import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface ScheduleCalendarIndicator {
  date: string;
  hasContractOccurrence: boolean;
  hasServiceOrder: boolean;
  contractOccurrenceMatchesEquipment: boolean;
  serviceOrderMatchesEquipment: boolean;
  contractOccurrenceCount: number;
  serviceOrderCount: number;
  contractOccurrenceEquipmentCount: number;
  serviceOrderEquipmentCount: number;
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
 * A RPC resolve o tenant a partir do usuário autenticado, valida a vigência e
 * devolve só agregados; nenhum dado operacional da OS é exposto ao calendário.
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
        // O fallback mantém a UI segura durante uma publicação gradual em que
        // o frontend novo encontre por instantes a versão anterior da RPC.
        contractOccurrenceCount: row.contract_occurrence_count ?? (row.has_contract_occurrence ? 1 : 0),
        serviceOrderCount: row.service_order_count ?? (row.has_service_order ? 1 : 0),
        contractOccurrenceEquipmentCount: row.contract_occurrence_equipment_count
          ?? (row.contract_occurrence_matches_equipment ? 1 : 0),
        serviceOrderEquipmentCount: row.service_order_equipment_count
          ?? (row.service_order_matches_equipment ? 1 : 0),
      }));
    },
  });
}
