import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Fronteira do Supabase para os critérios de avaliação (estrelas) da pesquisa de
 * NPS — dinâmicos por empresa, na tabela `nps_criteria`.
 *
 * Leitura: qualquer autenticado da empresa (RLS SELECT por company_id).
 * Gravação (INSERT/UPDATE/DELETE): só quem tem gestão do sistema
 * (`can_manage_system` no server). O RLS bloqueia caso contrário; aqui o erro de
 * permissão (42501) vira toast amigável.
 */

export interface NpsCriterion {
  id: string;
  company_id: string;
  label: string;
  position: number;
  active: boolean;
}

/** Média por critério no período (RPC já escopada ao tenant). */
export interface NpsCriterionAverage {
  label: string;
  media: number;
  respostas: number;
}

const SELECT_COLS = 'id, company_id, label, position, active';

/** Traduz erro de RLS/permissão em mensagem amigável; senão repassa o padrão. */
function friendlyError(error: any): Error {
  if (error?.code === '42501' || /permission|policy|row-level/i.test(error?.message || '')) {
    return new Error('Você não tem permissão para alterar os critérios de avaliação. Fale com a gestão.');
  }
  return new Error(getErrorMessage(error, 'Não foi possível salvar os critérios de avaliação.'));
}

export function useNpsCriteria() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['nps-criteria', companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async (): Promise<NpsCriterion[]> => {
      const { data, error } = await supabase
        .from('nps_criteria')
        .select(SELECT_COLS)
        .eq('company_id', companyId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as NpsCriterion[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: async ({ label, position }: { label: string; position: number }) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const { error } = await supabase
        .from('nps_criteria')
        .insert({ company_id: companyId, label: label.trim(), position, active: true });
      if (error) throw friendlyError(error);
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...values
    }: { id: string } & Partial<Pick<NpsCriterion, 'label' | 'active' | 'position'>>) => {
      const payload: Record<string, unknown> = { ...values };
      if (typeof payload.label === 'string') payload.label = (payload.label as string).trim();
      const { error } = await supabase.from('nps_criteria').update(payload).eq('id', id);
      if (error) throw friendlyError(error);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nps_criteria').delete().eq('id', id);
      if (error) throw friendlyError(error);
    },
    onSuccess: invalidate,
  });

  return {
    criteria: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isMutating:
      createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}

/**
 * Média por critério no período (gráfico "Média por Categoria" do painel).
 * Não passa company_id — a RPC já escopa ao tenant logado. Janela larga quando o
 * filtro é "Todos os tempos" (sem from/to), igual ao useNpsRanking.
 */
export function useNpsCriteriaAverages(from: Date | undefined, to: Date | undefined) {
  const p_start = from ? format(from, 'yyyy-MM-dd') : '2000-01-01';
  const p_end = to ? format(to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['nps-criteria-averages', p_start, p_end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nps_criteria_averages', { p_start, p_end });
      if (error) throw error;
      return (data ?? []) as NpsCriterionAverage[];
    },
  });
}
