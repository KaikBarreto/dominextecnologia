import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

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
      const { data, error } = await supabase
        .from('task_types' as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return data as unknown as TaskType[];
    },
  });

  const createTaskType = useMutation({
    mutationFn: async (input: TaskTypeInput) => {
      const { data, error } = await supabase
        .from('task_types' as any)
        .insert(input as any)
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
      const { error } = await supabase
        .from('task_types' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
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
