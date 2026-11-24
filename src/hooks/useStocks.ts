import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';

export function invalidateStockDependents(queryClient: QueryClient) {
  const roots: readonly (readonly string[])[] = [
    ['stocks'], ['inventory'], ['inventory-stock-levels'], ['accessible-inventory-ids'],
    ['stock-position'], ['inventory-movements'], ['low-stock'], ['inventory-counts'],
    ['pdv-terminal-settings-v2'], ['pdv-cash-sessions-v2', 'terminals'],
    ['pdv-direct-sale-v2'], ['pdv-preorders'], ['pdv-counter'], ['pdv-terminals'],
  ];
  for (const queryKey of roots) void queryClient.invalidateQueries({ queryKey });
}

/** Identidade do cache e permissão explícita: o fallback legado de hasPermission
 * não é suficiente para autorizar escrita de estoque. */
export function useStockManagement() {
  const { user, profile, roles, permissions, loading, profileLoading } = useAuth();
  const companyId = profile?.company_id ?? null;
  const ready = !loading && !profileLoading && !!user?.id && !!companyId;
  const manager = roles.some(role => ['admin', 'gestor', 'super_admin'].includes(role));
  const acl = [...roles, ...permissions].sort().join('|');
  return {
    companyId,
    userId: user?.id,
    scope: [companyId, user?.id, acl],
    scopeKey: `${companyId ?? ''}:${user?.id ?? ''}:${acl}`,
    ready,
    canManage: ready && (manager || permissions.includes('*') || permissions.includes('fn:manage_inventory')),
    canManageAccess: ready && manager,
  };
}

export function getStockManagementError(error: unknown): string {
  const raw = error as { message?: string; details?: string };
  const message = `${raw?.message ?? ''} ${raw?.details ?? ''}`;
  if (/stock.*(acl_empty|access.*empty)|restricted.*empty/i.test(message)) return 'Selecione pelo menos uma pessoa para restringir o acesso.';
  if (/stock_name_invalid/.test(message)) return 'Informe um nome de 2 a 80 caracteres para o local.';
  if (/stock_(management|access)_denied/.test(message)) return 'Você não tem permissão para alterar este local.';
  if (/stock_access_user_invalid/.test(message)) return 'Uma das pessoas selecionadas não está ativa nesta empresa. Atualize a lista e tente novamente.';
  if (/stock_pdv_module_required/.test(message)) return 'O módulo PDV (Loja) precisa estar ativo para criar ou alterar um local de loja.';
  if (/stock_scope_immutable/.test(message)) return 'O local deve permanecer vinculado à empresa e ao cliente de origem.';
  if (/stock.*(in_use|has_balance|referenced|protected)|saldo|vinculad|principal|último/i.test(message)) {
    return 'Este local possui saldo, histórico, vínculos ou uma configuração principal. Transfira o saldo e revise os vínculos antes de excluir; o histórico deve ser preservado.';
  }

  // Tokens internos de domínio não devem aparecer na interface.
  if (/stock_[a-z_]+/.test(message)) return 'Não foi possível alterar este local. Verifique sua permissão e os vínculos do estoque.';
  return getErrorMessage(error);
}

export type Stock = Tables<'stocks'>;
export type StockInsert = TablesInsert<'stocks'>;
export type StockUpdate = TablesUpdate<'stocks'>;

/**
 * Defesa adicional no client: estoque geral é compartilhado; estoque de cliente
 * só pode aparecer na OS daquele próprio cliente.
 */
export function filterStocksForCustomer(stocks: Stock[], customerId?: string | null): Stock[] {
  return stocks.filter((stock) => stock.customer_id == null || (!!customerId && stock.customer_id === customerId));
}

