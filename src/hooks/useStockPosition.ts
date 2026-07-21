import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StockPositionRow {
  stock_id: string;
  stock_name: string;
  inventory_id: string;
  sku: string;
  name: string;
  unit: string;
  saldo: number;
  cost_price: number;
  sale_price: number;
  valor: number;
  projecao: number;
}

interface UseStockPositionParams {
  /** ISO 8601 timestamp — passado como p_at pra RPC */
  at: string;
  /** Filtra por locais específicos. null/vazio = todos */
  stockIds?: string[] | null;
  /** Habilitado apenas quando os params estiverem prontos */
  enabled?: boolean;
}

export function useStockPosition({ at, stockIds, enabled = true }: UseStockPositionParams) {
  const ids = stockIds && stockIds.length > 0 ? stockIds : null;

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['stock-position', at, ids],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_stock_balance_at_date', {
        p_at: at,
        p_stock_ids: ids ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as StockPositionRow[];
    },
    enabled,
    // Não precisa de refetch automático, o usuário controla o filtro
    staleTime: 1000 * 30,
  });

  return { rows, isLoading, error, refetch };
}
