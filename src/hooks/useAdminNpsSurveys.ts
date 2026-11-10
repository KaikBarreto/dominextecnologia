import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type AdminNpsSurvey = {
  id: string;
  title: string;
  description: string | null;
  enjoyment_question: string;
  recommendation_question: string;
  feedback_prompt: string | null;
  trigger: 'login';
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_audience: 'all' | 'specific_companies';
  target_company_ids: string[];
  audience_snapshot: Record<string, unknown> | null;
  google_review_url: string | null;
  google_review_min_score: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminNpsSurveyInput = Omit<
  AdminNpsSurvey,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;

export type AdminNpsResponse = {
  id: string;
  survey_id: string;
  user_id: string;
  company_id: string;
  is_enjoying: boolean;
  score: number;
  feedback: string | null;
  responded_at: string;
  user_name: string;
  user_email: string | null;
  company_name: string;
};

const SURVEYS_KEY = ['admin', 'nps-surveys'] as const;
const RESPONSE_PAGE_SIZE = 1000;

function chunks<T>(items: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function adminNpsError(action: string) {
  return `Não foi possível ${action}. Tente novamente em alguns instantes.`;
}

export function useAdminNpsSurveys() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SURVEYS_KEY,
    queryFn: async (): Promise<AdminNpsSurvey[]> => {
      const { data, error } = await supabase.from('admin_nps_surveys')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminNpsSurvey[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: SURVEYS_KEY });

  const create = useMutation({
    mutationFn: async (input: AdminNpsSurveyInput) => {
      const { error } = await supabase.from('admin_nps_surveys')
        .insert({
          ...input,
          audience_snapshot: input.audience_snapshot as Json,
          created_by: user?.id ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pesquisa publicada' });
    },
    onError: () => toast({ title: 'Erro ao publicar pesquisa', description: adminNpsError('publicar a pesquisa'), variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: AdminNpsSurveyInput & { id: string }) => {
      const { error } = await supabase.from('admin_nps_surveys')
        .update({
          ...input,
          audience_snapshot: input.audience_snapshot as Json,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pesquisa atualizada' });
    },
    onError: () => toast({ title: 'Erro ao atualizar pesquisa', description: adminNpsError('atualizar a pesquisa'), variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('admin_nps_surveys')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast({ title: variables.isActive ? 'Pesquisa ativada' : 'Pesquisa pausada' });
    },
    onError: () => toast({ title: 'Erro ao alterar pesquisa', description: adminNpsError('alterar a pesquisa'), variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_nps_surveys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pesquisa excluída' });
    },
    onError: () => toast({ title: 'Erro ao excluir pesquisa', description: adminNpsError('excluir a pesquisa'), variant: 'destructive' }),
  });

  return {
    ...query,
    surveys: query.data ?? [],
    createSurvey: create.mutateAsync,
    updateSurvey: update.mutateAsync,
    toggleSurvey: toggle.mutateAsync,
    deleteSurvey: remove.mutateAsync,
    isSaving: create.isPending || update.isPending,
    isMutating: create.isPending || update.isPending || toggle.isPending || remove.isPending,
  };
}

export function useAdminNpsResponses(surveyId: string | null) {
  return useQuery({
    queryKey: [...SURVEYS_KEY, surveyId, 'responses'],
    enabled: Boolean(surveyId),
    queryFn: async (): Promise<AdminNpsResponse[]> => {
      if (!surveyId) return [];
      const rows: Omit<AdminNpsResponse, 'user_name' | 'user_email' | 'company_name'>[] = [];
      for (let offset = 0; ; offset += RESPONSE_PAGE_SIZE) {
        const { data, error } = await supabase.from('admin_nps_responses')
          .select('id, survey_id, user_id, company_id, is_enjoying, score, feedback, responded_at')
          .eq('survey_id', surveyId)
          .order('responded_at', { ascending: false })
          .range(offset, offset + RESPONSE_PAGE_SIZE - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < RESPONSE_PAGE_SIZE) break;
      }
      if (rows.length === 0) return [];

      const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
      const companyIds = Array.from(new Set(rows.map((row) => row.company_id)));
      const [profilePages, companyPages] = await Promise.all([
        Promise.all(chunks(userIds).map((ids) => supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids))),
        Promise.all(chunks(companyIds).map((ids) => supabase.from('companies').select('id, name').in('id', ids))),
      ]);
      const profileError = profilePages.find((result) => result.error)?.error;
      const companyError = companyPages.find((result) => result.error)?.error;
      if (profileError) throw profileError;
      if (companyError) throw companyError;

      const profiles = new Map(profilePages.flatMap((result) => result.data ?? []).map((profile) => [profile.user_id, profile]));
      const companies = new Map(companyPages.flatMap((result) => result.data ?? []).map((company) => [company.id, company.name]));
      return rows.map((row) => ({
        ...row,
        user_name: profiles.get(row.user_id)?.full_name || 'Usuário sem nome',
        user_email: profiles.get(row.user_id)?.email ?? null,
        company_name: companies.get(row.company_id) || 'Empresa não encontrada',
      }));
    },
  });
}
