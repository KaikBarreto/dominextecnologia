import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CostCenter {
  id: string;
  company_id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCenterInput {
  name: string;
  color?: string;
  description?: string | null;
  is_active?: boolean;
}

/**
 * Erro especial lançado quando a criação/edição colide (23505) com um centro
 * de custo HOMÔNIMO já existente e INATIVO. A unique (company_id, lower(name))
 * cobre ativos e inativos de propósito — pra nunca existirem dois centros com
 * o mesmo nome estragando o histórico do DRE. Em vez de só falhar, quem chama
 * (a tela) pode oferecer "reativar esse centro em vez de criar outro" via
 * `reactivateCostCenter`. Quando o homônimo está ATIVO, não é esse o caso —
 * segue o erro normal (duplicidade real).
 */
export class CostCenterInactiveDuplicateError extends Error {
  existing: CostCenter;
  constructor(existing: CostCenter) {
    super('cost_center_inactive_duplicate');
    this.name = 'CostCenterInactiveDuplicateError';
    this.existing = existing;
  }
}

/**
 * Mensagem de erro do DELETE de centro de custo em uso.
 *
 * O gatilho no banco levanta a exclusão com `ERRCODE 23001` e mensagem já em
 * PT-BR e informativa (sugerindo desativar em vez de excluir). Repassamos o
 * texto do servidor puro — igual ao `getRpcErrorMessage` de faturas de cartão,
 * mas aqui o código não é `P0001` (o gatilho usa o SQLSTATE de propósito:
 * 23001 = "restrict violation").
 */
function getCostCenterDeleteErrorMessage(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && typeof e === 'object' && e.code === '23001' && typeof e.message === 'string' && e.message.trim()) {
    return e.message.trim();
  }
  return getErrorMessage(error);
}

export function useCostCenters() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCenters;
  const companyId = profile?.company_id ?? null;

  const costCentersQuery = useQuery({
    queryKey: ['cost-centers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_centers')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CostCenter[];
    },
  });

  const costCenters = costCentersQuery.data ?? [];
  const activeCostCenters = costCenters.filter((c) => c.is_active);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
  };

  // Busca um homônimo (case-insensitive, dentro do tenant) pra decidir se a
  // colisão de nome (23505) é com um centro ATIVO (duplicidade real) ou
  // INATIVO (candidato a reativação). `excludeId` evita a linha ser
  // encontrada como "colidindo consigo mesma" ao editar sem trocar o nome.
  const findHomonym = async (name: string, excludeId?: string): Promise<CostCenter | null> => {
    let query = supabase.from('cost_centers').select('*').ilike('name', name.trim());
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    return (data as CostCenter | null) ?? null;
  };

  const createCostCenter = useMutation({
    mutationFn: async (input: CostCenterInput) => {
      const { data, error } = await supabase
        .from('cost_centers')
        .insert({ ...input, company_id: companyId } as any)
        .select()
        .single();
      if (error) {
        if ((error as any).code === '23505') {
          const existing = await findHomonym(input.name);
          if (existing && !existing.is_active) {
            throw new CostCenterInactiveDuplicateError(existing);
          }
        }
        throw error;
      }
      return data as CostCenter;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: t.toastCreated });
    },
    onError: (error: unknown) => {
      // Colisão com inativo: quem chamou (a tela) trata oferecendo reativar,
      // sem toast de erro genérico por cima.
      if (error instanceof CostCenterInactiveDuplicateError) return;
      const code = (error as { code?: string } | null)?.code;
      const description = code === '23505' ? t.toastDuplicateDescription : getErrorMessage(error);
      toast({ variant: 'destructive', title: t.toastCreateErrorTitle, description });
    },
  });

  const updateCostCenter = useMutation({
    mutationFn: async ({ id, ...input }: CostCenterInput & { id: string }) => {
      const { data, error } = await supabase
        .from('cost_centers')
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if ((error as any).code === '23505') {
          const existing = await findHomonym(input.name, id);
          if (existing && !existing.is_active) {
            throw new CostCenterInactiveDuplicateError(existing);
          }
        }
        throw error;
      }
      return data as CostCenter;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: t.toastUpdated });
    },
    onError: (error: unknown) => {
      if (error instanceof CostCenterInactiveDuplicateError) return;
      const code = (error as { code?: string } | null)?.code;
      const description = code === '23505' ? t.toastDuplicateDescription : getErrorMessage(error);
      toast({ variant: 'destructive', title: t.toastUpdateErrorTitle, description });
    },
  });

  // Reativa um centro que existia inativo, aplicando os dados novos digitados
  // no formulário. Usado quando `createCostCenter`/`updateCostCenter` lançam
  // `CostCenterInactiveDuplicateError` e o usuário confirma "reativar".
  const reactivateCostCenter = useMutation({
    mutationFn: async ({ id, ...input }: CostCenterInput & { id: string }) => {
      const { data, error } = await supabase
        .from('cost_centers')
        .update({ ...input, is_active: true } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as CostCenter;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: t.toastReactivated });
    },
    onError: (error: unknown) => {
      toast({ variant: 'destructive', title: t.toastUpdateErrorTitle, description: getErrorMessage(error) });
    },
  });

  const deleteCostCenter = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cost_centers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: t.toastDeleted });
    },
    onError: (error: unknown) => {
      toast({ variant: 'destructive', title: t.toastDeleteErrorTitle, description: getCostCenterDeleteErrorMessage(error) });
    },
  });

  return {
    costCenters,
    activeCostCenters,
    isLoading: costCentersQuery.isLoading,
    createCostCenter,
    updateCostCenter,
    deleteCostCenter,
    reactivateCostCenter,
  };
}
