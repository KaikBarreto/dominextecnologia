import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { TERMS_VERSION } from '@/data/termsOfUse';

/**
 * Hook que controla o aceite dos Termos de Uso do Dominex.
 *
 * - Lê `profiles.terms_accepted_at` do usuário logado (NULL = ainda não aceitou).
 * - `acceptTerms` grava o aceite via RPC `accept_terms_of_service` (registro
 *   forte de LGPD): a RPC server-side cria a linha em `consent_records`
 *   (purpose='terms_of_use', version, ip, user_agent, company_id) E carimba
 *   `profiles.terms_accepted_at`. O `user_id` vem de `auth.uid()` no servidor.
 *
 * No Dominex o join de `profiles` é por `user_id` (= auth uid), não por `id`
 * (ver AuthContext.fetchUserData). Por isso o SELECT filtra `.eq('user_id', user.id)`.
 *
 * Toda a fronteira com o Supabase fica AQUI (regra-lei nº 4): os componentes
 * não chamam `supabase.from(...)` nem `supabase.rpc(...)` direto.
 */
export const useTermsOfService = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['terms-status', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    queryFn: async () => {
      if (!userId) return { hasAccepted: true, userName: null as string | null };

      const { data, error } = await supabase
        .from('profiles')
        .select('terms_accepted_at, full_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      return {
        hasAccepted: !!data?.terms_accepted_at,
        userName: data?.full_name ?? null,
        acceptedAt: data?.terms_accepted_at ?? null,
      };
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Usuário não autenticado');
      // RPC server-side: grava o consentimento em consent_records E carimba
      // profiles.terms_accepted_at. Se der erro, NÃO marcamos como aceito —
      // o erro propaga, o toast de erro aparece e o modal segue aberto p/ retry.
      const { error } = await supabase.rpc('accept_terms_of_service', {
        p_version: TERMS_VERSION,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms-status'] });
      toast.success('Termos aceitos com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao aceitar os termos. Tente novamente.');
    },
  });

  return {
    // Default defensivo: enquanto carrega (ou sem user) assume "aceito" pra não
    // piscar o modal obrigatório. O Wrapper só decide depois que `isLoading`
    // resolveu, então não há flash.
    hasAccepted: data?.hasAccepted ?? true,
    userName: data?.userName ?? null,
    acceptedAt: data?.acceptedAt ?? null,
    isLoading: !!userId && isLoading,
    acceptTerms: acceptMutation.mutate,
    isAccepting: acceptMutation.isPending,
  };
};
