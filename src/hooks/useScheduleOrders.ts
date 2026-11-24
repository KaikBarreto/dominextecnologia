import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder } from '@/types/database';
import { fetchAllPaginated } from '@/utils/supabasePagination';

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
const SCHEDULE_RELATIONS_SELECT = `
  *,
  customer:customers(id, name, phone, celular, email, document, address, address_number, complement, neighborhood, city, state, zip_code, company_name, customer_type),
  equipment:equipment(id, name, brand, model),
  form_template:form_templates(id, name),
  service_type:service_types!service_orders_service_type_id_fkey(id, name, color, number_prefix),
  contract:contracts(id, name, is_pmoc)
`;

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

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isFallbackVisibleOrder(
  order: ScheduleOrder,
  window: ScheduleOrdersWindow,
  today: string,
) {
  const scheduledDate = order.scheduled_date ?? '';
  if (scheduledDate >= window.startDate && scheduledDate <= window.endDate) return true;

  const schedulePlan = Array.isArray(order.schedule_plan) ? order.schedule_plan : [];
  if (schedulePlan.some((slot) => {
    const date = slot && typeof slot === 'object' && 'date' in slot
      ? String(slot.date ?? '')
      : '';
    return date >= window.startDate && date <= window.endDate;
  })) return true;

  const resumedDate = order.resumed_at?.slice(0, 10) ?? '';
  return (
    window.startDate <= today
    && ['pendente', 'a_caminho', 'em_andamento'].includes(order.status)
    && !!resumedDate
    && scheduledDate < resumedDate
    && resumedDate <= window.endDate
  );
}

/**
 * Caminho de continuidade operacional da Agenda. Continua recortado no
 * servidor, paginado e protegido pelas mesmas policies RLS das tabelas. Ele
 * evita que uma indisponibilidade da RPC transforme a Agenda inteira em uma
 * tela vazia, sem voltar ao download do histórico completo.
 */
export async function fetchScheduleOrdersFallback(window: ScheduleOrdersWindow) {
  const today = new Date().toISOString().slice(0, 10);
  const multiDayStart = shiftIsoDate(window.startDate, -31);
  const endExclusive = shiftIsoDate(window.endDate, 1);

  const primaryPromise = fetchAllPaginated<ScheduleOrder>(() => supabase
    .from('service_orders')
    .select(SCHEDULE_RELATIONS_SELECT)
    .gte('scheduled_date', window.startDate)
    .lte('scheduled_date', window.endDate)
    .order('scheduled_date')
    .order('id'));

  const multiDayPromise = fetchAllPaginated<ScheduleOrder>(() => supabase
    .from('service_orders')
    .select(SCHEDULE_RELATIONS_SELECT)
    .gt('scheduled_days', 1)
    .gte('scheduled_date', multiDayStart)
    .lte('scheduled_date', window.endDate)
    .order('scheduled_date')
    .order('id'));

  const resumedPromise = window.startDate <= today
    ? fetchAllPaginated<ScheduleOrder>(() => supabase
      .from('service_orders')
      .select(SCHEDULE_RELATIONS_SELECT)
      .in('status', ['pendente', 'a_caminho', 'em_andamento'])
      .not('resumed_at', 'is', null)
      .lt('resumed_at', endExclusive)
      .order('resumed_at')
      .order('id'))
    : Promise.resolve([] as ScheduleOrder[]);

  const candidates = (await Promise.all([
    primaryPromise,
    multiDayPromise,
    resumedPromise,
  ])).flat();
  const orders = [...new Map(
    candidates
      .filter((order) => isFallbackVisibleOrder(order, window, today))
      .map((order) => [order.id, order]),
  ).values()];

  if (orders.length === 0) return orders;

  const assigneeMap = new Map<string, string[]>();
  try {
    for (let index = 0; index < orders.length; index += 200) {
      const ids = orders.slice(index, index + 200).map((order) => order.id);
      const rows = await fetchAllPaginated<{ service_order_id: string; user_id: string }>(() => supabase
        .from('service_order_assignees')
        .select('service_order_id, user_id')
        .in('service_order_id', ids)
        .order('service_order_id')
        .order('user_id'));
      for (const row of rows) {
        const assignees = assigneeMap.get(row.service_order_id) ?? [];
        assignees.push(row.user_id);
        assigneeMap.set(row.service_order_id, assignees);
      }
    }
  } catch (error) {
    const diagnostic = error as { code?: string; message?: string };
    console.warn('[Agenda] Responsáveis não puderam ser agregados no fallback.', {
      code: diagnostic?.code ?? 'unknown',
      message: diagnostic?.message?.slice(0, 160) ?? 'Erro sem mensagem',
    });
  }

  return orders.map((order) => ({
    ...order,
    _assignee_user_ids: assigneeMap.get(order.id) ?? [],
  }));
}

export async function fetchScheduleOrders(window: ScheduleOrdersWindow) {
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

    if (error) {
      console.warn('[Agenda] RPC da janela visível indisponível; usando leitura recortada.', {
        code: (error as { code?: string }).code ?? 'unknown',
        message: error.message?.slice(0, 160) ?? 'Erro sem mensagem',
      });
      return fetchScheduleOrdersFallback(window);
    }
    const page = data ?? [];
    entries.push(...page.map((row) => row.entry));
    if (page.length < SCHEDULE_PAGE_SIZE) break;
  }
  return entries;
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
      return fetchScheduleOrders(window);
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
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
