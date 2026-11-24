import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStockManagement } from '@/hooks/useStocks';
import { fetchAllPaginated } from '@/utils/supabasePagination';

export async function fetchAccessibleInventoryIds(): Promise<string[]> {
  return fetchAllPaginated<string>(() =>
    supabase.rpc('get_accessible_inventory_ids'),
  );
}

/**
 * Retorna os IDs de itens de inventário que o usuário atual pode enxergar,
 * conforme a RPC `get_accessible_inventory_ids` (server-side, respeita acesso por local).
 *
 * Regra da RPC:
 *   - Material presente em ≥1 local acessível ao usuário → visível.
 *   - Material sem presença configurada em nenhum local (legado global) → visível.
 *   - Material presente SOMENTE em locais inacessíveis → oculto.
 *
 * Nunca chame supabase.from() direto no componente — este hook é a fronteira.
 */
export function useAccessibleInventoryIds() {
  const { scope, ready } = useStockManagement();
  const { data: rawIds = [], isLoading, error } = useQuery({
    queryKey: ['accessible-inventory-ids', ...scope],
    enabled: ready,
    queryFn: fetchAccessibleInventoryIds,
    staleTime: 30_000,
  });

  /**
   * Set de IDs acessíveis — memoizado para não criar uma instância nova a cada render,
   * evitando re-renders desnecessários nos consumidores que fazem `.has()`.
   */
  const accessibleIds = useMemo(() => new Set<string>(ready ? rawIds : []), [rawIds, ready]);

  return { accessibleIds, isLoading, error };
}
