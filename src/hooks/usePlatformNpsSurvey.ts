import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  normalizePendingPlatformNps,
  type SubmitPlatformNpsInput,
} from '@/lib/platformNps';

const pendingKey = (userId: string | undefined) => ['platform-nps-pending', userId] as const;

/**
 * Fronteira única do NPS SaaS da Dominex.
 *
 * O cliente nunca lê/grava as tabelas diretamente: as duas RPCs derivam
 * usuário e empresa da sessão e revalidam vigência/público no servidor.
 */
export function usePlatformNpsSurvey(enabled = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = pendingKey(user?.id);

  const pendingQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_admin_nps');
      if (error) throw error;
      return normalizePendingPlatformNps(data);
    },
    enabled: enabled && !!user?.id,
    staleTime: 1000 * 60,
    retry: 1,
  });

  const submitMutation = useMutation({
    mutationFn: async (input: SubmitPlatformNpsInput) => {
      const { data, error } = await supabase.rpc('submit_admin_nps', {
        p_survey_id: input.surveyId,
        p_is_enjoying: input.isEnjoying,
        p_score: input.score,
        p_feedback: input.feedback,
      });
      if (error) throw error;
      const result = data?.[0];
      return {
        responseId: result?.response_id ?? '',
        surveyId: result?.survey_id ?? input.surveyId,
        shouldInviteGoogle: result?.should_invite_google === true,
        googleReviewUrl: result?.google_review_url ?? null,
      };
    },
  });

  /**
   * Só avança depois da gravação confirmada e, quando aplicável, depois que o
   * convite do Google foi dispensado/aberto. Assim a pesquisa nunca é marcada
   * como vista apenas por ter aparecido.
   */
  const advance = async () => {
    // Fecha imediatamente a campanha já respondida. A invalidação em seguida
    // busca a próxima pendente (se houver) sem deixar a anterior piscar.
    queryClient.setQueryData(queryKey, null);
    await queryClient.invalidateQueries({ queryKey });
  };

  return {
    survey: pendingQuery.data ?? null,
    isLoading: pendingQuery.isLoading,
    isError: pendingQuery.isError,
    refetch: pendingQuery.refetch,
    submit: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.error,
    resetSubmitError: submitMutation.reset,
    advance,
  };
}
