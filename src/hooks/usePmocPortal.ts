import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Hooks de gerenciamento do token público do portal PMOC (Onda B — v1.9.1).
 *
 * - `useContractPublicToken(contractId)` — lê `contracts.public_pmoc_token`.
 * - `useRegeneratePmocToken()` — chama RPC `regenerate_pmoc_token(contract_id)`.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md §3.4c / §4.3
 */

export function useContractPublicToken(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['contract-public-pmoc-token', contractId],
    enabled: !!contractId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contractId) return null;
      const { data, error } = await supabase
        .from('contracts')
        .select('public_pmoc_token')
        .eq('id', contractId)
        .maybeSingle();

      if (error) {
        console.warn('[useContractPublicToken] erro ao ler token:', error.message);
        return null;
      }
      return data?.public_pmoc_token ?? null;
    },
  });
}

export function useRegeneratePmocToken() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.rpc('regenerate_pmoc_token', {
        p_contract_id: contractId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, contractId) => {
      queryClient.invalidateQueries({ queryKey: ['contract-public-pmoc-token', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      toast({
        title: 'Token regenerado',
        description: 'O QR Code antigo foi invalidado. Reimprima e cole no quadro.',
      });
    },
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível regenerar',
        description: err.message,
      });
    },
  });
}
