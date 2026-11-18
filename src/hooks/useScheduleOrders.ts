import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder } from '@/types/database';

export interface ScheduleOrdersWindow {
  startDate: string;
  endDate: string;
}
type ScheduleOrder = ServiceOrder & {
  customer: ServiceOrder['customer'] | null;
  equipment: ServiceOrder['equipment'] | null;
  form_template: ServiceOrder['form_template'] | null;
  _assignee_user_ids?: string[];
};

type ScheduleEntryRow = { entry: ScheduleOrder };
type ScheduleRpcResult = { data: ScheduleEntryRow[] | null; error: Error | null };
interface ScheduleRpcBuilder extends PromiseLike<ScheduleRpcResult> {
  range(from: number, to: number): ScheduleRpcBuilder;
}

const SCHEDULE_PAGE_SIZE = 1000;

export function useScheduleOrders(
  window: ScheduleOrdersWindow,
  options: { enabled?: boolean } = {},
) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const enabled = options.enabled !== false && !!companyId && !!window.startDate && !!window.endDate;

  const query = useQuery({
    queryKey: ['service-orders', 'schedule-window', companyId, window.startDate, window.endDate],
    enabled,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as (
        name: string,
        args: { p_start_date: string; p_end_date: string },
      ) => ScheduleRpcBuilder;

      const entries: ScheduleOrder[] = [];
      for (let from = 0; ; from += SCHEDULE_PAGE_SIZE) {
        const { data, error } = await rpc('schedule_visible_entries_v1', {
          p_start_date: window.startDate,
          p_end_date: window.endDate,
        }).range(from, from + SCHEDULE_PAGE_SIZE - 1);

        if (error) throw error;
        const page = data ?? [];
        entries.push(...page.map((row) => row.entry));
        if (page.length < SCHEDULE_PAGE_SIZE) break;
      }
      return entries;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    // Oscilações curtas de rede não podem fazer a Agenda parecer vazia. A
    // consulta é idempotente e recortada pela janela visível, então repetir é
    // seguro e barato. Erros persistentes continuam chegando ao estado de erro.
    retry: 5,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    refetchOnReconnect: 'always',
  });

  return {
    serviceOrders: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
