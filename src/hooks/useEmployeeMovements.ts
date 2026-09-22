import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { getRpcErrorMessage } from '@/hooks/useCreditCardBills';
import { recalculateBalances, type EmployeeMovement } from '@/utils/employeeCalculations';

export interface CreateEmployeeValeInput {
  employee_id: string;
  account_id: string;
  amount: number;
  description?: string;
  cost_center_id?: string | null;
  idempotency_key: string;
  transaction_date: string;
}

export function useEmployeeMovements(employeeId?: string) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const movementsQuery = useQuery({
    queryKey: ['employee-movements', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_movements')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('movement_order', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMovement = useMutation({
    mutationFn: async (input: {
      employee_id: string; type: string; amount: number;
      balance_after: number; description?: string;
      payment_method?: string; created_by?: string;
    }) => {
      const { data, error } = await supabase
        .from('employee_movements')
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-movements'] });
      qc.invalidateQueries({ queryKey: ['all-employee-movements'] });
      toast({ title: 'Movimentação registrada!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao registrar movimentação', description: getErrorMessage(e) }),
  });

  /**
   * Vale mexe em dois livros ao mesmo tempo: extrato do funcionário e caixa da
   * empresa. A RPC cria os dois registros na MESMA transação e usa a chave
   * gerada no cliente para retry/duplo clique nunca virarem dois débitos.
   */
  const createVale = useMutation({
    mutationFn: async (input: CreateEmployeeValeInput) => {
      const { data, error } = await supabase.rpc('create_employee_vale', {
        p_employee_id: input.employee_id,
        p_account_id: input.account_id,
        p_amount: input.amount,
        p_description: input.description ?? null,
        p_cost_center_id: input.cost_center_id ?? null,
        p_idempotency_key: input.idempotency_key,
        p_transaction_date: input.transaction_date,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-movements'] });
      qc.invalidateQueries({ queryKey: ['all-employee-movements'] });
      qc.invalidateQueries({ queryKey: ['financial-transactions'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      toast({ title: 'Vale registrado!' });
    },
    onError: (e: Error) => toast({
      variant: 'destructive',
      title: 'Erro ao registrar vale',
      description: getRpcErrorMessage(e),
    }),
  });

  const deleteMovement = useMutation({
    // Recebe a lista completa de movimentos + salário para recalcular os
    // balance_after seguintes ao deletado (espelho de EcoSistema
    // EmployeeExtract.tsx:552-574). Sem isso, deletes deixavam os saldos
    // subsequentes desatualizados (o bug ficava dormente até o próximo delete).
    mutationFn: async (input: { id: string; movements: EmployeeMovement[]; salary: number }) => {
      const { id, movements, salary } = input;
      const target = movements.find((m) => m.id === id);
      if (!target) {
        throw new Error('Movimentação não encontrada. Atualize o extrato e tente novamente.');
      }

      // Vale novo sempre sai pela RPC atômica: ela valida o vínculo financeiro,
      // apaga as duas pontas e recalcula os saldos do funcionário. Vale legado
      // sem vínculo é recusado pelo banco — nunca tentamos casar por valor/data.
      if (target?.type === 'vale') {
        const { error } = await supabase.rpc('delete_employee_vale', {
          p_movement_id: id,
        });
        if (error) throw error;
        return;
      }

      // 1. Recalcula os saldos considerando a lista SEM o movimento deletado.
      const movementsToRecalc = movements.filter((m) => m.id !== id);
      const recalculated = recalculateBalances(movementsToRecalc, salary);

      // 2. Deleta o movimento.
      const { error } = await supabase.from('employee_movements').delete().eq('id', id);
      if (error) throw error;

      // 3. Persiste os balance_after atualizados (UPDATE 1×1).
      for (const mov of recalculated) {
        const { error: updateError } = await supabase
          .from('employee_movements')
          .update({ balance_after: mov.balance_after })
          .eq('id', mov.id);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-movements'] });
      qc.invalidateQueries({ queryKey: ['all-employee-movements'] });
      qc.invalidateQueries({ queryKey: ['financial-transactions'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      toast({ title: 'Movimentação excluída!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao excluir movimentação', description: getRpcErrorMessage(e) }),
  });

  return { movements: movementsQuery.data || [], isLoading: movementsQuery.isLoading, addMovement, createVale, deleteMovement };
}
