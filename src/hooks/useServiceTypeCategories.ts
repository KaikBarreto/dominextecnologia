import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type ServiceTypeCategory = Tables<'service_type_categories'>;
export type ServiceTypeCategoryInsert = TablesInsert<'service_type_categories'>;
export type ServiceTypeCategoryUpdate = TablesUpdate<'service_type_categories'>;

export function useServiceTypeCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['service-type-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_type_categories')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as ServiceTypeCategory[];
    },
  });

  const createCategory = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), 0);
      // company_id is injected by RLS / default — must pass it explicitly per invariant.
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const companyId = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('service_type_categories')
        .insert({
          name,
          color: color ?? '#6B7280',
          sort_order: maxOrder + 1,
          company_id: companyId,
        } as ServiceTypeCategoryInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-type-categories'] });
      toast({ title: 'Categoria criada!' });
    },
    onError: (err) => {
      const msg = getErrorMessage(err);
      toast({
        variant: 'destructive',
        title: 'Erro ao criar categoria',
        description: msg.includes('unique') || msg.includes('duplicate')
          ? 'Já existe uma categoria com esse nome.'
          : msg,
      });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ServiceTypeCategoryUpdate>) => {
      const { error } = await supabase
        .from('service_type_categories')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-type-categories'] });
      toast({ title: 'Categoria atualizada!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar categoria', description: getErrorMessage(err) });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_type_categories')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-type-categories'] });
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Categoria excluída!' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir categoria', description: getErrorMessage(err) });
    },
  });

  const reorderCategories = useMutation({
    // Optimistic update: reorder cache immediately, revert on error.
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['service-type-categories'] });
      const previous = queryClient.getQueryData<ServiceTypeCategory[]>(['service-type-categories']);
      queryClient.setQueryData<ServiceTypeCategory[]>(['service-type-categories'], (old = []) => {
        const byId = new Map(old.map((c) => [c.id, c]));
        return orderedIds
          .map((id, idx) => {
            const cat = byId.get(id);
            return cat ? { ...cat, sort_order: idx + 1 } : null;
          })
          .filter(Boolean) as ServiceTypeCategory[];
      });
      return { previous };
    },
    mutationFn: async (orderedIds: string[]) => {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('service_type_categories')
          .update({ sort_order: i + 1 })
          .eq('id', orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-type-categories'] });
    },
    onError: (err, _orderedIds, context) => {
      // Revert optimistic update
      if (context?.previous) {
        queryClient.setQueryData(['service-type-categories'], context.previous);
      }
      queryClient.invalidateQueries({ queryKey: ['service-type-categories'] });
      toast({ variant: 'destructive', title: 'Erro ao reordenar categorias', description: getErrorMessage(err) });
    },
  });

  return {
    categories,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  };
}
