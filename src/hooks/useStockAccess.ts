/**
 * useStockAccess — controla o acesso por local de estoque.
 *
 * Fronteira do Supabase para as RPCs get_stock_access / set_stock_access.
 * - get_stock_access(p_stock_id) -> { restricted, user_ids }
 *   user_ids são auth user ids (mesmo id de sessão), NÃO profiles.id.
 * - set_stock_access(p_stock_id, p_restricted, p_user_ids):
 *   restricted=false → local ABERTO (todos veem); restricted=true → só a lista
 *   (admin/gestor/super_admin sempre têm acesso, garantido pelo banco).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getStockManagementError, invalidateStockDependents, useStockManagement } from '@/hooks/useStocks';

export interface StockAccess {
  restricted: boolean;
  user_ids: string[];
}

interface SetAccessArgs {
  stockId: string;
  restricted: boolean;
  userIds: string[];
}

interface UseStockAccessOptions {
  successMessage?: string;
  errorMessage?: string;
}

export function useStockAccess(stockId: string | undefined, open: boolean, opts?: UseStockAccessOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, ready, canManageAccess } = useStockManagement();

  const query = useQuery<StockAccess>({
    queryKey: ['stock-access', stockId, ...scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_stock_access', { p_stock_id: stockId! });
      if (error) throw error;
      const raw = (data ?? {}) as { restricted?: boolean; user_ids?: string[] };
      return {
        restricted: !!raw.restricted,
        user_ids: Array.isArray(raw.user_ids) ? raw.user_ids : [],
      };
    },
    enabled: !!stockId && open && ready && canManageAccess,
  });

  const setAccess = useMutation({
    mutationFn: async ({ stockId, restricted, userIds }: SetAccessArgs) => {
      if (!canManageAccess) throw new Error('Você não tem permissão para gerenciar o acesso deste local.');
      if (restricted && userIds.length === 0) throw new Error('Selecione pelo menos uma pessoa para restringir o acesso.');
      const { error } = await supabase.rpc('set_stock_access', {
        p_stock_id: stockId,
        p_restricted: restricted,
        p_user_ids: userIds,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stock-access', variables.stockId] });
      invalidateStockDependents(queryClient);
      toast({ title: opts?.successMessage ?? 'Acesso atualizado' });
    },
    onError: (error) => {
      toast({
        title: opts?.errorMessage ?? 'Erro ao salvar acesso',
        description: getStockManagementError(error),
        variant: 'destructive',
      });
    },
  });

  return {
    access: ready && canManageAccess ? query.data : undefined,
    isLoading: query.isLoading,
    error: query.error,
    setAccess,
  };
}
