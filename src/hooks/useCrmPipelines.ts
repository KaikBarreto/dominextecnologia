import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CrmPipeline {
  id: string;
  company_id: string;
  name: string;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmPipelineInsert {
  name: string;
  position?: number;
}

export interface CrmPipelineUpdate {
  id: string;
  name?: string;
  position?: number;
}

/** Referência estável pro estado vazio — mesmo cuidado do NO_STAGES em
 *  useCrmStages.ts (evita array novo a cada render enquanto a query não
 *  resolve, o que faria quem usa `pipelines` em deps de useEffect entrar em loop). */
const NO_PIPELINES: CrmPipeline[] = [];

/**
 * Traduz o erro de exclusão de funil pro PT-BR explicando O QUE FAZER, sem
 * deixar vazar o SQLSTATE cru.
 *
 * NÃO usa só `getErrorMessage` porque a checagem de SQLSTATE ali (passo 1,
 * `error.code in SQLSTATE_MESSAGES`) intercepta ANTES do substring match —
 * todo erro de FK do PostgREST chega com `code: '23503'`, que já está
 * mapeado genericamente em SQLSTATE_MESSAGES. Isso faz qualquer entrada
 * específica por nome de constraint em DATABASE_ERROR_MAP (ex: a de
 * `leads_stage_id_fkey`, já existente no arquivo) nunca ser alcançada
 * quando o erro tem `code`. Achado ao implementar o D2 do multi-pipeline —
 * registrado aqui, não corrigido na função compartilhada (mexer na ordem
 * afetaria mensagem de erro de TODOS os domínios, fora do escopo deste
 * hook). Reportado ao Tech Lead.
 */
function describePipelineDeleteError(error: unknown): string {
  const raw =
    error && typeof error === 'object'
      ? [(error as { message?: string }).message, (error as { details?: string }).details]
          .filter((v): v is string => typeof v === 'string')
          .join(' | ')
          .toLowerCase()
      : String(error).toLowerCase();

  if (raw.includes('crm_stages_pipeline_id_fkey')) {
    return 'Este funil não pode ser excluído porque possui etapas vinculadas. Mova ou exclua as etapas antes.';
  }
  if (raw.includes('leads_pipeline_id_fkey')) {
    return 'Este funil não pode ser excluído porque possui oportunidades vinculadas. Mova as oportunidades para outro funil antes.';
  }
  return getErrorMessage(error);
}

/**
 * Funis do CRM (Onda D do overhaul — multi-pipeline). Espelha o formato de
 * useCrmStages.ts. O funil é o container de crm_stages; leads.pipeline_id é
 * mantido por trigger no banco a partir do stage_id (ver migration
 * 20260918100000_crm_multi_pipeline.sql) — este hook NUNCA escreve
 * pipeline_id de lead diretamente.
 */
export function useCrmPipelines() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pipelines = NO_PIPELINES, isLoading, error } = useQuery({
    queryKey: ['crm_pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .select('*')
        .order('position', { ascending: true });

      if (error) throw error;
      return data as CrmPipeline[];
    },
  });

  // Funil padrão da empresa. Fallback pro primeiro por posição quando nenhum
  // está marcado como padrão (ex: alguém excluiu o padrão por SQL direto) —
  // a tela nunca fica sem funil selecionável enquanto existir ao menos um.
  const defaultPipeline = pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;

  const createPipeline = useMutation({
    mutationFn: async (pipeline: CrmPipelineInsert) => {
      const maxPosition = pipelines.length > 0 ? Math.max(...pipelines.map((p) => p.position)) + 1 : 0;

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('crm_pipelines')
        .insert({
          name: pipeline.name,
          position: pipeline.position ?? maxPosition,
          company_id,
          is_default: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      toast({ title: 'Funil criado com sucesso!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar funil',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const updatePipeline = useMutation({
    mutationFn: async ({ id, ...updates }: CrmPipelineUpdate) => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      toast({ title: 'Funil atualizado!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar funil',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  // Tornar padrão: dois updates client-side (desmarca o atual, marca o novo).
  // O índice único parcial `idx_crm_pipelines_one_default` só permite UMA
  // linha com is_default=true por empresa — sem RPC dedicada (fora do escopo
  // do D2, exigiria migration), a troca em dois passos é o jeito seguro de
  // nunca tentar gravar duas linhas com is_default=true ao mesmo tempo.
  const setDefaultPipeline = useMutation({
    mutationFn: async (id: string) => {
      const current = pipelines.find((p) => p.is_default && p.id !== id);
      if (current) {
        const { error: clearError } = await supabase
          .from('crm_pipelines')
          .update({ is_default: false })
          .eq('id', current.id);
        if (clearError) throw clearError;
      }

      const { data, error } = await supabase
        .from('crm_pipelines')
        .update({ is_default: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      toast({ title: 'Funil padrão atualizado!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao definir funil padrão',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const reorderPipelines = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from('crm_pipelines').update({ position: index }).eq('id', id),
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao reordenar funis',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      // Guarda no client: nunca deixa a tela sem nenhum funil pra selecionar
      // (mesmo invariante que a migration de backfill protege no banco pro
      // backend). Não é a segurança de verdade — quem excluir por SQL direto
      // não passa por aqui; é só pra não abrir um estado vazio que a tela do
      // D2 não sabe desenhar.
      if (pipelines.length <= 1) {
        throw new Error('PIPELINE_LAST_ONE');
      }

      const target = pipelines.find((p) => p.id === id);
      // Excluir o funil padrão promove outro (o próximo por posição) ANTES de
      // apagar — senão a empresa fica sem nenhum is_default=true até o
      // próximo INSERT disparar o trigger ensure_default_crm_pipeline.
      if (target?.is_default) {
        const next = pipelines.find((p) => p.id !== id);
        if (next) {
          const { error: promoteError } = await supabase
            .from('crm_pipelines')
            .update({ is_default: true })
            .eq('id', next.id);
          if (promoteError) throw promoteError;
        }
      }

      const { error } = await supabase.from('crm_pipelines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      toast({ title: 'Funil removido!' });
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message === 'PIPELINE_LAST_ONE'
          ? 'Não é possível excluir o único funil da empresa. Crie outro funil antes de remover este.'
          : describePipelineDeleteError(error);
      toast({ title: 'Erro ao remover funil', description: message, variant: 'destructive' });
    },
  });

  return {
    pipelines,
    isLoading,
    error,
    defaultPipeline,
    createPipeline,
    updatePipeline,
    setDefaultPipeline,
    reorderPipelines,
    deletePipeline,
  };
}
