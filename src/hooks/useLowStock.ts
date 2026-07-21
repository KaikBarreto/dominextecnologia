import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Linha da view `inventory_low_stock`.
 * Representa um material abaixo do mínimo em um local de estoque específico.
 */
export interface LowStockRow {
  company_id: string;
  inventory_id: string;
  material_name: string;
  material_sku: string | null;
  stock_id: string;
  stock_name: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  /** Quantidade necessária para atingir o mínimo (min_quantity - quantity). */
  deficit: number;
  cost_price: number | null;
}

/**
 * Hook que lista materiais abaixo do mínimo via a view `inventory_low_stock`.
 * Respeita RLS — nunca chama supabase.from() direto no componente.
 */
export function useLowStock() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: lowStockRows = [], isLoading } = useQuery({
    queryKey: ['low-stock', companyId],
    queryFn: async (): Promise<LowStockRow[]> => {
      const { data, error } = await supabase
        .from('inventory_low_stock' as never)
        .select(
          'company_id, inventory_id, material_name, material_sku, stock_id, stock_name, quantity, min_quantity, unit, deficit, cost_price',
        )
        .order('stock_name')
        .order('material_name');
      if (error) throw error;
      return (data ?? []) as LowStockRow[];
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  /**
   * IDs dos materiais de estoque que estão abaixo do mínimo em ALGUM local.
   * Memoizado para não criar um Set novo a cada render (evita quebrar memo dos consumidores).
   */
  const lowStockInventoryIds = useMemo(
    () => new Set<string>(lowStockRows.map((r) => r.inventory_id)),
    [lowStockRows],
  );

  /**
   * Retorna as linhas de baixo estoque filtradas por local (stock_id).
   * Útil para pré-carregar materiais ao criar uma requisição a partir de um local.
   */
  function getByStock(stockId: string): LowStockRow[] {
    return lowStockRows.filter((r) => r.stock_id === stockId);
  }

  return {
    lowStockRows,
    lowStockInventoryIds,
    isLoading,
    getByStock,
  };
}
