import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Filha de recebimento parcial — row em `financial_transactions` com:
 *   parent_transaction_id = <id da conta mãe>
 *   category = 'Recebimento parcial'
 *   transaction_type = 'entrada'
 *   is_paid = true
 *
 * A view inclui `account` (nome/tipo) pra renderizar "Recebido em: <conta>".
 */
export interface ReceivablePayment {
  id: string;
  amount: number;
  paid_date: string | null;
  payment_method: string | null;
  notes: string | null;
  account_id: string | null;
  account: { id: string; name: string; type: string } | null;
}

/**
 * Lista os recebimentos parciais de uma conta a receber.
 * Só roda quando `parentId` está definido — evita query desnecessária.
 */
export function useReceivablePayments(parentId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ['receivable-payments', parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
          id, amount, paid_date, payment_method, notes, account_id,
          account:financial_accounts(id, name, type)
        `)
        .eq('parent_transaction_id', parentId!)
        .eq('category', 'Recebimento parcial')
        .eq('transaction_type', 'entrada')
        .order('paid_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReceivablePayment[];
    },
  });

  /**
   * Estorna um recebimento parcial. Trigger no banco recalcula `amount_received`
   * e reverte `is_paid` da mãe automaticamente.
   */
  const reverseMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      // Filhas vinculadas (tarifa de máquina aplicada nesse recebimento) caem primeiro.
      await supabase
        .from('financial_transactions')
        .delete()
        .eq('parent_transaction_id', paymentId);

      const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivable-payments', parentId] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      toast({ title: 'Recebimento estornado', description: 'O valor voltou a ficar pendente nesta conta.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao estornar recebimento', description: getErrorMessage(error) });
    },
  });

  return {
    payments: paymentsQuery.data ?? [],
    isLoading: paymentsQuery.isLoading,
    error: paymentsQuery.error,
    reverse: reverseMutation,
  };
}
