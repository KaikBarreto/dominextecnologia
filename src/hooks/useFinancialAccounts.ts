import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { fetchAllPaginated } from '@/utils/supabasePagination';

export interface FinancialAccount {
  id: string;
  company_id: string;
  name: string;
  type: string;
  bank_name?: string | null;
  initial_balance: number;
  color: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountInput {
  name: string;
  type: string;
  bank_name?: string;
  initial_balance?: number;
  color?: string;
  icon?: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface TransferInput {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: string;
  description?: string;
}

export function useFinancialAccounts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
  };

  const accountsQuery = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as FinancialAccount[];
    },
  });

  // Calculate balances based on transactions
  const balancesQuery = useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const { data: accounts, error: accErr } = await supabase
        .from('financial_accounts')
        .select('id, initial_balance');
      if (accErr) throw accErr;

      const txns = await fetchAllPaginated<{ account_id: string | null; transaction_type: string; amount: number; is_paid: boolean }>(
        () => supabase
          .from('financial_transactions')
          .select('account_id, transaction_type, amount, is_paid')
          .not('account_id', 'is', null)
      );

      const balances: Record<string, number> = {};
      for (const acc of (accounts || [])) {
        balances[acc.id] = Number(acc.initial_balance);
      }

      for (const t of (txns || [])) {
        if (!t.account_id || !t.is_paid) continue;
        const amount = Number(t.amount);
        if (t.transaction_type === 'entrada') {
          balances[t.account_id] = (balances[t.account_id] || 0) + amount;
        } else {
          balances[t.account_id] = (balances[t.account_id] || 0) - amount;
        }
      }

      return balances;
    },
  });

  const getCompanyId = async () => {
    if (!user) throw new Error('Usuário não autenticado');
    const { data } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    return data?.company_id;
  };

  const createAccount = useMutation({
    mutationFn: async (input: AccountInput) => {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error('Empresa não encontrada');
      const { data, error } = await supabase
        .from('financial_accounts')
        .insert({ ...input, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Conta criada com sucesso!' }); },
    onError: (e: Error) => { toast({ variant: 'destructive', title: 'Erro ao criar conta', description: getErrorMessage(e) }); },
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, ...input }: AccountInput & { id: string }) => {
      const { data, error } = await supabase
        .from('financial_accounts')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Conta atualizada!' }); },
    onError: (e: Error) => { toast({ variant: 'destructive', title: 'Erro ao atualizar conta', description: getErrorMessage(e) }); },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financial_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Conta excluída!' }); },
    onError: (e: Error) => { toast({ variant: 'destructive', title: 'Erro ao excluir conta', description: getErrorMessage(e) }); },
  });

  const transfer = useMutation({
    mutationFn: async (input: TransferInput) => {
      const pairId = crypto.randomUUID();
      const desc = input.description || 'Transferência entre contas';

      const rows = [
        {
          transaction_type: 'saida' as const,
          description: desc,
          amount: input.amount,
          transaction_date: input.date,
          is_paid: true,
          paid_date: input.date,
          category: 'Transferência entre contas',
          account_id: input.from_account_id,
          transfer_pair_id: pairId,
          created_by: user?.id,
        },
        {
          transaction_type: 'entrada' as const,
          description: desc,
          amount: input.amount,
          transaction_date: input.date,
          is_paid: true,
          paid_date: input.date,
          category: 'Transferência entre contas',
          account_id: input.to_account_id,
          transfer_pair_id: pairId,
          created_by: user?.id,
        },
      ];

      const { error } = await supabase.from('financial_transactions').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Transferência realizada!' }); },
    onError: (e: Error) => { toast({ variant: 'destructive', title: 'Erro na transferência', description: getErrorMessage(e) }); },
  });

  return {
    accounts: accountsQuery.data ?? [],
    balances: balancesQuery.data ?? {},
    isLoading: accountsQuery.isLoading,
    createAccount,
    updateAccount,
    deleteAccount,
    transfer,
  };
}
