import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import type { CrmPipeline } from '@/hooks/useCrmPipelines';

/** Referência estável pro estado vazio (mesmo cuidado de NO_PIPELINES em
 *  useCrmPipelines.ts). */
const NO_PROJECT_PIPELINES: CrmPipeline[] = [];

/**
 * Template de etapas de uma FRENTE DE PROJETO (Onda 1 de "Projetos", gestão de
 * obras, 2026-10-17). Deliberadamente DIFERENTE de `DEFAULT_CRM_STAGES`
 * (useCrmStages.ts): o template comercial deixaria "Fechado (Ganho)" como
 * etapa de conclusão de uma obra — lê mal e é justamente a etapa que
 * `project_progress_summary()` conta como `is_won` pro cálculo de progresso.
 */
export const DEFAULT_PROJECT_STAGES: Array<{
  name: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
}> = [
  { name: 'A fazer', color: 'muted', is_won: false, is_lost: false },
  { name: 'Em execução', color: 'info', is_won: false, is_lost: false },
  { name: 'Concluído', color: 'success', is_won: true, is_lost: false },
  { name: 'Cancelado', color: 'destructive', is_won: false, is_lost: true },
];

export interface ProjectPipelineInsert {
  name: string;
  color?: string;
}

export interface ProjectPipelineUpdate {
  id: string;
  name?: string;
  color?: string;
}

/**
 * Funis (frentes de trabalho) de UM Projeto. Espelha `useCrmPipelines`, só que
 * com o filtro OPOSTO (`project_id = :projectId`, nunca `IS NULL`).
 *
 * ⚠️ A queryKey É `['crm_pipelines', 'project', projectId]` — namespace
 * próprio, igual ao `['crm_pipelines', 'global']` de `useCrmPipelines`. Se as
 * duas telas compartilhassem a entrada curta `['crm_pipelines']`, o quadro
 * de /crm passaria a mostrar frente de projeto (ou vice-versa) dependendo de
 * qual tela montou primeiro — bug intermitente, invisível em teste unitário.
 * As mutations seguem invalidando só o PREFIXO curto `['crm_pipelines']`
 * (match por prefixo, `exact: false` é o default do React Query), o que
 * atinge os dois namespaces de uma vez — não troque isso pra chave longa.
 *
 * Desabilitada (sem fetch) quando `projectId` é nulo/indefinido — é o que
 * permite os consumidores "escopados opcionalmente" (LeadDetailModal,
 * LeadFormDialog) chamarem este hook SEMPRE (nunca condicionalmente, pra não
 * violar Rules of Hooks) sem gastar round trip quando não há projeto.
 */
export function useProjectPipelines(projectId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pipelines = NO_PROJECT_PIPELINES, isLoading, error } = useQuery({
    queryKey: ['crm_pipelines', 'project', projectId ?? null],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .select('*')
        .eq('project_id', projectId as string)
        .order('position', { ascending: true });

      if (error) throw error;
      return data as CrmPipeline[];
    },
  });

  /**
   * Cria a frente E semeia as 4 etapas padrão NA MESMA AÇÃO, sempre com
   * `pipeline_id` explícito.
   *
   * 🔴 NUNCA reuse `seedDefaultStages` (useCrmStages.ts) sem passar o
   * `pipeline_id`: aquele hook omite a coluna de propósito pro gatilho
   * `trg_crm_stages_resolve_pipeline` resolver o FUNIL COMERCIAL PADRÃO da
   * empresa (bootstrap de empresa nova) — usado aqui, mandaria as etapas da
   * frente pro quadro de /crm.
   *
   * Uma frente sem NENHUMA etapa é uma armadilha: o mesmo gatilho jogaria um
   * card criado nela pro funil comercial padrão (pipeline_id ausente no
   * insert do lead cai no mesmo resolve). Por isso o seed é parte desta
   * mutation, nunca uma etapa opcional/posterior.
   */
  const createProjectPipeline = useMutation({
    mutationFn: async (input: ProjectPipelineInsert) => {
      if (!projectId) throw new Error('PROJECT_PIPELINE_NO_PROJECT');

      const maxPosition = pipelines.length > 0 ? Math.max(...pipelines.map((p) => p.position)) + 1 : 0;

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const { data: pipeline, error: pipelineError } = await supabase
        .from('crm_pipelines')
        .insert({
          name: input.name,
          color: input.color ?? '#2563EB',
          position: maxPosition,
          company_id,
          is_default: false,
          project_id: projectId,
          // Default do banco é `true` (funil comercial) — funil de
          // projeto/processo nunca soma R$, por isso explícito aqui.
          tracks_value: false,
        })
        .select()
        .single();

      if (pipelineError) throw pipelineError;

      const stageRows = DEFAULT_PROJECT_STAGES.map((stage, index) => ({
        ...stage,
        position: index,
        company_id,
        pipeline_id: pipeline.id,
      }));
      const { error: stagesError } = await supabase.from('crm_stages').insert(stageRows);
      if (stagesError) throw stagesError;

      return pipeline as CrmPipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['crm_stages'] });
      toast({ title: 'Frente de trabalho criada!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar frente de trabalho',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const updateProjectPipeline = useMutation({
    mutationFn: async ({ id, ...updates }: ProjectPipelineUpdate) => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmPipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      toast({ title: 'Frente de trabalho atualizada!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar frente de trabalho',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  /**
   * ⚠️ NÃO copie a guarda "não deixa excluir o último funil" de
   * `useCrmPipelines.deletePipeline`: lá, um funil é o container do quadro
   * comercial inteiro (a empresa não pode ficar sem nenhum). Aqui, um
   * Projeto pode legitimamente ficar com ZERO frentes — é só um projeto sem
   * quadro ainda, não um estado inválido.
   */
  const deleteProjectPipeline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_pipelines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipelines'] });
      toast({ title: 'Frente de trabalho removida!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover frente de trabalho',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return {
    pipelines,
    isLoading,
    error,
    createProjectPipeline,
    updateProjectPipeline,
    deleteProjectPipeline,
  };
}
