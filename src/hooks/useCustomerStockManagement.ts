import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/utils/errorMessages';
import { useToast } from '@/hooks/use-toast';

export interface CustomerStockItem {
  id: string;
  company_id: string;
  customer_id: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  min_quantity: number | null;
  cost_price: number | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerStockMovement {
  id: string;
  inventory_id: string;
  customer_id: string;
  service_order_id: string | null;
  movement_type: 'entrada' | 'saida' | 'ajuste' | 'consumo' | 'estorno' | 'transferencia';
  quantity: number;
  stock_before: number;
  stock_after: number;
  notes: string | null;
  created_at: string;
  material_name: string;
  material_unit: string;
}

export interface CustomerStockItemInput {
  name: string;
  sku?: string | null;
  unit: string;
  initialQuantity?: number;
  minQuantity?: number | null;
  costPrice?: number | null;
  notes?: string | null;
}

interface CustomerStockRow { id: string; name: string; customer_id: string }

/** CRUD e kardex da aba Estoque na ficha do cliente. */
export function useCustomerStockManagement(customerId?: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['customer-stock-management', customerId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!customerId,
    queryFn: async () => {
      const { data: stock, error: stockError } = await supabase
        .from('stocks')
        .select('id, name, customer_id')
        .eq('customer_id', customerId!)
        .maybeSingle();
      if (stockError) throw stockError;
      if (!stock) return { stock: null as CustomerStockRow | null, items: [] as CustomerStockItem[], movements: [] as CustomerStockMovement[] };

      const [inventoryResult, levelsResult, movementsResult] = await Promise.all([
        supabase.from('inventory')
          .select('id, company_id, customer_id, name, sku, unit, quantity, min_quantity, cost_price, notes, archived_at, created_at, updated_at')
          .eq('customer_id', customerId!)
          .order('name'),
        supabase.from('inventory_stock_levels')
          .select('inventory_id, quantity, min_quantity')
          .eq('stock_id', stock.id),
        supabase.from('inventory_movements')
          .select('id, inventory_id, customer_id, service_order_id, movement_type, quantity, stock_before, stock_after, notes, created_at')
          .eq('customer_id', customerId!)
          .order('created_at', { ascending: false }),
      ]);
      if (inventoryResult.error) throw inventoryResult.error;
      if (levelsResult.error) throw levelsResult.error;
      if (movementsResult.error) throw movementsResult.error;

      const levels = new Map((levelsResult.data ?? []).map((row) => [row.inventory_id, row]));
      const allItems = (inventoryResult.data ?? []).map((row) => {
        const level = levels.get(row.id);
        return {
          ...row,
          customer_id: row.customer_id!,
          quantity: Number(level?.quantity ?? row.quantity ?? 0),
          min_quantity: level?.min_quantity == null ? null : Number(level.min_quantity),
          cost_price: row.cost_price == null ? null : Number(row.cost_price),
          notes: row.notes ?? null,
          archived_at: row.archived_at ?? null,
        } as CustomerStockItem;
      });
      const itemMap = new Map(allItems.map((item) => [item.id, item]));
      const movements = (movementsResult.data ?? []).map((row) => {
        const item = itemMap.get(row.inventory_id);
        return {
          ...row,
          customer_id: row.customer_id!,
          service_order_id: row.service_order_id ?? null,
          quantity: Number(row.quantity),
          stock_before: Number(row.stock_before ?? 0),
          stock_after: Number(row.stock_after ?? 0),
          notes: row.notes ?? null,
          material_name: item?.name ?? 'Material arquivado',
          material_unit: item?.unit ?? 'un',
        } as CustomerStockMovement;
      });
      return {
        stock: stock as CustomerStockRow,
        items: allItems.filter((item) => !item.archived_at),
        movements,
      };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['customer-stock-inventory', customerId] });
    queryClient.invalidateQueries({ queryKey: ['customer-stock-levels', customerId] });
    queryClient.invalidateQueries({ queryKey: ['os-materials'] });
  };

  const createItem = useMutation({
    mutationFn: async (input: CustomerStockItemInput) => {
      if (!customerId) throw new Error('Cliente não identificado.');
      const { data, error } = await supabase.rpc('create_customer_stock_item', {
        p_customer_id: customerId,
        p_name: input.name.trim(),
        p_sku: input.sku?.trim() || null,
        p_unit: input.unit.trim(),
        p_initial_quantity: input.initialQuantity ?? 0,
        p_min_quantity: input.minQuantity ?? null,
        p_cost_price: input.costPrice ?? null,
        p_notes: input.notes?.trim() || null,
        p_client_request_id: crypto.randomUUID(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Material cadastrado no estoque do cliente!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao cadastrar material', description: getErrorMessage(error) }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...input }: CustomerStockItemInput & { id: string }) => {
      const { error } = await supabase.rpc('update_customer_stock_item', {
        p_inventory_id: id,
        p_name: input.name.trim(),
        p_sku: input.sku?.trim() || null,
        p_unit: input.unit.trim(),
        p_min_quantity: input.minQuantity ?? null,
        p_cost_price: input.costPrice ?? null,
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Material atualizado!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao atualizar material', description: getErrorMessage(error) }),
  });

  const archiveItem = useMutation({
    mutationFn: async (inventoryId: string) => {
      const { error } = await supabase.rpc('archive_customer_stock_item', { p_inventory_id: inventoryId });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Material removido. O histórico foi preservado.' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao remover material', description: getErrorMessage(error) }),
  });

  const registerMovement = useMutation({
    mutationFn: async ({ inventoryId, type, quantity, notes }: { inventoryId: string; type: 'entrada' | 'saida'; quantity: number; notes?: string | null }) => {
      if (!query.data?.stock) throw new Error('Estoque do cliente não encontrado.');
      const { error } = await supabase.rpc('register_inventory_movement', {
        p_inventory_id: inventoryId,
        p_movement_type: type,
        p_quantity: type === 'saida' ? -Math.abs(quantity) : Math.abs(quantity),
        p_notes: notes?.trim() || null,
        p_stock_id: query.data.stock.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Movimentação registrada!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao movimentar estoque', description: getErrorMessage(error) }),
  });

  return {
    stock: query.data?.stock ?? null,
    items: query.data?.items ?? [],
    movements: query.data?.movements ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createItem,
    updateItem,
    archiveItem,
    registerMovement,
  };
}
