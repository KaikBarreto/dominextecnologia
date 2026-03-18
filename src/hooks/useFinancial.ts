import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';

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
}

export function useFinancial() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
      const sanitized = normalizeOptionalForeignKeys(
        { ...input, created_by: user?.id },
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
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['contract-transactions'] });
      toast({ title: 'Transação criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao criar transação', 
        description: error.message 
      });
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...input }: TransactionInput & { id: string }) => {
      const sanitized = normalizeOptionalForeignKeys(input, ['customer_id', 'service_order_id', 'contract_id']);

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
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Transação atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao atualizar transação', 
        description: error.message 
      });
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
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Transação excluída com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao excluir transação', 
        description: error.message 
      });
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
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      toast({ title: 'Transação marcada como paga!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao atualizar transação', 
        description: error.message 
      });
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
