import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { recalculateBalances, type EmployeeMovement } from '@/utils/employeeCalculations';

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
        .order('created_at', { ascending: false });
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

  const deleteMovement = useMutation({
    // Recebe a lista completa de movimentos + salário para recalcular os
    // balance_after seguintes ao deletado (espelho de EcoSistema
    // EmployeeExtract.tsx:552-574). Sem isso, deletes deixavam os saldos
    // subsequentes desatualizados (o bug ficava dormente até o próximo delete).
    mutationFn: async (input: { id: string; movements?: EmployeeMovement[]; salary?: number }) => {
      const { id, movements = [], salary = 0 } = input;

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
      toast({ title: 'Movimentação excluída!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao excluir movimentação', description: getErrorMessage(e) }),
  });

  return { movements: movementsQuery.data || [], isLoading: movementsQuery.isLoading, addMovement, deleteMovement };
}
