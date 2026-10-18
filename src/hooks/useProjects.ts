import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type Project = Tables<'projects'>;

export type ProjectStatus = 'planejada' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada';

export interface ProjectInsert {
  name: string;
  description?: string | null;
  customer_id?: string | null;
  responsible_user_id?: string | null;
  status?: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  color?: string;
}

export interface ProjectUpdate extends Partial<ProjectInsert> {
  id: string;
}

/** Referência estável pro estado vazio — mesmo cuidado do NO_PIPELINES em
 *  useCrmPipelines.ts (evita array novo a cada render enquanto a query não
 *  resolve). */
const NO_PROJECTS: Project[] = [];

/**
 * Traduz o erro de exclusão de projeto pro PT-BR sem deixar vazar o SQLSTATE.
 *
 * O gatilho `prevent_delete_project_in_use` (migration
 * 20261017180000_projetos_onda1_tabela_e_contador.sql) já devolve a frase
 * PRONTA em PT-BR via RAISE EXCEPTION (ERRCODE 23001). Hoje esse código NÃO
 * está em SQLSTATE_MESSAGES (utils/errorMessages.ts), então getErrorMessage
 * ainda não comete o bug documentado em describePipelineDeleteError
 * (useCrmPipelines.ts) de interceptar por código ANTES do texto — mas se
 * alguém um dia mapear 23001 ali genericamente (ex: pra outro gatilho
 * futuro), este texto específico passaria a ser sombreado em silêncio. Por
 * isso checamos o texto da mensagem (que é um Postgrest/PostgrestError,
 * `instanceof Error`, então `.message` já é SÓ a frase da exceção — sem o
 * código colado atrás) ANTES de delegar pro helper compartilhado, mesmo
 * espírito do pipeline, só que casando por TEXTO da mensagem em vez de nome
 * de constraint (aqui é gatilho BEFORE DELETE, não constraint nomeada).
 */
function describeProjectDeleteError(error: unknown): string {
  const message =
    error && typeof error === 'object' ? (error as { message?: string }).message : undefined;
  if (message && message.toLowerCase().includes('não pode ser excluída')) {
    return message;
  }
  return getErrorMessage(error);
}

/**
 * Fronteira única do Supabase pra `public.projects` (Onda 1 de "Projetos",
 * gestão de obras, 2026-10-17). Espelha o formato de useCrmPipelines.ts.
 *
 * Ordena por `created_at desc`: é o critério mais simples e previsível pra
 * uma lista que ainda não tem nenhuma ordenação "de negócio" pedida no
 * briefing (nem por urgência, nem por status) — a mais recente primeiro é o
 * mesmo padrão usado noutras listas de cadastro recente da casa. Se algum
 * dia o CEO quiser "mais urgente primeiro" (status + end_date), isso entra
 * como ordenação CLIENT-SIDE na tela (ver src/pages/Projects.tsx), não aqui:
 * a query em si continua simples e testável.
 */
export function useProjects() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects = NO_PROJECTS, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Project[];
    },
  });

  const createProject = useMutation({
    mutationFn: async (input: ProjectInsert) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data: userData } = await supabase.auth.getUser();

      const payload = {
        ...input,
        company_id,
        created_by: userData.user?.id,
      };

      // `code` fica de fora do payload de propósito: TablesInsert<'projects'>
      // marca a coluna como obrigatória (NOT NULL sem default no tipo
      // gerado), mas o gatilho `trg_set_project_code` (BEFORE INSERT) a
      // preenche sozinho a partir do contador por empresa
      // (public.next_project_code) — mesma mecânica/precedente de
      // `pipeline_id` em `seedDefaultStages` (useCrmStages.ts). `as any` só
      // pra driblar esse descompasso entre o tipo gerado e o trigger; o
      // insert em si sempre chega sem `code`.
      const { data, error } = await supabase
        .from('projects')
        .insert(payload as any)
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project_progress'] });
      toast({ title: 'Projeto criado com sucesso!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar projeto',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, ...updates }: ProjectUpdate) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Projeto atualizado com sucesso!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar projeto',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project_progress'] });
      toast({ title: 'Projeto excluído com sucesso!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir projeto',
        description: describeProjectDeleteError(error),
        variant: 'destructive',
      });
    },
  });

  return {
    projects,
    isLoading,
    error,
    createProject,
    updateProject,
    deleteProject,
  };
}
