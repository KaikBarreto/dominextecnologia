import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Tipo mínimo de uma transação do financeiro admin (tabela
 * `admin_financial_transactions`) — campos que a UI precisa pra editar/proteger.
 */
export interface AdminFinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  reference_type: string | null;
  asaas_transaction_id: string | null;
  [key: string]: any;
}

/**
 * Lançamento é MANUAL (editável/excluível aqui) quando não veio do Asaas
 * nem de uma referência automática (pagamento de empresa, assinatura, taxa).
 * Lançamentos automáticos são protegidos — gerenciados pela empresa / Asaas.
 */
export function isManualAdminTransaction(t: {
  reference_type?: string | null;
  asaas_transaction_id?: string | null;
}): boolean {
  return t.asaas_transaction_id == null && t.reference_type == null;
}

/** Invalida todas as queries que listam transações do financeiro admin. */
function invalidateAdminTransactions(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions'] });
  queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions-all'] });
}

interface UpdatePayload {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string | null;
  transaction_date: string;
}

/** Atualiza um lançamento manual no lugar (corrige a própria row, sem duplicar). */
export function useUpdateAdminFinancialTransaction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, type, category, amount, description, transaction_date }: UpdatePayload) => {
      const { error } = await supabase
        .from('admin_financial_transactions')
        .update({ type, category, amount, description, transaction_date })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAdminTransactions(queryClient);
      toast({ title: 'Movimentação atualizada!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: getErrorMessage(error), variant: 'destructive' });
    },
  });
}

/** Exclui um lançamento manual. */
export function useDeleteAdminFinancialTransaction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('admin_financial_transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAdminTransactions(queryClient);
      toast({ title: 'Movimentação excluída!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir', description: getErrorMessage(error), variant: 'destructive' });
    },
  });
}
