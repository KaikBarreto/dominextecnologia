import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import type { ServiceOrder } from '@/types/database';

// Status que fazem o chamado "sumir" do card (encerrado)
const PORTAL_CALL_CLOSED_STATUSES = ['concluida', 'cancelada'];
const OPERATIONAL_OPEN_STATUSES = ['pendente', 'agendada', 'a_caminho', 'em_andamento', 'pausada'] as const;

const DASHBOARD_STALE_TIME_MS = 2 * 60 * 1000;
const DASHBOARD_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export interface DashboardDateRange {
  from?: Date;
  to?: Date;
}

export interface DashboardQueryBounds {
  mode: 'all' | 'bounded';
  /** Início do período anterior, inclusivo, em YYYY-MM-DD. */
  dataStart: string | null;
  /** Fim do período selecionado, inclusivo, em YYYY-MM-DD. */
  dataEnd: string | null;
}

type DashboardRating = {
  service_order_id: string;
  quality_rating: number | null;
};

type DashboardFinancialRow = {
  transaction_type: 'entrada' | 'saida';
  amount: number;
  transaction_date: string;
  is_paid: boolean;
  transfer_pair_id: string | null;
};

export type DashboardServiceOrder = ServiceOrder & {
  rating?: DashboardRating | DashboardRating[] | null;
};

/**
 * Converte o período visível na janela mínima necessária para os KPIs:
 * período anterior de mesmo tamanho + período atual. Datas são calendário da
 * empresa já materializadas pelo DateRangeFilter; `differenceInCalendarDays`
 * evita perder/ganhar um dia em mudanças de horário de verão.
 */
export function getDashboardQueryBounds(range?: DashboardDateRange): DashboardQueryBounds {
  const from = range?.from;
  const to = range?.to;
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return { mode: 'all', dataStart: null, dataEnd: null };
  }

  const inclusiveDays = differenceInCalendarDays(to, from) + 1;
  return {
    mode: 'bounded',
    dataStart: format(subDays(from, inclusiveDays), 'yyyy-MM-dd'),
    dataEnd: format(to, 'yyyy-MM-dd'),
  };
}

/** Une a janela histórica às OS abertas sem duplicar linhas compartilhadas. */
export function mergeDashboardServiceOrders(
  windowRows: DashboardServiceOrder[],
  openRows: DashboardServiceOrder[],
): DashboardServiceOrder[] {
  const byId = new Map<string, DashboardServiceOrder>();
  [...windowRows, ...openRows].forEach((serviceOrder) => byId.set(serviceOrder.id, serviceOrder));
  return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function extractDashboardRatings(serviceOrders: DashboardServiceOrder[]): DashboardRating[] {
  return serviceOrders.flatMap((serviceOrder) => {
    const embedded = serviceOrder.rating;
    if (!embedded) return [];
    return Array.isArray(embedded) ? embedded : [embedded];
  });
}

const DASHBOARD_OS_SELECT = `
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
  customer:customers(name, city, state, lat, lng),
  rating:service_ratings(service_order_id, quality_rating)
`;

export function useDashboardStats(range?: DashboardDateRange) {
  const bounds = getDashboardQueryBounds(range);

  return useQuery({
    queryKey: ['dashboard-stats', bounds.dataStart ?? 'all', bounds.dataEnd ?? 'all'],
    queryFn: async () => {
      const windowOSPromise = fetchAllPaginated<DashboardServiceOrder>(
        () => {
          const query = supabase
            .from('service_orders')
            .select(DASHBOARD_OS_SELECT);

          // `all` preserva inclusive OS sem agendamento. No modo limitado, o
          // banco devolve período anterior + atual; a query de abertas abaixo
          // repõe críticos, chamados do portal e técnicos em campo fora dele.
          const filteredQuery = bounds.mode === 'bounded'
            ? query.gte('scheduled_date', bounds.dataStart!).lte('scheduled_date', bounds.dataEnd!)
            : query;
          return filteredQuery.order('created_at', { ascending: false });
        }
      );

      const openOSPromise = bounds.mode === 'bounded'
        ? fetchAllPaginated<DashboardServiceOrder>(
          () => supabase
            .from('service_orders')
            .select(DASHBOARD_OS_SELECT)
            .in('status', [...OPERATIONAL_OPEN_STATUSES])
            .order('created_at', { ascending: false })
        )
        : Promise.resolve([] as DashboardServiceOrder[]);

      const allOSPromise = Promise.all([windowOSPromise, openOSPromise])
        .then(([windowRows, openRows]) => mergeDashboardServiceOrders(windowRows, openRows));

      const customerCountPromise = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      const allFinancialPromise = fetchAllPaginated<DashboardFinancialRow>(
        () => {
          const query = supabase
            .from('financial_transactions')
            // `transfer_pair_id` vem junto porque o Dashboard precisa EXCLUIR
            // movimento interno (transferência entre contas / pagamento de fatura
            // de cartão) do faturamento e do fluxo de caixa. Sem a coluna aqui, o
            // filtro na tela vira no-op silencioso.
            .select('transaction_type, amount, transaction_date, is_paid, transfer_pair_id')
            .eq('is_paid', true);

          const filteredQuery = bounds.mode === 'bounded'
            ? query.gte('transaction_date', bounds.dataStart!).lte('transaction_date', bounds.dataEnd!)
            : query;
          return filteredQuery.order('transaction_date');
        }
      );

      const serviceTypesPromise = supabase
        .from('service_types')
        .select('id, name, color');

      // Perfis dependem dos IDs encontrados nas OS. Em vez de ler todos os
      // usuários da empresa, traz somente quem aparece como técnico no histórico.
      const profilesPromise = allOSPromise.then(async (allOS) => {
        const technicianIds = [
          ...new Set(
            (allOS as ServiceOrder[])
              .map((serviceOrder) => serviceOrder.technician_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        if (technicianIds.length === 0) return [];

        const { data } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', technicianIds);
        return data ?? [];
      });

      const [
        allOS,
        { count: customerCount, error: customerError },
        allFinancial,
        { data: serviceTypes },
        profiles,
      ] = await Promise.all([
        allOSPromise,
        customerCountPromise,
        allFinancialPromise,
        serviceTypesPromise,
        profilesPromise,
      ]);

      if (customerError) throw customerError;

      // Chamados abertos: origin='portal' e status fora dos encerradores.
      const portalCalls = (allOS as ServiceOrder[]).filter(
        (os) => os.origin === 'portal' && !PORTAL_CALL_CLOSED_STATUSES.includes(os.status),
      );

      // `service_ratings.service_order_id` é UNIQUE (relação 1:1). Embutir a
      // avaliação na OS limita as notas exatamente ao conjunto relevante e
      // evita uma query global ou fan-out por IDs.
      const ratings = extractDashboardRatings(allOS as DashboardServiceOrder[]);

      return {
        allOS,
        recentOS: allOS,
        clientesAtivos: customerCount ?? 0,
        allFinancial,
        profiles,
        ratings,
        serviceTypes: serviceTypes ?? [],
        portalCalls,
        portalCallsCount: portalCalls.length,
      };
    },
    // Mutações de OS/financeiro já invalidam `dashboard-stats`. O polling mais
    // espaçado cobre entradas externas (ex.: portal) sem reler todo o histórico
    // a cada 30 segundos enquanto o usuário mantém a tela aberta.
    staleTime: DASHBOARD_STALE_TIME_MS,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });
}
