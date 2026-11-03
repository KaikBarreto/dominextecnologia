import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InventoryAbcSourceRow } from '@/lib/inventory-abc';

interface InventoryAbcReportParams {
  startDate?: string;
  endDate?: string;
  stockIds?: string[];
}

export function useInventoryAbcReport({
  startDate,
  endDate,
  stockIds,
}: InventoryAbcReportParams) {
  return useQuery({
    // A raiz `inventory` faz as mutations canônicas do estoque invalidarem
    // também esta leitura derivada, evitando relatório defasado após movimento.
    queryKey: ['inventory', 'abc-report', startDate ?? null, endDate ?? null, stockIds ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inventory_abc_report', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_stock_ids: stockIds?.length ? stockIds : undefined,
      });
      if (error) throw error;
      return (data ?? []) as InventoryAbcSourceRow[];
    },
  });
}
