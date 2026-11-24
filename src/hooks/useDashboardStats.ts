import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { PortalCall } from '@/lib/portalCalls';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import type { ServiceOrder } from '@/types/database';

const CLOSED_ORDER_STATUSES = ['concluida', 'cancelada'];
const ACTIVE_FIELD_STATUSES = ['a_caminho', 'em_andamento'] as const;

type DashboardOrder = Pick<
  ServiceOrder,
  | 'id'
  | 'order_number'
  | 'status'
  | 'os_type'
  | 'scheduled_date'
  | 'technician_id'
  | 'check_in_time'
  | 'check_out_time'
  | 'created_at'
  | 'service_type_id'
  | 'origin'
  | 'description'
> & {
  customer?: {
    name: string;
    city?: string | null;
    state?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
};

interface DashboardFinancialRow {
  id: string;
  transaction_type: 'entrada' | 'saida';
  amount: number;
  transaction_date: string;
  is_paid: boolean | null;
  transfer_pair_id: string | null;
}

export interface DashboardStatsWindow {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  allTime?: boolean;
}

const ORDER_SELECT = `
  id,
  order_number,
  status,
  os_type,
  scheduled_date,
  technician_id,
  check_in_time,
  check_out_time,
  created_at,
  service_type_id,
  origin,
  description,
  customer:customers(name, city, state, lat, lng)
`;

function uniqueOrders(groups: DashboardOrder[][]) {
  const byId = new Map<string, DashboardOrder>();
  for (const group of groups) {
    for (const order of group) byId.set(order.id, order);
  }
  return [...byId.values()];
}

export function useDashboardStats(window: DashboardStatsWindow) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const rangeStart = window.allTime
    ? null
    : [window.startDate, window.previousStartDate].sort()[0];
  const rangeEnd = window.allTime
    ? null
    : [window.endDate, window.previousEndDate].sort().at(-1) ?? window.endDate;

  const statsQuery = useQuery({
    queryKey: [
      'dashboard-stats',
      companyId,
      window.allTime ? 'all' : rangeStart,
      window.allTime ? 'all' : rangeEnd,
    ],
    enabled: !!companyId,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');

      const periodOrdersPromise = fetchAllPaginated<DashboardOrder>(() => {
        let query = supabase
          .from('service_orders')
          .select(ORDER_SELECT)
          .order('created_at', { ascending: false })
          .order('id');
        if (rangeStart && rangeEnd) {
          query = query.gte('scheduled_date', rangeStart).lte('scheduled_date', rangeEnd);
        }
        return query;
      });

      const financialPromise = fetchAllPaginated<DashboardFinancialRow>(() => {
        let query = supabase
          .from('financial_transactions')
          .select('id, transaction_type, amount, transaction_date, is_paid, transfer_pair_id')
          .eq('is_paid', true)
          .is('cancelled_at', null)
          .order('transaction_date')
          .order('id');
        if (rangeStart && rangeEnd) {
          query = query.gte('transaction_date', rangeStart).lte('transaction_date', rangeEnd);
        }
        return query;
      });

      const [
        periodOrders,
        criticalOrdersResult,
        portalCallsResult,
        activeToday,
        customerResult,
        allFinancial,
        profiles,
        serviceTypes,
      ] = await Promise.all([
        periodOrdersPromise,
        supabase
          .from('service_orders')
          .select(ORDER_SELECT, { count: 'exact' })
          .not('status', 'in', `(${CLOSED_ORDER_STATUSES.join(',')})`)
          .lt('scheduled_date', today)
          .order('scheduled_date', { ascending: true })
          .limit(5),
        supabase
          .from('portal_calls')
          .select(`
            *,
            customer:customers(id, name, phone, celular),
            equipment:equipment(id, name, brand, model),
            contract:contracts(id, name),
            service_order:service_orders(id, order_number, status, scheduled_date)
          `, { count: 'exact' })
          .eq('status', 'aguardando_analise')
          .order('created_at', { ascending: false })
          .limit(5),
        fetchAllPaginated<DashboardOrder>(() => supabase
          .from('service_orders')
          .select(ORDER_SELECT)
          .eq('scheduled_date', today)
          .in('status', ACTIVE_FIELD_STATUSES)
          .order('id')),
        supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('is_deleted', false),
        financialPromise,
        fetchAllPaginated<{ user_id: string; full_name: string; avatar_url: string | null }>(() => supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .eq('is_active', true)
          .order('full_name')
          .order('user_id')),
        fetchAllPaginated<{ id: string; name: string; color: string }>(() => supabase
          .from('service_types')
          .select('id, name, color')
          .order('name')
          .order('id')),
      ]);

      if (criticalOrdersResult.error) throw criticalOrdersResult.error;
      if (portalCallsResult.error) throw portalCallsResult.error;
      if (customerResult.error) throw customerResult.error;

      const portalCalls = (portalCallsResult.data ?? []) as PortalCall[];
      const allOS = uniqueOrders([
        periodOrders,
        criticalOrdersResult.data ?? [],
        activeToday,
      ]);

      return {
        allOS,
        recentOS: periodOrders,
        clientesAtivos: customerResult.count ?? 0,
        allFinancial,
        profiles,
        serviceTypes,
        portalCalls,
        portalCallsCount: portalCallsResult.count ?? portalCalls.length,
        criticalOSCount: criticalOrdersResult.count ?? criticalOrdersResult.data?.length ?? 0,
      };
    },
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const completedOrderIds = useMemo(
    () => (statsQuery.data?.recentOS ?? [])
      .filter((order) => order.status === 'concluida')
      .map((order) => order.id),
    [statsQuery.data?.recentOS],
  );
  const ratingsQuery = useQuery({
    queryKey: [
      'dashboard-stats',
      'ratings',
      companyId,
      window.allTime ? 'all' : rangeStart,
      window.allTime ? 'all' : rangeEnd,
    ],
    enabled: !!companyId && completedOrderIds.length > 0,
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let index = 0; index < completedOrderIds.length; index += 200) {
        chunks.push(completedOrderIds.slice(index, index + 200));
      }
      const ratings: Array<{
        id: string;
        service_order_id: string;
        quality_rating: number | null;
        nps_score: number | null;
      }> = [];
      for (let index = 0; index < chunks.length; index += 4) {
        const batch = await Promise.all(
          chunks.slice(index, index + 4).map((ids) => fetchAllPaginated(() => supabase
            .from('service_ratings')
            .select('id, service_order_id, quality_rating, nps_score')
            .in('service_order_id', ids)
            .order('service_order_id')
            .order('id'))),
        );
        ratings.push(...batch.flat());
      }
      return ratings;
    },
    staleTime: 30_000,
  });

  return {
    ...statsQuery,
    data: statsQuery.data
      ? { ...statsQuery.data, ratings: ratingsQuery.data ?? [] }
      : undefined,
  };
}
