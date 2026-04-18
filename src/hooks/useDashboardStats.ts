import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';

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
            customer:customers(name, city, state, lat, lng)
          `)
          .order('created_at', { ascending: false })
      );

      // Fetch customer count
      const { count: customerCount, error: customerError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      if (customerError) throw customerError;

      // Fetch ALL paid financial transactions (paginated)
      const allFinancial = await fetchAllPaginated(
        () => supabase
          .from('financial_transactions')
          .select('transaction_type, amount, transaction_date, is_paid')
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
      };
    },
    refetchInterval: 30000,
  });
}
