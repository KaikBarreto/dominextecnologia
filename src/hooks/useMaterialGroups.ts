import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type MaterialGroup = Tables<'material_groups'>;
export type MaterialGroupInsert = TablesInsert<'material_groups'>;
export type MaterialGroupUpdate = TablesUpdate<'material_groups'>;

export function useMaterialGroups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['material-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_groups')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as MaterialGroup[];
    },
  });

  const createGroup = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const maxOrder = groups.reduce((m, g) => Math.max(m, g.sort_order), 0);
      // company_id must be passed explicitly — NOT NULL without default, no trigger.
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const companyId = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('material_groups')
        .insert({ name, color: color ?? '#6B7280', sort_order: maxOrder + 1, company_id: companyId } as MaterialGroupInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-groups'] });
      toast({ title: 'Grupo criado!' });
    },
    onError: (err) => {
      const msg = getErrorMessage(err);
      toast({
        variant: 'destructive',
        title: 'Erro ao criar grupo',
        description: msg.includes('unique') || msg.includes('duplicate')
          ? 'Já existe um grupo com esse nome.'
          : msg,
      });
    },
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MaterialGroupUpdate>) => {
      const { error } = await supabase.from('material_groups').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-groups'] });
      toast({ title: 'Grupo atualizado!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar grupo', description: getErrorMessage(err) });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('material_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-groups'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({ title: 'Grupo excluído!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir grupo', description: getErrorMessage(err) });
    },
  });

  const reorderGroups = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, idx) => ({ id, sort_order: idx + 1 }));
      for (const upd of updates) {
        const { error } = await supabase
          .from('material_groups')
          .update({ sort_order: upd.sort_order })
          .eq('id', upd.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-groups'] });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao reordenar grupos', description: getErrorMessage(err) });
    },
  });

  return {
    groups,
    isLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
  };
}
