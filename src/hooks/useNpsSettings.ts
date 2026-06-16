import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Fronteira do Supabase para a configuração de NPS (Pesquisa de Satisfação) da
 * própria empresa. own-row em `nps_settings` (1 linha por empresa, RLS por
 * company_id) — padrão maybeSingle + upsert, igual a useFiscalSettings.
 *
 * Leitura: qualquer autenticado da empresa (RLS SELECT).
 * Gravação: só quem tem gestão do sistema (`can_manage_system` no server) — o
 * RLS bloqueia INSERT/UPDATE caso contrário; aqui o erro vira toast amigável.
 */

/** Pergunta padrão da escala 0–10 quando a empresa ainda não configurou. */
export const NPS_DEFAULT_QUESTION =
  'De 0 a 10, o quão satisfeito(a) você ficou com o nosso serviço?';

export interface NpsSettings {
  question: string;
  require_stars: boolean;
  generate_on_finish: boolean;
}

const DEFAULTS: NpsSettings = {
  question: NPS_DEFAULT_QUESTION,
  require_stars: false,
  generate_on_finish: true,
};

const SELECT_COLS = 'question, require_stars, generate_on_finish';

export function useNpsSettings() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['nps-settings', companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async (): Promise<NpsSettings> => {
      const { data, error } = await supabase
        .from('nps_settings')
        .select(SELECT_COLS)
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULTS;
      return {
        question: data.question || NPS_DEFAULT_QUESTION,
        require_stars: !!data.require_stars,
        generate_on_finish: data.generate_on_finish !== false,
      };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<NpsSettings>) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const { error } = await supabase
        .from('nps_settings')
        .upsert({ company_id: companyId, ...values }, { onConflict: 'company_id' });
      if (error) {
        // RLS bloqueia gravação sem gestão do sistema — mensagem amigável.
        if (error.code === '42501' || /permission|policy|row-level/i.test(error.message || '')) {
          throw new Error('Você não tem permissão para alterar as configurações de NPS. Fale com a gestão.');
        }
        throw new Error(getErrorMessage(error, 'Não foi possível salvar as configurações de NPS.'));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    settings: query.data ?? DEFAULTS,
    isLoading: query.isLoading,
    isError: query.isError,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
