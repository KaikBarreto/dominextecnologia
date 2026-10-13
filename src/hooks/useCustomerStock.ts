import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type CustomerInventoryItem = Tables<'inventory'>;
type InventoryStockLevel = Tables<'inventory_stock_levels'>;

export function filterInventoryForCustomer(
  items: CustomerInventoryItem[],
  customerId: string,
): CustomerInventoryItem[] {
  return items.filter((item) => item.customer_id === customerId);
}

/**
 * Catálogo e saldos exclusivos de um cliente.
 *
 * Não mistura materiais gerais: além do filtro no PostgREST, filtra novamente a
 * resposta no client como defesa de apresentação. A escrita/commit continua
 * protegida pelo banco.
 */
export function useCustomerStock(customerId?: string | null) {
  const inventoryQuery = useQuery({
    queryKey: ['customer-stock-inventory', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<CustomerInventoryItem[]> => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('customer_id', customerId!)
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return filterInventoryForCustomer(
        (data ?? []) as unknown as CustomerInventoryItem[],
        customerId!,
      );
    },
  });

  const items = inventoryQuery.data ?? [];
  const inventoryIds = items.map((item) => item.id);

  const levelsQuery = useQuery({
    queryKey: ['customer-stock-levels', customerId, inventoryIds],
    enabled: !!customerId && inventoryQuery.isSuccess && inventoryIds.length > 0,
    queryFn: async (): Promise<InventoryStockLevel[]> => {
      const { data, error } = await supabase
        .from('inventory_stock_levels')
        .select('*')
        .in('inventory_id', inventoryIds);
      if (error) throw error;
      return (data ?? []) as InventoryStockLevel[];
    },
  });

  const getQuantityForStock = (inventoryId: string, stockId: string | null | undefined): number => {
    if (!stockId) return 0;
    return levelsQuery.data?.find(
      (level) => level.inventory_id === inventoryId && level.stock_id === stockId,
    )?.quantity ?? 0;
  };

  return {
    items,
    stockLevels: levelsQuery.data ?? [],
    getQuantityForStock,
    isLoading: inventoryQuery.isLoading || levelsQuery.isLoading,
    isError: inventoryQuery.isError || levelsQuery.isError,
    error: inventoryQuery.error ?? levelsQuery.error,
    refetch: async () => {
      const [inventoryResult, levelsResult] = await Promise.all([
        inventoryQuery.refetch(),
        levelsQuery.refetch(),
      ]);
      return { inventoryResult, levelsResult };
    },
  };
}
