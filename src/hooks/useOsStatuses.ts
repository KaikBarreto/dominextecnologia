import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OsStatusRecord {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useOsStatuses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['os_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('os_statuses')
        .select('*')
        .order('position');
      if (error) throw error;
      return data as OsStatusRecord[];
    },
  });

  const createStatus = useMutation({
    mutationFn: async (input: { key: string; label: string; color: string }) => {
      const maxPos = (query.data ?? []).reduce((max, s) => Math.max(max, s.position), -1);
      const { data, error } = await supabase
        .from('os_statuses')
        .insert({ ...input, position: maxPos + 1 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_statuses'] });
      toast({ title: 'Status criado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; label?: string; color?: string; key?: string }) => {
      const { id, ...rest } = input;
      const { error } = await supabase.from('os_statuses').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_statuses'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    },
  });

  const deleteStatus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('os_statuses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_statuses'] });
      toast({ title: 'Status excluído!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    },
  });

  return {
    statuses: query.data ?? [],
    isLoading: query.isLoading,
    createStatus,
    updateStatus,
    deleteStatus,
  };
}