export function useStocks(customerId?: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, companyId, ready, canManage } = useStockManagement();

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['stocks', ...scope, customerId ?? 'general'],
    enabled: ready,
    queryFn: async () => {
      // Sem customerId, a fronteira padrão devolve somente os estoques gerais e
      // preserva os consumidores atuais. Na OS, inclui gerais + o estoque do
      // cliente informado. A RLS continua aplicando a ACL de usuário por local.
      let query = supabase
        .from('stocks')
        .select('*')
        .eq('company_id', companyId!)
        .order('sort_order')
        .order('name');

      query = customerId
        ? query.or(`customer_id.is.null,customer_id.eq.${customerId}`)
        : query.or('customer_id.is.null');

      const { data, error } = await query;
      if (error) throw error;
      return filterStocksForCustomer((data ?? []) as unknown as Stock[], customerId);
    },
  });
  const stocks = ready ? data : [];
  const assertManage = () => {
    if (!canManage) throw new Error('Você não tem permissão para gerenciar o estoque.');
  };
  const invalidateStocks = () => invalidateStockDependents(queryClient);

  const defaultStock = stocks.find((s) => s.is_default) ?? stocks[0] ?? null;
  const customerStock = customerId
    ? stocks.find((s) => s.customer_id === customerId) ?? null
    : null;

  const createStock = useMutation({
    mutationFn: async (input: string | { name: string; purpose: 'operacional' | 'pdv' }) => {
      assertManage();
      const name = (typeof input === 'string' ? input : input.name).trim();
      if (name.length < 2 || name.length > 80) throw new Error('Informe um nome de 2 a 80 caracteres para o local.');
      const purpose = typeof input === 'string' ? 'operacional' : input.purpose;
      const maxOrder = stocks.reduce((m, s) => Math.max(m, s.sort_order), 0);
      // company_id must be passed explicitly — NOT NULL without default, no trigger.
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const companyId = await getCurrentUserCompanyId();
      // O servidor decide o primeiro principal com a empresa inteira. A lista
      // visível pode estar reduzida por ACL e não prova que seja o primeiro.
      const { data, error } = await supabase
        .from('stocks')
        .insert({ name, purpose, sort_order: maxOrder + 1, company_id: companyId } as StockInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateStocks();
      toast({ title: 'Depósito criado com sucesso!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao criar local', description: getStockManagementError(err) });
    },
  });

  const renameStock = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      assertManage();
      if (name.trim().length < 2 || name.trim().length > 80) throw new Error('Informe um nome de 2 a 80 caracteres para o local.');
      const { error } = await supabase.from('stocks').update({ name: name.trim() } as StockUpdate).eq('id', id).eq('company_id', companyId!).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStocks();
      toast({ title: 'Depósito renomeado!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao renomear local', description: getStockManagementError(err) });
    },
  });

  const deleteStock = useMutation({
    mutationFn: async (id: string) => {
      assertManage();
      const { error } = await supabase.from('stocks').delete().eq('id', id).eq('company_id', companyId!).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStocks();
      toast({ title: 'Depósito excluído!' });
    },
    onError: (err) => {
      // Mensagem amigável para erro do trigger (depósito padrão ou com saldo)
      const msg = getStockManagementError(err);
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir',
        description: msg.includes('principal') || msg.includes('padrão')
          ? 'O depósito principal não pode ser excluído. Defina outro como principal primeiro.'
          : msg,
      });
    },
  });

  /**
   * Define a finalidade do local (`operacional` | `pdv`) — módulo PDV e Loja.
   * Coluna simples (`stocks.purpose`), sem RPC: mesmo padrão de `renameStock`.
   * Quem chama garante que só expõe isto com `hasModule('pdv')` — sem o
   * módulo, todo local nasce e permanece `'operacional'` (default da coluna).
   */
  const updateStockPurpose = useMutation({
    mutationFn: async ({ id, purpose }: { id: string; purpose: 'operacional' | 'pdv' }) => {
      assertManage();
      const { error } = await supabase.from('stocks').update({ purpose } as StockUpdate).eq('id', id).eq('company_id', companyId!).select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStocks();
      toast({ title: 'Tipo do local atualizado!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar o tipo do local', description: getStockManagementError(err) });
    },
  });

  const setDefaultStock = useMutation({
    mutationFn: async (stockId: string) => {
      assertManage();
      const { error } = await supabase.rpc('set_default_stock', { p_stock_id: stockId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStocks();
      toast({ title: 'Depósito principal atualizado!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao definir depósito principal', description: getStockManagementError(err) });
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
      assertManage();
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
    customerStock,
    isLoading: !ready || isLoading,
    error,
    refetch,
    createStock,
    renameStock,
    deleteStock,
    setDefaultStock,
    updateStockPurpose,
    transferStock,
  };
}
