import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

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
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employee_movements').delete().eq('id', id);
      if (error) throw error;
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
