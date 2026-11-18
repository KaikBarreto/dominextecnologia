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
const SCHEDULE_SESSION_UNAVAILABLE = 'schedule_session_unavailable';

type ScheduleReadError = Error & {
  code?: string;
  status?: number;
  cause?: unknown;
};

function sessionUnavailableError(cause?: unknown): ScheduleReadError {
  const error = new Error('Sua sessão está sendo restabelecida. Tente novamente em instantes.') as ScheduleReadError;
  error.code = SCHEDULE_SESSION_UNAVAILABLE;
  if (cause) error.cause = cause;
  return error;
}

async function ensureScheduleSession(expectedUserId: string) {
  const current = await supabase.auth.getSession();
  if (current.error) throw sessionUnavailableError(current.error);
  if (current.data.session?.access_token && current.data.session.user.id === expectedUserId) return;

  // Em retomadas do PWA ou logo após uma atualização, o AuthContext pode já
  // conhecer o usuário enquanto o cliente ainda restaura/renova o JWT. Uma
  // única renovação fecha essa janela sem jamais consultar como anon.
  const refreshed = await supabase.auth.refreshSession();
  if (
    refreshed.error
    || !refreshed.data.session?.access_token
    || refreshed.data.session.user.id !== expectedUserId
  ) {
    throw sessionUnavailableError(refreshed.error);
  }
}

export function shouldRetryScheduleRead(failureCount: number, rawError: unknown) {
  if (failureCount >= 2) return false;

  const error = rawError as ScheduleReadError | null;
  const code = error?.code ?? '';
  const message = error?.message?.toLowerCase() ?? '';
  if (code === SCHEDULE_SESSION_UNAVAILABLE || code === '42501') return false;

  return (
    !code
    || code.startsWith('PGRST')
    || /fetch|network|connection|timeout|tempo limite|temporar/.test(message)
    || (typeof error?.status === 'number' && error.status >= 500)
  );
}

export function useScheduleOrders(
  window: ScheduleOrdersWindow,
  options: { enabled?: boolean } = {},
) {
  const { profile, session } = useAuth();
  const companyId = profile?.company_id ?? null;
  const sessionUserId = session?.user.id ?? null;
  const profileBelongsToSession = !!sessionUserId && profile?.user_id === sessionUserId;
  const enabled = options.enabled !== false
    && !!companyId
    && profileBelongsToSession
    && !!window.startDate
    && !!window.endDate;

  const query = useQuery({
    queryKey: ['service-orders', 'schedule-window', companyId, sessionUserId, window.startDate, window.endDate],
    enabled,
    queryFn: async () => {
      await ensureScheduleSession(sessionUserId!);

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
    // Repete apenas falhas transitórias e limita a duas novas tentativas. Isso
    // recupera oscilações curtas sem criar uma tempestade de consultas quando
    // a API inteira estiver indisponível.
    retry: shouldRetryScheduleRead,
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
