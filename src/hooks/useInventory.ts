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

const INVENTORY_PAGE_SIZE = 1_000;

interface InventorySecurityRpcResult {
  data: unknown;
  error: Error | null;
}

// As RPCs chegam por migration nesta entrega. O cast local evita editar o
// arquivo de tipos gerados enquanto outras ondas também acrescentam schema.
const inventorySecurityRpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<InventorySecurityRpcResult>;

export function useInventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const result: InventoryItem[] = [];
      for (let offset = 0; ; offset += INVENTORY_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('inventory')
          .select('*')
          // Materiais alocados a clientes têm catálogo e saldo próprios. Eles só
          // aparecem na ficha/OS daquele cliente, nunca no estoque da prestadora.
          .is('customer_id', null)
          .order('name')
          .order('id')
          .range(offset, offset + INVENTORY_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as InventoryItem[];
        result.push(...page);
        if (page.length < INVENTORY_PAGE_SIZE) return result;
      }
    },
  });

  // Saldos por estoque — fonte de verdade do novo modelo multi-depósito.
  // Consultado separado pra não poluir a query principal e ser invalidado
  // independentemente (transferências, movimentos, etc.).
  //
  // `isSuccess` vira `stockLevelsLoaded`: é o sinal de "já tenho a resposta do
  // servidor" (fica true mesmo quando a resposta é lista vazia, e continua true
  // em refetches de fundo — não pisca pra false a cada invalidate). Os dialogs
  // de presença (InventoryFormDialog, StockConfiguratorDialog) usam esse sinal
  // pra nunca hidratar um checkbox em cima do default permissivo de
  // `getPresenceForStock` antes dos levels reais chegarem.
  const { data: stockLevels = [], isSuccess: stockLevelsLoaded } = useQuery({
    queryKey: ['inventory-stock-levels'],
    queryFn: async () => {
      const result: InventoryStockLevel[] = [];
      for (let offset = 0; ; offset += INVENTORY_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('inventory_stock_levels')
          .select('*')
          .order('id')
          .range(offset, offset + INVENTORY_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as InventoryStockLevel[];
        result.push(...page);
        if (page.length < INVENTORY_PAGE_SIZE) return result;
      }
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
   * Retorna se o material está presente em um estoque específico.
   * Default: true (quando não há level cadastrado, o material está presente por padrão — rollout backward-compat).
   */
  const getPresenceForStock = (inventoryId: string, stockId: string | null | undefined): boolean => {
    if (!stockId) return true;
    const level = stockLevels.find(
      (l) => l.inventory_id === inventoryId && l.stock_id === stockId,
    );
    // Sem level = ainda não foi configurado → padrão é presente (rollout sem sumir nada)
    if (!level) return true;
    return level.is_present ?? true;
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
   * Define exatamente em quais locais o material está presente.
   * RPC set_inventory_presence marca os da lista e desmarca os demais.
   * Lança erro com token `presence_has_balance:` quando local tem saldo > 0.
   */
  const setInventoryPresence = useMutation({
    mutationFn: async ({ inventoryId, stockIds }: { inventoryId: string; stockIds: string[] }) => {
      const { error } = await supabase.rpc('set_inventory_presence', {
        p_inventory_id: inventoryId,
        p_stock_ids: stockIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
    },
    // Não mostra toast aqui — a UI deve tratar presence_has_balance especificamente
    onError: (error: Error) => {
      if (!String(error.message).includes('presence_has_balance')) {
        toast({ title: 'Erro ao atualizar presença', description: getErrorMessage(error), variant: 'destructive' });
      }
      // Se for presence_has_balance, re-throw para a UI tratar
    },
  });

  /**
   * Marca presença de TODOS os materiais de um grupo em um local.
   */
  const addGroupToStock = useMutation({
    mutationFn: async ({ stockId, groupId }: { stockId: string; groupId: string }) => {
      const { error } = await supabase.rpc('add_group_to_stock', {
        p_stock_id: stockId,
        p_group_id: groupId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao adicionar grupo', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  /**
   * Configura o catálogo de um local inteiro (marca os da lista, desmarca o resto).
   * Lança erro com token `presence_has_balance:` quando material tem saldo > 0 no local.
   */
  const setStockMaterials = useMutation({
    mutationFn: async ({ stockId, inventoryIds }: { stockId: string; inventoryIds: string[] }) => {
      const { error } = await supabase.rpc('set_stock_materials', {
        p_stock_id: stockId,
        p_inventory_ids: inventoryIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
    },
    // Não mostra toast aqui — a UI deve tratar presence_has_balance especificamente
    onError: (error: Error) => {
      if (!String(error.message).includes('presence_has_balance')) {
        toast({ title: 'Erro ao configurar local', description: getErrorMessage(error), variant: 'destructive' });
      }
    },
  });

  /**
   * Registra um movimento inline de entrada ou saída no estoque.
   * Chama a RPC manual protegida com o p_stock_id correto.
   */
  const registerInlineMovement = useMutation({
    mutationFn: async ({ inventoryId, stockId, movementType, quantity, notes }: InlineMovementParams) => {
      // Sinal: entrada = positivo, saida = negativo, ajuste = como vier (positivo significa adição)
      const signedQty = movementType === 'saida' ? -Math.abs(quantity) : Math.abs(quantity);
      const { error } = await inventorySecurityRpc('inventory_register_manual_movement_v3', {
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
    mutationFn: async ({
      initialQuantity,
      activeStockId: stockId,
      ...item
    }: InventoryItemInsert & { initialQuantity?: number; activeStockId?: string | null }) => {
      // (a) Insere o catálogo com quantity = 0. O saldo real virá do inventory_stock_levels
      // via trigger de espelho após a RPC de entrada abaixo.
      const { data, error } = await supabase
        .from('inventory')
        .insert({ ...item, quantity: 0 })
        .select()
        .single();

      if (error) throw error;

      // (b) Se foi informada uma quantidade inicial > 0, registra como 'entrada' no
      // local ativo (ou principal quando stockId é null/undefined). Isso cria o
      // inventory_stock_levels com a quantidade correta e deixa rastro no Kardex.
      if (initialQuantity && initialQuantity > 0) {
        const { error: rpcError } = await inventorySecurityRpc('inventory_register_manual_movement_v3', {
          p_inventory_id: data.id,
          p_movement_type: 'entrada',
          p_quantity: initialQuantity,
          p_notes: 'Cadastro inicial',
          ...(stockId ? { p_stock_id: stockId } : {}),
        });
        if (rpcError) throw rpcError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
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
        const { error: rpcError } = await inventorySecurityRpc('inventory_register_manual_movement_v3', {
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

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await inventorySecurityRpc('inventory_set_archived_v3', {
        p_inventory_id: id,
        p_archived: archived,
      });
      if (error) throw error;
      return archived;
    },
    onSuccess: (archived) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['accessible-inventory-ids'] });
      toast({ title: archived ? 'Material arquivado. O histórico foi preservado.' : 'Material desarquivado.' });
    },
    onError: (error) => {
      toast({ title: 'Não foi possível alterar o material', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Statistics
  const activeItems = items.filter((item) => !item.archived_at);
  const totalItems = activeItems.length;
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
      : activeItems.filter((item) =>
          item.quantity !== null &&
          item.min_quantity !== null &&
          item.quantity < item.min_quantity,
        ).length;

  const totalValue = activeItems.reduce((acc, item) => {
    const qty = item.quantity || 0;
    const price = item.cost_price || 0;
    return acc + (qty * price);
  }, 0);
  const totalSaleValue = activeItems.reduce((acc, item) => {
    const qty = item.quantity || 0;
    const price = item.sale_price || item.cost_price || 0;
    return acc + (qty * price);
  }, 0);

  return {
    items,
    stockLevels,
    stockLevelsLoaded,
    isLoading,
    error,
    createItem,
    updateItem,
    setArchived,
    getQuantityForStock,
    getMinQuantityForStock,
    getPresenceForStock,
    updateStockLevelMinQuantity,
    setInventoryPresence,
    addGroupToStock,
    setStockMaterials,
    registerInlineMovement,
    stats: {
      totalItems,
      lowStockItems,
      totalValue,
      totalSaleValue,
    },
  };
}
