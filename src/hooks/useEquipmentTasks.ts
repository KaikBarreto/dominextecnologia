import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EquipmentTask {
  id: string;
  equipment_id: string;
  title: string;
  description?: string;
  due_date?: string;
  is_completed: boolean;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export function useEquipmentTasks(equipmentId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['equipment-tasks', equipmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_tasks')
        .select('*')
        .eq('equipment_id', equipmentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EquipmentTask[];
    },
    enabled: !!equipmentId,
  });

  const createTask = useMutation({
    mutationFn: async (input: { equipment_id: string; title: string; description?: string; due_date?: string }) => {
      const { data, error } = await supabase.from('equipment_tasks').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-tasks', equipmentId] });
      toast({ title: 'Tarefa criada!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar tarefa', description: error.message });
    },
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase.from('equipment_tasks').update({ is_completed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-tasks', equipmentId] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('equipment_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-tasks', equipmentId] });
      toast({ title: 'Tarefa excluída!' });
    },
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    createTask,
    toggleTask,
    deleteTask,
  };
}
