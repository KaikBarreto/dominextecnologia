import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type InventoryItem = Tables<'inventory'>;
export type InventoryItemInsert = TablesInsert<'inventory'>;
export type InventoryItemUpdate = TablesUpdate<'inventory'>;

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
    mutationFn: async ({ id, ...updates }: InventoryItemUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
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
    isLoading,
    error,
    createItem,
    updateItem,
    deleteItem,
    stats: {
      totalItems,
      lowStockItems: lowStockItems.length,
      totalValue,
      totalSaleValue,
    },
  };
}
