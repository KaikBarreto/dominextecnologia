import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import type { Tables, Database } from '@/integrations/supabase/types';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';

export type InventoryCount = Tables<'inventory_counts'>;
export type InventoryCountItem = Tables<'inventory_count_items'>;
export type InventoryCountDivergence = Database['public']['Views']['inventory_count_divergences']['Row'];

export interface CountItemWithDetails extends InventoryCountItem {
  material_name: string;
  material_sku: string | null;
  material_unit: string | null;
  stock_name: string;
}

export function useInventoryCounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Lista todos os inventários da empresa, ordenado por numero desc
  const { data: counts = [], isLoading } = useQuery({
    queryKey: ['inventory-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_counts')
        .select('*')
        .order('numero', { ascending: false });
      if (error) throw error;
      return data as InventoryCount[];
    },
  });

  // Carrega os itens de um inventário específico (com join de nomes)
  const loadCountDetail = async (countId: string): Promise<CountItemWithDetails[]> => {
    const { data, error } = await supabase
      .from('inventory_count_items')
      .select(`
        *,
        inventory:inventory_id ( name, sku, unit ),
        stock:stock_id ( name )
      `)
      .eq('count_id', countId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as InventoryCountItem),
      material_name: ((row.inventory as Record<string, string> | null)?.name) ?? '',
      material_sku: ((row.inventory as Record<string, string | null> | null)?.sku) ?? null,
      material_unit: ((row.inventory as Record<string, string | null> | null)?.unit) ?? null,
      stock_name: ((row.stock as Record<string, string> | null)?.name) ?? '',
    }));
  };

  // Carrega divergências (todos os itens com diff <> 0) de um inventário
  const getDivergences = async (countId: string): Promise<InventoryCountDivergence[]> => {
    const { data, error } = await supabase
      .from('inventory_count_divergences')
      .select('*')
      .eq('count_id', countId);
    if (error) throw error;
    return (data ?? []).filter((d) => d.diff !== 0) as InventoryCountDivergence[];
  };

  // Cria inventário: cabeçalho + stocks + geração de itens
  const createCount = useMutation({
    mutationFn: async ({
      notes,
      stockIds,
      groupIds,
      itemIds,
    }: {
      notes?: string;
      stockIds: string[];
      groupIds?: string[];
      itemIds?: string[];
    }) => {
      const companyId = await getCurrentUserCompanyId();
      if (stockIds.length === 0) throw new Error('Selecione ao menos um local de estoque.');

      // 1. INSERT cabeçalho — numero NÃO enviado (trigger preenche)
      const { data: userData } = await supabase.auth.getUser();
      const { data: countData, error: countErr } = await supabase
        .from('inventory_counts')
        .insert({
          company_id: companyId,
          notes: notes ?? null,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (countErr) throw countErr;
      const countId = countData.id;

      // 2. INSERT quais locais entram no inventário
      const stockRows = stockIds.map((sid) => ({
        company_id: companyId,
        count_id: countId,
        stock_id: sid,
      }));
      const { error: stocksErr } = await supabase
        .from('inventory_count_stocks')
        .insert(stockRows);
      if (stocksErr) throw stocksErr;

      // 3. Busca saldos por local (com custo e grupo do item)
      const { data: levels, error: levelsErr } = await supabase
        .from('inventory_stock_levels')
        .select('inventory_id, stock_id, quantity, inventory:inventory_id ( cost_price, group_id )')
        .in('stock_id', stockIds);
      if (levelsErr) throw levelsErr;

      // Filtra por itens específicos ou grupo
      const filteredLevels = (levels ?? []).filter((l) => {
        const inv = l.inventory as Record<string, unknown> | null;
        if (itemIds && itemIds.length > 0) {
          return itemIds.includes(l.inventory_id);
        }
        if (groupIds && groupIds.length > 0) {
          return groupIds.includes((inv?.group_id as string | null) ?? '');
        }
        return true;
      });

      if (filteredLevels.length > 0) {
        // Deduplicar (count_id, inventory_id, stock_id)
        const seen = new Set<string>();
        const itemRows = filteredLevels
          .filter((l) => {
            const key = `${l.inventory_id}__${l.stock_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((l) => {
            const inv = l.inventory as Record<string, unknown> | null;
            return {
              company_id: companyId,
              count_id: countId,
              inventory_id: l.inventory_id,
              stock_id: l.stock_id,
              expected_qty: l.quantity ?? 0,
              unit_cost: (inv?.cost_price as number | null) ?? null,
              counted_qty: null as number | null,
            };
          });

        const { error: itemsErr } = await supabase
          .from('inventory_count_items')
          .insert(itemRows);
        if (itemsErr) throw itemsErr;
      }

      return countData as InventoryCount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar inventário',
        description: getErrorMessage(err),
      });
    },
  });

  // Atualiza a quantidade contada de um item
  const updateCountItem = useMutation({
    mutationFn: async ({
      itemId,
      countedQty,
    }: {
      itemId: string;
      countedQty: number | null;
    }) => {
      const { error } = await supabase
        .from('inventory_count_items')
        .update({ counted_qty: countedQty })
        .eq('id', itemId);
      if (error) throw error;
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar contagem',
        description: getErrorMessage(err),
      });
    },
  });

  // Finaliza o inventário via RPC (ajustes no Kardex)
  const finalizeCount = useMutation({
    mutationFn: async ({
      countId,
      notes,
    }: {
      countId: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('finalize_inventory_count', {
        p_count_id: countId,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data as { count_id: string; already_finalized: boolean; items_adjusted: number; diff_value: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      const adj = result?.items_adjusted ?? 0;
      toast({
        title: 'Inventário finalizado',
        description:
          adj > 0
            ? `${adj} ${adj === 1 ? 'item ajustado' : 'itens ajustados'} no estoque.`
            : 'Nenhuma divergência encontrada.',
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao finalizar inventário',
        description: getErrorMessage(err),
      });
    },
  });

  // Cancela um inventário aberto
  const cancelCount = useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase
        .from('inventory_counts')
        .update({ status: 'cancelado' })
        .eq('id', countId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      toast({ title: 'Inventário cancelado' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao cancelar inventário',
        description: getErrorMessage(err),
      });
    },
  });

  return {
    counts,
    isLoading,
    loadCountDetail,
    getDivergences,
    createCount,
    updateCountItem,
    finalizeCount,
    cancelCount,
  };
}
