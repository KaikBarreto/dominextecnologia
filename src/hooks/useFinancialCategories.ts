import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import {
  planCategoryRename,
  resolveSystemCategoryName,
  sanitizeCategoryUpdate,
  SYSTEM_CATEGORY_ROLES,
  type CategoryRenamePlan,
  type SystemCategoryRole,
} from '@/lib/finance-system-categories';

export interface FinancialCategory {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string | null;
  is_active: boolean;
  dre_group: string | null;
  is_system: boolean;
  company_id: string | null;
  sort_order?: number | null;
  /**
   * Categoria PAI, na mesma empresa. `null` = categoria raiz — é o que toda
   * categoria existente é, e continua sendo.
   *
   * A hierarquia tem no máximo DOIS níveis, travado no banco pelo gatilho
   * `trg_financial_categories_valida_parent` (migration 20260919260000), que
   * também exige pai da mesma empresa e de `type` compatível.
   *
   * 🔴 A FILHA É UMA CATEGORIA COMPLETA: tem `name` próprio e ÚNICO na empresa
   * (o índice `financial_categories_company_id_name_key` continua valendo),
   * e `dre_group`, `color` e `icon` PRÓPRIOS — NÃO herda o grupo do pai. O
   * lançamento grava em `financial_transactions.category` o NOME DA FOLHA
   * escolhida (coluna `text`, não é FK), nunca o do pai. Por isso nenhum valor
   * é contado duas vezes: cada lançamento pertence a exatamente uma linha.
   */
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryInput {
  name: string;
  type: string;
  color: string;
  icon?: string;
  is_active?: boolean;
  dre_group?: string;
  /** Pai da subcategoria. Ausente/`null` cria categoria raiz (comportamento de sempre). */
  parent_id?: string | null;
}

/** Update aceita o contexto da linha pra travar campo de sistema e cascatear o rename. */
export interface CategoryUpdateInput extends CategoryInput {
  id: string;
  /** Categoria de sistema: `type` e `dre_group` são ignorados no patch. */
  is_system?: boolean;
  /** Nome ANTES da edição. Sem ele não há como cascatear o rename. */
  previous_name?: string | null;
}

/** Chave única da lista de categorias. Compartilhada por todo mundo que resolve papel. */
export const financialCategoriesQueryKey = (companyId: string | null) =>
  ['financial-categories', companyId] as const;

/** Fronteira do Supabase pra lista de categorias (RLS filtra por empresa). */
export async function fetchFinancialCategories(): Promise<FinancialCategory[]> {
  const { data, error } = await supabase
    .from('financial_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name');
  if (error) throw error;
  return (data as any[]) as FinancialCategory[];
}

/**
 * Nome ATUAL da categoria de um papel, resolvido na hora do lançamento.
 *
 * Usado dentro de `mutationFn` (não é hook): reaproveita o cache da lista pela
 * MESMA query key, e só vai ao banco se o cache estiver velho. Se a leitura
 * falhar, cai no nome de semente — o lançamento financeiro nunca quebra por
 * causa de uma consulta de categoria.
 */
export async function resolveSystemCategoryNameFresh(
  queryClient: QueryClient,
  companyId: string | null,
  role: SystemCategoryRole,
): Promise<string> {
  try {
    const categories = await queryClient.fetchQuery({
      queryKey: financialCategoriesQueryKey(companyId),
      queryFn: fetchFinancialCategories,
      staleTime: 30_000,
    });
    return resolveSystemCategoryName(categories, role);
  } catch {
    return SYSTEM_CATEGORY_ROLES[role].seedName;
  }
}

/**
 * Cascata do RENAME. `financial_transactions.category` guarda o nome COPIADO
 * (coluna `text`, não é FK), e a config de cobrança aponta pra categoria por
 * NOME — inclusive a que o lançamento automático do BANCO lê
 * (`apply_tenant_charge_payment` usa `tenant_payment_accounts.default_fee_category`).
 * Sem a cascata, renomear orfanaria o histórico e faria o automático do
 * servidor continuar escrevendo o nome antigo.
 *
 * Tudo é filtrado por `company_id` + nome antigo: nunca toca outra empresa,
 * nunca toca lançamento de outra categoria.
 */
async function cascadeCategoryRename(companyId: string, plan: CategoryRenamePlan): Promise<void> {
  const { error: txErr } = await supabase
    .from('financial_transactions')
    .update({ category: plan.to } as any)
    .eq('company_id', companyId)
    .eq('category', plan.from);
  if (txErr) throw txErr;

  const { error: feeErr } = await supabase
    .from('tenant_payment_accounts')
    .update({ default_fee_category: plan.to } as any)
    .eq('company_id', companyId)
    .eq('default_fee_category', plan.from);
  if (feeErr) throw feeErr;

  const { error: incomeErr } = await supabase
    .from('tenant_payment_accounts')
    .update({ default_income_category: plan.to } as any)
    .eq('company_id', companyId)
    .eq('default_income_category', plan.from);
  if (incomeErr) throw incomeErr;
}

export function useFinancialCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const categoriesQuery = useQuery({
    queryKey: financialCategoriesQueryKey(companyId),
    queryFn: fetchFinancialCategories,
  });

  const reorderCategories = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from('financial_categories')
          .update({ sort_order: u.sort_order } as any)
          .eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
    },
  });

  const createCategory = useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data, error } = await supabase
        .from('financial_categories')
        .insert({ ...input, company_id: companyId } as any)
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
    mutationFn: async ({ id, is_system, previous_name, ...input }: CategoryUpdateInput) => {
      // Categoria de sistema edita NOME, cor e ícone. `type` e `dre_group` são
      // a identidade do papel e a linha do DRE: saem do patch aqui também, não
      // só na tela (defesa em profundidade).
      const patch = sanitizeCategoryUpdate(input, is_system === true);

      const { data, error } = await supabase
        .from('financial_categories')
        .update(patch as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      const plan = planCategoryRename(previous_name, input.name);
      if (plan.changed && companyId) {
        try {
          await cascadeCategoryRename(companyId, plan);
        } catch (cascadeError) {
          // Desfaz o rename: melhor a edição falhar inteira do que deixar o
          // histórico apontando pra um nome que não existe mais em categoria
          // nenhuma. Assim a ação continua sendo retentável.
          await supabase
            .from('financial_categories')
            .update({ name: plan.from } as any)
            .eq('id', id);
          throw cascadeError;
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-payment-account'] });
      toast({ title: 'Categoria atualizada!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar categoria', description: getErrorMessage(error) });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      // Trava de exclusão também no hook: a tela nem oferece a ação pra
      // categoria de sistema, mas o lançamento automático depende dela existir.
      const target = (categoriesQuery.data ?? []).find((c) => c.id === id);
      if (target?.is_system) {
        throw new Error('Categoria do sistema não pode ser excluída');
      }
      const { error } = await supabase.from('financial_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      toast({ title: 'Categoria excluída!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir categoria', description: getErrorMessage(error) });
    },
  });

  return {
    categories: categoriesQuery.data ?? [],
    isLoading: categoriesQuery.isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  };
}
