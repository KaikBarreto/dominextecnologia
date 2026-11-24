import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';
import { assertRowsAffected } from '@/lib/supabaseMutation';

export interface TaskType {
  id: string;
  name: string;
  color: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskTypeInput {
  name: string;
  color: string;
  description?: string;
  icon?: string;
  is_active?: boolean;
}

export function useTaskTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: taskTypes = [], isLoading } = useQuery({
    queryKey: ['task-types'],
    queryFn: async () => {
      // Defense-in-depth: filtra pela própria empresa no client (RLS continua a fronteira)
      const companyId = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('task_types' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data as unknown as TaskType[];
    },
  });

  const createTaskType = useMutation({
    mutationFn: async (input: TaskTypeInput) => {
      // A empresa vai explícita, pelo mesmo motivo do cadastro de serviço: a
      // trava de módulos confere o registro antes de o banco preenchê-la.
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('task_types' as any)
        .insert({ ...input, company_id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-types'] });
      toast({ title: 'Tipo de tarefa criado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(error) });
    },
  });

  const updateTaskType = useMutation({
    mutationFn: async ({ id, ...input }: TaskTypeInput & { id: string }) => {
      const { data, error } = await supabase
        .from('task_types' as any)
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-types'] });
      toast({ title: 'Tipo de tarefa atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(error) });
    },
  });

  const deleteTaskType = useMutation({
    mutationFn: async (id: string) => {
      assertRowsAffected(
        await supabase
          .from('task_types' as any)
          .delete({ count: 'exact' })
          .eq('id', id),
        'delete',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-types'] });
      toast({ title: 'Tipo de tarefa removido!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir tipo de tarefa', description: getErrorMessage(error) });
    },
  });

  return {
    taskTypes,
    isLoading,
    createTaskType,
    updateTaskType,
    deleteTaskType,
  };
}
