import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type InventoryItem = Tables<'inventory'>;
export type InventoryItemInsert = TablesInsert<'inventory'>;
export type InventoryItemUpdate = TablesUpdate<'inventory'>;
export type InventoryStockLevel = Tables<'inventory_stock_levels'>;

export function useInventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  // Saldos por estoque — fonte de verdade do novo modelo multi-depósito.
  // Consultado separado pra não poluir a query principal e ser invalidado
  // independentemente (transferências, movimentos, etc.).
  const { data: stockLevels = [] } = useQuery({
    queryKey: ['inventory-stock-levels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_stock_levels')
        .select('*');
      if (error) throw error;
      return data as InventoryStockLevel[];
    },
  });

  /**
   * Retorna a quantidade de um material em um estoque específico.
   * Quando stockId é null/undefined, retorna o campo quantity do item
   * (espelho da soma, mantido por trigger legado).
   */
  const getQuantityForStock = (inventoryId: string, stockId: string | null | undefined): number => {
    if (!stockId) return items.find((i) => i.id === inventoryId)?.quantity ?? 0;
    const level = stockLevels.find(
      (l) => l.inventory_id === inventoryId && l.stock_id === stockId,
    );
    return level?.quantity ?? 0;
  };

  const createItem = useMutation({
    mutationFn: async (item: InventoryItemInsert) => {
      const { data, error } = await supabase
        .from('inventory')
        .insert(item)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Item cadastrado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao cadastrar item', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateItem = useMutation({
    // `previousQuantity` é o valor ANTES da edição (o que está no banco hoje).
    // Quando a quantidade muda, NÃO escrevemos quantity no update direto: a
    // diferença vira um movimento 'ajuste' via RPC atômica, que já recalcula o
    // estoque e deixa rastro no Kardex. Os demais campos seguem no update normal.
    mutationFn: async ({
      id,
      previousQuantity,
      ...updates
    }: InventoryItemUpdate & { id: string; previousQuantity?: number | null }) => {
      // Separa a quantidade dos demais campos.
      const { quantity: newQuantityRaw, ...nonQuantity } = updates;

      // 1) Campos não-quantidade vão no update direto (se houver algum).
      if (Object.keys(nonQuantity).length > 0) {
        const { error } = await supabase
          .from('inventory')
          .update(nonQuantity)
          .eq('id', id);
        if (error) throw error;
      }

      // 2) Se a quantidade mudou, registra um movimento de ajuste (delta
      //    assinado). A RPC trava a linha, recalcula e grava o movimento —
      //    por isso NÃO aplicamos a quantity no update acima (evita double-count).
      const oldQty = previousQuantity ?? 0;
      const newQty = newQuantityRaw ?? oldQty;
      const delta = newQty - oldQty;
      if (newQuantityRaw !== undefined && delta !== 0) {
        const { error: rpcError } = await supabase.rpc('register_inventory_movement', {
          p_inventory_id: id,
          p_movement_type: 'ajuste',
          p_quantity: delta,
          p_notes: 'Ajuste manual',
        });
        if (rpcError) throw rpcError;
      }

      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({ title: 'Item atualizado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar item', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      // First remove references in service_materials
      await supabase
        .from('service_materials')
        .update({ stock_item_id: null })
        .eq('stock_item_id', id);

      // Remove references in quote_items
      await supabase
        .from('quote_items')
        .update({ inventory_id: null })
        .eq('inventory_id', id);

      // Remove inventory movements
      await supabase
        .from('inventory_movements')
        .delete()
        .eq('inventory_id', id);

      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({ title: 'Item removido com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover item', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Statistics
  const totalItems = items.length;
  const lowStockItems = items.filter(item => 
    item.quantity !== null && 
    item.min_quantity !== null && 
    item.quantity <= item.min_quantity
  );
  const totalValue = items.reduce((acc, item) => {
    const qty = item.quantity || 0;
    const price = item.cost_price || 0;
    return acc + (qty * price);
  }, 0);
  const totalSaleValue = items.reduce((acc, item) => {
    const qty = item.quantity || 0;
    const price = item.sale_price || item.cost_price || 0;
    return acc + (qty * price);
  }, 0);

  return {
    items,
    stockLevels,
    isLoading,
    error,
    createItem,
    updateItem,
    deleteItem,
    getQuantityForStock,
    stats: {
      totalItems,
      lowStockItems: lowStockItems.length,
      totalValue,
      totalSaleValue,
    },
  };
}
