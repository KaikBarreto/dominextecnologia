import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

export type PdvCustomerHistoryKind = 'orders' | 'quotes';
export interface PdvCustomerHistoryRow { id: string; number: number; status: string; total: number | null; created_at: string }
export function usePdvCustomerHistory(customerId: string, kind: PdvCustomerHistoryKind, page: number, enabled: boolean) {
  const { profile, hasScreenAccess } = useAuth();
  const scope = usePdvAuthorizedQueryScope();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: [kind === 'orders' ? 'pdv-orders' : 'pdv-preorders', 'customer-history', ...scope.key, customerId, page],
    enabled: enabled && scope.ready && !!customerId && (hasScreenAccess('screen:pdv') || hasScreenAccess('screen:pdv_orders')),
    queryFn: async (): Promise<{ rows: PdvCustomerHistoryRow[]; total: number }> => {
      if (kind === 'quotes') {
        // A tabela de orçamentos não permite leitura direta. A RPC aplica a
        // custódia; PostgREST filtra o UUID e pagina seu resultado autorizado.
        const { data, error, count } = await supabase.rpc('pdv_list_preorders_v2' as never, { p_status: null } as never, { count: 'exact' })
          .eq('customer_id', customerId).order('updated_at', { ascending: false })
          .range(page * 20, page * 20 + 19)
          .returns<Array<{ id: string; number: number; status: string; total: number | null; updated_at: string }>>();
        if (error) throw new Error('Não foi possível consultar os orçamentos deste cliente. Tente novamente.');
        return { rows: (data ?? []).map(row => ({ ...row, created_at: row.updated_at })), total: count ?? 0 };
      }
      const { data, error, count } = await supabase.from('pdv_orders')
        .select('id,number,status,total,created_at', { count: 'exact' })
        .eq('company_id', companyId!).eq('customer_id', customerId)
        .order('created_at', { ascending: false }).range(page * 20, page * 20 + 19);
      if (error) throw new Error('Não foi possível consultar o histórico deste cliente. Tente novamente.');
      return { rows: data ?? [], total: count ?? 0 };
    },
    retry: false,
    gcTime: 0,
  });
}
