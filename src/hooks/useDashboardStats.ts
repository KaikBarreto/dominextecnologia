import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import type { PortalCall } from '@/lib/portalCalls';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Fetch ALL OS with dates, technician and customer info (paginated)
      const allOS = await fetchAllPaginated(
        () => supabase
          .from('service_orders')
          .select(`
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
          `)
          .order('created_at', { ascending: false })
      );

      // Chamado é uma solicitação independente. Só entra no dashboard enquanto
      // aguarda triagem; a OS vinculada passa a pertencer ao fluxo normal.
      const { data: portalCallsData, error: portalCallsError } = await supabase
        .from('portal_calls')
        .select(`
          *,
          customer:customers(id, name, phone, celular),
          equipment:equipment(id, name, brand, model),
          contract:contracts(id, name),
          service_order:service_orders(id, order_number, status, scheduled_date)
        `)
        .eq('status', 'aguardando_analise')
        .order('created_at', { ascending: false });
      if (portalCallsError) throw portalCallsError;
      const portalCalls = (portalCallsData ?? []) as PortalCall[];

      // Fetch customer count
      const { count: customerCount, error: customerError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      if (customerError) throw customerError;

      // Fetch ALL paid financial transactions (paginated)
      const allFinancial = await fetchAllPaginated(
        () => supabase
          .from('financial_transactions')
          // `transfer_pair_id` vem junto porque o Dashboard precisa EXCLUIR
          // movimento interno (transferência entre contas / pagamento de fatura
          // de cartão) do faturamento e do fluxo de caixa. Sem a coluna aqui, o
          // filtro na tela vira no-op silencioso.
          .select('transaction_type, amount, transaction_date, is_paid, transfer_pair_id')
          .eq('is_paid', true)
          .order('transaction_date')
      );

      // Fetch profiles (for technician names)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url');

      // Fetch service ratings (paginated, can grow with each completed OS)
      const ratings = await fetchAllPaginated(
        () => supabase
          .from('service_ratings')
          .select('service_order_id, quality_rating, nps_score')
      );

      // Fetch service types
      const { data: serviceTypes } = await supabase
        .from('service_types')
        .select('id, name, color');

      return {
        allOS,
        recentOS: allOS,
        clientesAtivos: customerCount ?? 0,
        allFinancial,
        profiles: profiles ?? [],
        ratings,
        serviceTypes: serviceTypes ?? [],
        portalCalls,
        portalCallsCount: portalCalls.length,
      };
    },
    refetchInterval: 30000,
  });
}
