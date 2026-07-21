import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type InventoryItem = Tables<'inventory'>;
export type InventoryItemInsert = TablesInsert<'inventory'>;
export type InventoryItemUpdate = TablesUpdate<'inventory'>;
export type InventoryStockLevel = Tables<'inventory_stock_levels'>;

export interface InlineMovementParams {
  inventoryId: string;
  stockId: string;
  movementType: 'entrada' | 'saida' | 'ajuste';
  /** Quantidade POSITIVA (o sinal é aplicado internamente com base no tipo). */
  quantity: number;
  notes?: string;
}

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

  /**
   * Retorna o estoque mínimo de um material em um estoque específico.
   * Retorna null quando não há level cadastrado ou min_quantity não definido.
   */
  const getMinQuantityForStock = (inventoryId: string, stockId: string | null | undefined): number | null => {
    if (!stockId) return null;
    const level = stockLevels.find(
      (l) => l.inventory_id === inventoryId && l.stock_id === stockId,
    );
    return level?.min_quantity ?? null;
  };

  /**
   * Atualiza o min_quantity em inventory_stock_levels para um par (item, estoque).
   * Tenta UPDATE primeiro (nivel já existe); se nenhuma linha foi afetada, faz
   * INSERT buscando company_id do perfil do usuário atual.
   */
  const updateStockLevelMinQuantity = useMutation({
    mutationFn: async ({ inventoryId, stockId, minQuantity }: { inventoryId: string; stockId: string; minQuantity: number | null }) => {
      // Tenta UPDATE no nível existente (company_id já está na linha)
      const { error: updateErr, data: updatedRows } = await supabase
        .from('inventory_stock_levels')
        .update({ min_quantity: minQuantity })
        .match({ inventory_id: inventoryId, stock_id: stockId })
        .select('id');
      if (updateErr) throw updateErr;

      // Se nenhuma linha foi atualizada, o level ainda não existe: cria com quantity=0
      if (!updatedRows || updatedRows.length === 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profileData } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();
        if (!profileData?.company_id) return;
        const { error: insertErr } = await supabase
          .from('inventory_stock_levels')
          .insert({
            inventory_id: inventoryId,
            stock_id: stockId,
            min_quantity: minQuantity,
            quantity: 0,
            company_id: profileData.company_id,
          });
        if (insertErr) throw insertErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar mínimo', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  /**
   * Registra um movimento inline de entrada ou saída no estoque.
   * Chama a RPC register_inventory_movement com o p_stock_id correto.
   */
  const registerInlineMovement = useMutation({
    mutationFn: async ({ inventoryId, stockId, movementType, quantity, notes }: InlineMovementParams) => {
      // Sinal: entrada = positivo, saida = negativo, ajuste = como vier (positivo significa adição)
      const signedQty = movementType === 'saida' ? -Math.abs(quantity) : Math.abs(quantity);
      const { error } = await supabase.rpc('register_inventory_movement', {
        p_inventory_id: inventoryId,
        p_movement_type: movementType,
        p_quantity: signedQty,
        p_notes: notes ?? null,
        p_stock_id: stockId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar movimentação', description: getErrorMessage(error), variant: 'destructive' });
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
    // `previousQuantity` é o valor ANTES da edição no local ativo (não a soma global).
    // `activeStockId` — quando fornecido, o ajuste vai pro local certo via p_stock_id.
    // Quando a quantidade muda, NÃO escrevemos quantity no update direto: a
    // diferença vira um movimento 'ajuste' via RPC atômica, que já recalcula o
    // estoque e deixa rastro no Kardex. Os demais campos seguem no update normal.
    mutationFn: async ({
      id,
      previousQuantity,
      activeStockId,
      ...updates
    }: InventoryItemUpdate & { id: string; previousQuantity?: number | null; activeStockId?: string }) => {
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
      //    Passa p_stock_id quando temos o local ativo, para ajustar o local certo.
      const oldQty = previousQuantity ?? 0;
      const newQty = newQuantityRaw ?? oldQty;
      const delta = newQty - oldQty;
      if (newQuantityRaw !== undefined && delta !== 0) {
        const { error: rpcError } = await supabase.rpc('register_inventory_movement', {
          p_inventory_id: id,
          p_movement_type: 'ajuste',
          p_quantity: delta,
          p_notes: 'Ajuste manual',
          ...(activeStockId ? { p_stock_id: activeStockId } : {}),
        });
        if (rpcError) throw rpcError;
      }

      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
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
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({ title: 'Item removido com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover item', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Statistics
  const totalItems = items.length;
  // Conta materiais ÚNICOS com saldo abaixo do mínimo em algum local (via stockLevels).
  // Usa o mesmo critério do ícone de alerta na lista (qty < min, strict, por local).
  // Fallback pro campo global legado quando não há stockLevels ainda.
  const lowStockMaterialIds = new Set<string>(
    stockLevels
      .filter((l) => l.min_quantity != null && l.quantity < l.min_quantity)
      .map((l) => l.inventory_id),
  );
  const lowStockItems =
    lowStockMaterialIds.size > 0
      ? lowStockMaterialIds.size
      : items.filter((item) =>
          item.quantity !== null &&
          item.min_quantity !== null &&
          item.quantity < item.min_quantity,
        ).length;

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
    getMinQuantityForStock,
    updateStockLevelMinQuantity,
    registerInlineMovement,
    stats: {
      totalItems,
      lowStockItems,
      totalValue,
      totalSaleValue,
    },
  };
}
