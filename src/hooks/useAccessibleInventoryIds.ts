import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  const { data: rawIds = [], isLoading } = useQuery({
    queryKey: ['accessible-inventory-ids'],
    queryFn: fetchAccessibleInventoryIds,
    staleTime: 30_000,
  });

  /**
   * Set de IDs acessíveis — memoizado para não criar uma instância nova a cada render,
   * evitando re-renders desnecessários nos consumidores que fazem `.has()`.
   */
  const accessibleIds = useMemo(() => new Set<string>(rawIds), [rawIds]);

  return { accessibleIds, isLoading };
}
