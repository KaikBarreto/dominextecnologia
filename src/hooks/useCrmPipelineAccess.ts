import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CrmPipelineAccessRow {
  pipeline_id: string;
  user_id: string;
  created_at: string;
  created_by: string | null;
}

/** Referência estável pro estado vazio — mesmo cuidado do NO_PIPELINES em
 *  useCrmPipelines.ts (evita array novo a cada render). */
const NO_ACCESS: CrmPipelineAccessRow[] = [];

/**
 * ACL por funil do CRM (Onda D3 do overhaul, `crm_pipeline_access`). Fronteira
 * do Supabase pra `PipelineManagerDialog` — componente nunca chama
 * `supabase.from('crm_pipeline_access')` direto.
 *
 * REGRA (fonte única no banco: `public.can_access_pipeline`, ver migration
 * 20260918110000): funil SEM NENHUMA linha aqui é visível pra empresa toda
 * (default aberto). Com pelo menos uma linha, só quem está listado (+ quem tem
 * `fn:manage_crm`) enxerga. Isso vale pro funil, pras etapas dele e pras
 * oportunidades dentro dele — a RLS já garante tudo isso; este hook só lê e
 * escreve a lista.
 *
 * Busca TODAS as linhas da empresa (não filtra por pipeline_id na query) —
 * como só quem administra (`isAdminOrGestor() || fn:manage_settings`, o mesmo
 * gate de `can_manage_system`) chega a usar este hook, um único round trip
 * cobre todos os funis da empresa de uma vez. A RLS de leitura de
 * `crm_pipeline_access` já limita ao que a policy permite: admin vê tudo da
 * empresa, usuário comum só as próprias linhas (não é o caso de quem chama
 * este hook, mas fica registrado o motivo de não filtrar `pipeline_id` aqui).
 */
export function useCrmPipelineAccess() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: access = NO_ACCESS, isLoading, error } = useQuery({
    queryKey: ['crm_pipeline_access'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_pipeline_access').select('*');
      if (error) throw error;
      return data as CrmPipelineAccessRow[];
    },
  });

  const getPipelineAccessUserIds = (pipelineId: string) =>
    access.filter((a) => a.pipeline_id === pipelineId).map((a) => a.user_id);

  /**
   * Substitui a lista de acesso de UM funil pelo conjunto `userIds` recebido
   * (diff no client: só faz DELETE dos que saíram e INSERT dos que entraram).
   * Lista vazia = reabre o funil pra empresa toda (não é INSERT nenhum, e
   * remove todas as linhas existentes). Quem chama já decidiu, com o usuário,
   * se essa troca é segura — o aviso de "quem vai perder acesso" mora no
   * componente, não aqui: o hook só executa o que foi confirmado.
   */
  const setPipelineAccess = useMutation({
    mutationFn: async ({ pipelineId, userIds }: { pipelineId: string; userIds: string[] }) => {
      const current = access.filter((a) => a.pipeline_id === pipelineId).map((a) => a.user_id);
      const toRemove = current.filter((id) => !userIds.includes(id));
      const toAdd = userIds.filter((id) => !current.includes(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('crm_pipeline_access')
          .delete()
          .eq('pipeline_id', pipelineId)
          .in('user_id', toRemove);
        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from('crm_pipeline_access').insert(
          toAdd.map((user_id) => ({
            pipeline_id: pipelineId,
            user_id,
            created_by: userData.user?.id ?? null,
          })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_pipeline_access'] });
      toast({ title: 'Acesso ao funil atualizado!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar acesso ao funil',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return {
    access,
    isLoading,
    error,
    getPipelineAccessUserIds,
    setPipelineAccess,
  };
}
