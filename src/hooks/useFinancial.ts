import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';

export interface TransactionInput {
  transaction_type: TransactionType;
  category?: string;
  description: string;
  amount: number;
  transaction_date: string;
  due_date?: string;
  paid_date?: string;
  is_paid?: boolean;
  customer_id?: string;
  service_order_id?: string;
  contract_id?: string;
  notes?: string;
  payment_method?: string;
  receipt_url?: string;
  installment_count?: number;
  account_id?: string | null;
}

export function useFinancial() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['contract-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
  };

  const transactionsQuery = useQuery({
    queryKey: ['financial-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
          *,
          customer:customers(id, name)
        `)
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      return data as (FinancialTransaction & { customer: any })[];
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('transaction_type, amount, is_paid');
      
      if (error) throw error;
      
      const summary = {
        totalEntradas: 0,
        totalSaidas: 0,
        saldo: 0,
        aPagar: 0,
        aReceber: 0,
      };

      data?.forEach((t) => {
        if (t.transaction_type === 'entrada') {
          summary.totalEntradas += Number(t.amount);
          if (!t.is_paid) summary.aReceber += Number(t.amount);
        } else {
          summary.totalSaidas += Number(t.amount);
          if (!t.is_paid) summary.aPagar += Number(t.amount);
        }
      });

      summary.saldo = summary.totalEntradas - summary.totalSaidas;
      
      return summary;
    },
  });

  const createTransaction = useMutation({
    mutationFn: async (input: TransactionInput) => {
      const { installment_count, ...rest } = input;
      const n = installment_count && installment_count > 1 ? installment_count : 0;

      if (n > 1) {
        const groupId = crypto.randomUUID();
        const perInstallment = Math.round((rest.amount / n) * 100) / 100;
        const baseDate = new Date(rest.transaction_date + 'T12:00:00');
        const rows = [];

        for (let i = 0; i < n; i++) {
          const dueDate = new Date(baseDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          const dueDateStr = dueDate.toISOString().split('T')[0];

          const sanitized = normalizeOptionalForeignKeys(
            {
              ...rest,
              amount: i === n - 1 ? Math.round((rest.amount - perInstallment * (n - 1)) * 100) / 100 : perInstallment,
              description: `${rest.description} (${i + 1}/${n})`,
              transaction_date: dueDateStr,
              due_date: dueDateStr,
              is_paid: i === 0 ? rest.is_paid : false,
              paid_date: i === 0 && rest.is_paid ? dueDateStr : undefined,
              created_by: user?.id,
              installment_group_id: groupId,
              installment_number: i + 1,
              installment_total: n,
            },
            ['customer_id', 'service_order_id', 'contract_id']
          );
          rows.push(sanitized);
        }

        const { error } = await supabase.from('financial_transactions').insert(rows);
        if (error) throw error;
        return null;
      }

      const sanitized = normalizeOptionalForeignKeys(
        { ...rest, created_by: user?.id },
        ['customer_id', 'service_order_id', 'contract_id']
      );

      const { data, error } = await supabase
        .from('financial_transactions')
        .insert(sanitized)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Transação criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar transação', description: getErrorMessage(error) });
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...input }: TransactionInput & { id: string }) => {
      const { installment_count, ...rest } = input;
      const sanitized = normalizeOptionalForeignKeys(rest, ['customer_id', 'service_order_id', 'contract_id']);

      const { data, error } = await supabase
        .from('financial_transactions')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Transação atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description: getErrorMessage(error) });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Transação excluída com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir transação', description: getErrorMessage(error) });
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .update({ is_paid: true, paid_date: new Date().toISOString().split('T')[0] })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Transação marcada como paga!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description: getErrorMessage(error) });
    },
  });

  return {
    transactions: transactionsQuery.data ?? [],
    summary: summaryQuery.data ?? { totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 },
    isLoading: transactionsQuery.isLoading || summaryQuery.isLoading,
    error: transactionsQuery.error || summaryQuery.error,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    markAsPaid,
  };
}
