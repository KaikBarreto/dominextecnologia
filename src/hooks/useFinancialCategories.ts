import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface FinancialCategory {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string | null;
  is_active: boolean;
  dre_group: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryInput {
  name: string;
  type: string;
  color: string;
  icon?: string;
  is_active?: boolean;
}

export function useFinancialCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: ['financial-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as FinancialCategory[];
    },
  });

  const createCategory = useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data, error } = await supabase
        .from('financial_categories')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      toast({ title: 'Categoria criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar categoria', description: getErrorMessage(error) });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...input }: CategoryInput & { id: string }) => {
      const { data, error } = await supabase
        .from('financial_categories')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      toast({ title: 'Categoria atualizada!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar categoria', description: error.message });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('financial_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      toast({ title: 'Categoria excluída!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir categoria', description: error.message });
    },
  });

  return {
    categories: categoriesQuery.data ?? [],
    isLoading: categoriesQuery.isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
