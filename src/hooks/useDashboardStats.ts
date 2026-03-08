import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Fetch ALL OS with dates for client-side filtering
      const { data: allOS, error: osError } = await supabase
        .from('service_orders')
        .select(`
          id,
          order_number,
          status,
          os_type,
          scheduled_date,
          customer:customers(name)
        `)
        .order('created_at', { ascending: false });
      
      if (osError) throw osError;

      // Fetch customer count
      const { count: customerCount, error: customerError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      
      if (customerError) throw customerError;

      // Fetch ALL financial transactions for client-side filtering
      const { data: allFinancial, error: financialError } = await supabase
        .from('financial_transactions')
        .select('transaction_type, amount, transaction_date')
        .order('transaction_date');
      
      if (financialError) throw financialError;

      return {
        allOS: allOS ?? [],
        recentOS: allOS ?? [],
        clientesAtivos: customerCount ?? 0,
        allFinancial: allFinancial ?? [],
      };
    },
    refetchInterval: 30000,
  });
}
