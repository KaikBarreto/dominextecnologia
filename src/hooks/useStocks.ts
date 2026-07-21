import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type Stock = Tables<'stocks'>;
export type StockInsert = TablesInsert<'stocks'>;
export type StockUpdate = TablesUpdate<'stocks'>;

export function useStocks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stocks = [], isLoading } = useQuery({
    queryKey: ['stocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stocks')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as Stock[];
    },
  });

  const defaultStock = stocks.find((s) => s.is_default) ?? stocks[0] ?? null;

  const createStock = useMutation({
    mutationFn: async (name: string) => {
      const maxOrder = stocks.reduce((m, s) => Math.max(m, s.sort_order), 0);
      // company_id must be passed explicitly — NOT NULL without default, no trigger.
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const companyId = await getCurrentUserCompanyId();
      // Primeiro local da empresa vira principal automaticamente para que a tela
      // de estoque tenha sempre um "local ativo" resolvido ao criar materiais.
      const isFirstStock = stocks.length === 0;
      const { data, error } = await supabase
        .from('stocks')
        .insert({ name, sort_order: maxOrder + 1, company_id: companyId, is_default: isFirstStock } as StockInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast({ title: 'Depósito criado com sucesso!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao criar depósito', description: getErrorMessage(err) });
    },
  });

  const renameStock = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('stocks').update({ name } as StockUpdate).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast({ title: 'Depósito renomeado!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao renomear depósito', description: getErrorMessage(err) });
    },
  });

  const deleteStock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stocks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      toast({ title: 'Depósito excluído!' });
    },
    onError: (err) => {
      // Mensagem amigável para erro do trigger (depósito padrão ou com saldo)
      const msg = getErrorMessage(err);
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir',
        description: msg.includes('principal') || msg.includes('padrão')
          ? 'O depósito principal não pode ser excluído. Defina outro como principal primeiro.'
          : msg,
      });
    },
  });

  const setDefaultStock = useMutation({
    mutationFn: async (stockId: string) => {
      const { error } = await supabase.rpc('set_default_stock', { p_stock_id: stockId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      toast({ title: 'Depósito principal atualizado!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao definir depósito principal', description: getErrorMessage(err) });
    },
  });

  const transferStock = useMutation({
    mutationFn: async (params: {
      inventoryId: string;
      fromStockId: string;
      toStockId: string;
      quantity: number;
      notes?: string;
      clientRequestId?: string;
    }) => {
      const { data, error } = await supabase.rpc('transfer_stock_between', {
        p_inventory_id: params.inventoryId,
        p_from_stock: params.fromStockId,
        p_to_stock: params.toStockId,
        p_qty: params.quantity,
        p_notes: params.notes,
        p_client_request_id: params.clientRequestId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({ title: 'Transferência realizada com sucesso!' });
    },
    onError: (err) => {
      const msg = getErrorMessage(err);
      toast({
        variant: 'destructive',
        title: 'Erro na transferência',
        description: msg.includes('saldo') || msg.includes('insuficiente')
          ? 'Saldo insuficiente no depósito de origem.'
          : msg,
      });
    },
  });

  return {
    stocks,
    defaultStock,
    isLoading,
    createStock,
    renameStock,
    deleteStock,
    setDefaultStock,
    transferStock,
  };
}
