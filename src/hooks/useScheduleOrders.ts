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

type ScheduleEntryRow = {
  entry: ScheduleOrder;
  cursor_scheduled_date: string;
  cursor_scheduled_time: string | null;
  cursor_scheduled_time_is_null: boolean;
  cursor_order_number: number;
  cursor_id: string;
};
type ScheduleRpcResult = { data: ScheduleEntryRow[] | null; error: Error | null };
interface ScheduleRpcBuilder extends PromiseLike<ScheduleRpcResult> {
  abortSignal(signal: AbortSignal): ScheduleRpcBuilder;
}

interface ScheduleCursor {
  scheduledDate: string;
  scheduledTime: string | null;
  scheduledTimeIsNull: boolean;
  orderNumber: number;
  id: string;
}

const SCHEDULE_PAGE_SIZE = 500;
const SCHEDULE_SESSION_UNAVAILABLE = 'schedule_session_unavailable';
const SCHEDULE_ORDER_COLUMNS = `
  admin_indirect_rate,
  bdi,
  check_in_by,
  check_in_time,
  check_out_by,
  check_out_time,
  client_signature_at,
  client_signed_by,
  commercial_adjustment,
  company_id,
  completed_at,
  contract_id,
  contract_reference_date,
  contract_visit_customized_at,
  created_at,
  created_by,
  crm_automation_action_key,
  crm_automation_rule_id,
  crm_checklist_id,
  customer_id,
  description,
  diagnosis,
  displacement_cost,
  distance_km,
  duration_minutes,
  entry_type,
  equipment_id,
  form_template_id,
  generate_nps_survey,
  id,
  km_cost,
  labor_hours,
  labor_value,
  lead_id,
  notes,
  order_number,
  legacy_order_number,
  origin,
  os_type,
  partial_finish,
  parts_used,
  parts_value,
  paused_at,
  pmoc_conformity_notes,
  pmoc_conformity_status,
  profit_rate,
  public_short_code,
  quote_id,
  recurrence_end_date,
  recurrence_group_id,
  recurrence_indeterminate,
  recurrence_interval,
  recurrence_type,
  recurrence_weekdays,
  require_client_signature,
  require_tech_signature,
  resumed_at,
  schedule_plan,
  scheduled_date,
  scheduled_days,
  scheduled_time,
  service_address,
  service_address_number,
  service_city,
  service_latitude,
  service_longitude,
  service_neighborhood,
  service_state,
  service_type_id,
  service_zip_code,
  show_in_schedule,
  solution,
  started_at,
  status,
  task_title,
  task_type_id,
  tax_rate,
  team_id,
  tech_signature_at,
  tech_signed_by,
  technician_id,
  total_cost,
  total_value,
  updated_at,
  use_bdi
`;
const SCHEDULE_RELATIONS_SELECT = `
  ${SCHEDULE_ORDER_COLUMNS},
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

function throwIfScheduleAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException('Consulta da Agenda cancelada.', 'AbortError');
  }
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

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isFallbackVisibleOrder(order: ScheduleOrder, window: ScheduleOrdersWindow, today: string) {
  if (order.entry_type === 'tarefa' && !order.show_in_schedule) return false;

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
 * Continuidade operacional da Agenda. A leitura permanece recortada no
 * servidor, paginada e sujeita às mesmas policies RLS das tabelas.
 */
export async function fetchScheduleOrdersFallback(
  window: ScheduleOrdersWindow,
  signal?: AbortSignal,
) {
  const requestSignal = signal ?? new AbortController().signal;
  throwIfScheduleAborted(requestSignal);

  const today = new Date().toISOString().slice(0, 10);
  const endExclusive = shiftIsoDate(window.endDate, 1);

  const primaryPromise = fetchAllPaginated<ScheduleOrder>(() => supabase
      .from('service_orders')
      .select(SCHEDULE_RELATIONS_SELECT)
      .gte('scheduled_date', window.startDate)
      .lte('scheduled_date', window.endDate)
      .order('scheduled_date')
      .order('id')
      .abortSignal(requestSignal));

  const multiDayPromise = fetchAllPaginated<ScheduleOrder>(() => supabase
      .from('service_orders')
      .select(SCHEDULE_RELATIONS_SELECT)
      .gt('scheduled_days', 1)
      .lte('scheduled_date', window.endDate)
      .gte('schedule_plan->-1->>date', window.startDate)
      .order('scheduled_date')
      .order('id')
      .abortSignal(requestSignal));

  const resumedPromise = window.startDate <= today
    ? fetchAllPaginated<ScheduleOrder>(() => supabase
        .from('service_orders')
        .select(SCHEDULE_RELATIONS_SELECT)
        .in('status', ['pendente', 'a_caminho', 'em_andamento'])
        .not('resumed_at', 'is', null)
        .lt('resumed_at', endExclusive)
        .order('resumed_at')
        .order('id')
        .abortSignal(requestSignal))
    : Promise.resolve([] as ScheduleOrder[]);

  const candidates = (await Promise.all([
    primaryPromise,
    multiDayPromise,
    resumedPromise,
  ])).flat();
  throwIfScheduleAborted(requestSignal);

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
          .order('user_id')
          .abortSignal(requestSignal));
      for (const row of rows) {
        const assignees = assigneeMap.get(row.service_order_id) ?? [];
        assignees.push(row.user_id);
        assigneeMap.set(row.service_order_id, assignees);
      }
    }
  } catch (error) {
    throwIfScheduleAborted(requestSignal);
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

export async function fetchScheduleOrders(
  window: ScheduleOrdersWindow,
  expectedUserId: string,
  signal?: AbortSignal,
) {
  const requestSignal = signal ?? new AbortController().signal;
  await ensureScheduleSession(expectedUserId);
  throwIfScheduleAborted(requestSignal);

  // Preserva o cliente do SDK; sem bind, a leitura cai no fallback por TypeError.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: {
      p_start_date: string;
      p_end_date: string;
      p_after_scheduled_date: string | null;
      p_after_scheduled_time: string | null;
      p_after_scheduled_time_is_null: boolean | null;
      p_after_order_number: number | null;
      p_after_id: string | null;
      p_page_size: number;
    },
  ) => ScheduleRpcBuilder;

  const entries: ScheduleOrder[] = [];
  let cursor: ScheduleCursor | null = null;

  while (true) {
    let result: ScheduleRpcResult;
    try {
      result = await rpc('schedule_visible_entries_v2', {
        p_start_date: window.startDate,
        p_end_date: window.endDate,
        p_after_scheduled_date: cursor?.scheduledDate ?? null,
        p_after_scheduled_time: cursor?.scheduledTime ?? null,
        p_after_scheduled_time_is_null: cursor?.scheduledTimeIsNull ?? null,
        p_after_order_number: cursor?.orderNumber ?? null,
        p_after_id: cursor?.id ?? null,
        p_page_size: SCHEDULE_PAGE_SIZE,
      }).abortSignal(requestSignal);
    } catch (error) {
      throwIfScheduleAborted(requestSignal);
      const diagnostic = error as ScheduleReadError;
      console.warn('[Agenda] Consulta principal não concluiu; usando leitura recortada.', {
        code: diagnostic?.code ?? 'unknown',
        message: diagnostic?.message?.slice(0, 160) ?? 'Erro sem mensagem',
      });
      return fetchScheduleOrdersFallback(window, requestSignal);
    }

    throwIfScheduleAborted(requestSignal);
    const { data, error } = result;

    if (error) {
      console.warn('[Agenda] Consulta principal indisponível; usando leitura recortada.', {
        code: (error as { code?: string }).code ?? 'unknown',
        message: error.message?.slice(0, 160) ?? 'Erro sem mensagem',
      });
      return fetchScheduleOrdersFallback(window, requestSignal);
    }

    const page = data ?? [];
    entries.push(...page.map((row) => row.entry));
    if (page.length < SCHEDULE_PAGE_SIZE) break;

    const lastRow = page.at(-1)!;
    const nextCursor: ScheduleCursor = {
      scheduledDate: lastRow.cursor_scheduled_date,
      scheduledTime: lastRow.cursor_scheduled_time,
      scheduledTimeIsNull: lastRow.cursor_scheduled_time_is_null,
      orderNumber: lastRow.cursor_order_number,
      id: lastRow.cursor_id,
    };
    if (
      cursor
      && cursor.scheduledDate === nextCursor.scheduledDate
      && cursor.scheduledTime === nextCursor.scheduledTime
      && cursor.scheduledTimeIsNull === nextCursor.scheduledTimeIsNull
      && cursor.orderNumber === nextCursor.orderNumber
      && cursor.id === nextCursor.id
    ) {
      console.warn('[Agenda] Cursor da consulta principal não avançou; usando leitura recortada.');
      return fetchScheduleOrdersFallback(window, requestSignal);
    }
    cursor = nextCursor;
  }
  return entries;
}

export function shouldRetryScheduleRead(failureCount: number, rawError: unknown) {
  if (failureCount >= 2) return false;

  const error = rawError as ScheduleReadError | null;
  const code = error?.code ?? '';
  const message = error?.message?.toLowerCase() ?? '';
  if (error?.name === 'AbortError' || code === SCHEDULE_SESSION_UNAVAILABLE || code === '42501') return false;

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
    queryFn: ({ signal }) => fetchScheduleOrders(window, sessionUserId!, signal),
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
