import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder } from '@/types/database';

/**
 * Lista TODAS as OS com status 'pausada' do tenant atual,
 * sem filtro de data — para o painel "OS Pausadas" que evita
 * o técnico ter que voltar mês a mês na agenda procurando OS antigas.
 *
 * RLS garante o isolamento por tenant; aqui só consultamos.
 *
 * Ordenação: mais antiga primeiro (paused_at ASC NULLS LAST), pois quanto
 * mais tempo pausada, mais urgente lembrar dela. O backfill garantiu que
 * OS pausadas existentes tenham paused_at, e o trigger BEFORE UPDATE
 * garante que toda transição não-pausada → pausada preenche a coluna.
 * O NULLS LAST é defensivo, caso surja alguma OS sem paused_at.
 */
export function usePausedOrders() {
  const query = useQuery({
    queryKey: ['paused-orders'],
    queryFn: async () => {
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('service_orders')
          .select(`
            *,
            customer:customers(id, name, phone, document, address, address_number, complement, neighborhood, city, state, zip_code, company_name, customer_type),
            equipment:equipment(id, name, brand, model),
            service_type:service_types(id, name, color, number_prefix)
          `)
          .eq('status', 'pausada')
          .order('paused_at', { ascending: true, nullsFirst: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        allData = allData.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Aplica fallback de snapshot pra OS com cliente/equipamento deletado
      allData.forEach((order: any) => {
        const snap = order.snapshot_data;
        if (!order.customer && snap?.customer) order.customer = snap.customer;
        if (!order.equipment && snap?.equipment) order.equipment = snap.equipment;
        if (!order.service_type && snap?.service_type) order.service_type = snap.service_type;
      });

      return allData as unknown as (ServiceOrder & {
        customer: any;
        equipment: any;
        service_type: any;
      })[];
    },
  });

  return {
    pausedOrders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
