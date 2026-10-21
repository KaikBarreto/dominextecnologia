import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/utils/errorMessages';

export type DreGroupNature =
  | 'revenue'
  | 'deduction'
  | 'cost'
  | 'operating_expense'
  | 'non_operating'
  | 'excluded';

export interface DreGroup {
  id: string;
  company_id: string;
  name: string;
  nature: DreGroupNature;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Opcional: a listagem nao agrega categorias; a UI pode derivar do cache. */
  category_count?: number;
}

export interface CreateDreGroupInput {
  name: string;
  nature: DreGroupNature;
  is_active?: boolean;
}

export interface UpdateDreGroupInput {
  id: string;
  name?: string;
  nature?: DreGroupNature;
  sort_order?: number;
  is_active?: boolean;
}

export const dreGroupsQueryKey = (companyId: string | null) =>
  ['dre-groups', companyId] as const;

export function useDreGroups() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const groupsQuery = useQuery({
    queryKey: dreGroupsQueryKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dre_groups')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as DreGroup[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dre-groups'] });
    queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
  };

  const createGroup = useMutation({
    mutationFn: async (input: CreateDreGroupInput) => {
      if (!companyId) throw new Error('Empresa do usuário não identificada.');

      const name = input.name.trim();
      if (!name) throw new Error('Informe o nome do grupo DRE.');

      const maxOrder = (groupsQuery.data ?? []).reduce(
        (highest, group) => Math.max(highest, group.sort_order),
        0,
      );

      const { data, error } = await supabase
        .from('dre_groups')
        .insert({
          company_id: companyId,
          name,
          nature: input.nature,
          sort_order: maxOrder + 10,
          is_active: input.is_active ?? true,
          is_system: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DreGroup;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Grupo DRE criado!' });
    },
    onError: (error: unknown) => {
      const code = (error as { code?: string } | null)?.code;
      toast({
        variant: 'destructive',
        title: 'Erro ao criar grupo DRE',
        description: code === '23505'
          ? 'Já existe um grupo DRE com esse nome.'
          : getErrorMessage(error),
      });
    },
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, name, ...updates }: UpdateDreGroupInput) => {
      if (!companyId) throw new Error('Empresa do usuário não identificada.');

      const patch = {
        ...updates,
        ...(name === undefined ? {} : { name: name.trim() }),
      };

      if ('name' in patch && !patch.name) {
        throw new Error('Informe o nome do grupo DRE.');
      }

      const { data, error } = await supabase
        .from('dre_groups')
        .update(patch)
        .eq('id', id)
        .eq('company_id', companyId)
        .select()
        .single();

      if (error) throw error;
      return data as DreGroup;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Grupo DRE atualizado!' });
    },
    onError: (error: unknown) => {
      const code = (error as { code?: string } | null)?.code;
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar grupo DRE',
        description: code === '23505'
          ? 'Já existe um grupo DRE com esse nome.'
          : getErrorMessage(error),
      });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('Empresa do usuário não identificada.');

      const target = (groupsQuery.data ?? []).find((group) => group.id === id);
      if (target?.is_system) {
        throw new Error('Grupo DRE do sistema não pode ser excluído.');
      }

      const { error } = await supabase
        .from('dre_groups')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId)
        .select('id')
        .single();

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Grupo DRE excluído!' });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir grupo DRE',
        description: getErrorMessage(error),
      });
    },
  });

  const reorderGroups = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!companyId) throw new Error('Empresa do usuário não identificada.');
      if (new Set(orderedIds).size !== orderedIds.length) {
        throw new Error('A ordenação contém grupos repetidos.');
      }
      const knownIds = new Set((groupsQuery.data ?? []).map((group) => group.id));
      if (orderedIds.some((id) => !knownIds.has(id))) {
        throw new Error('A ordenação contém um grupo DRE inválido.');
      }

      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from('dre_groups')
          .update({ sort_order: (index + 1) * 10 })
          .eq('id', id)
          .eq('company_id', companyId);

        if (error) throw error;
      }
    },
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao reordenar grupos DRE',
        description: getErrorMessage(error),
      });
    },
  });

  const assignCategoriesToGroup = useMutation({
    mutationFn: async ({ categoryIds, groupId }: { categoryIds: string[]; groupId: string }) => {
      if (!companyId) throw new Error('Empresa do usuário não identificada.');
      const uniqueCategoryIds = [...new Set(categoryIds)];
      if (uniqueCategoryIds.length === 0) return;

      const targetGroup = (groupsQuery.data ?? []).find((group) => group.id === groupId);
      if (!targetGroup || targetGroup.company_id !== companyId) {
        throw new Error('Grupo DRE de destino inválido.');
      }

      const { data, error } = await supabase
        .from('financial_categories')
        .update({ dre_group_id: groupId })
        .eq('company_id', companyId)
        .in('id', uniqueCategoryIds)
        .select('id');

      if (error) throw error;
      if ((data ?? []).length !== uniqueCategoryIds.length) {
        throw new Error('Uma ou mais categorias não pertencem à empresa atual.');
      }
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast({
        title: variables.categoryIds.length > 1
          ? 'Categoria e subcategorias movidas!'
          : 'Categoria movida!',
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao mover categoria',
        description: getErrorMessage(error),
      });
    },
  });

  return {
    dreGroups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    error: groupsQuery.error,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    assignCategoriesToGroup,
  };
}
