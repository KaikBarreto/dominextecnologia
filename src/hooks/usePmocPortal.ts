import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { isUuid, extractShortCode } from '@/utils/prettyLinks';

/**
 * Hooks de gerenciamento do token público do portal PMOC (Onda B — v1.9.1).
 *
 * - `useContractPublicToken(contractId)` — lê `public_pmoc_token`,
 *   `public_short_code` e `name` do contrato. Retorna
 *   `{ token, shortCode, name }` (ou `null` enquanto carrega/sem dado).
 * - `useRegeneratePmocToken()` — chama RPC `regenerate_pmoc_token(contract_id)`.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md §3.4c / §4.3
 *        docs/planos/2026-06-20-links-publicos-amigaveis-slug.md
 */

export type ContractPublicToken = {
  token: string | null;
  shortCode: string | null;
  name: string | null;
};

export function useContractPublicToken(contractId: string | null | undefined) {
  return useQuery<ContractPublicToken | null>({
    queryKey: ['contract-public-pmoc-token', contractId],
    enabled: !!contractId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!contractId) return null;
      const { data, error } = await supabase
        .from('contracts')
        .select('public_pmoc_token, public_short_code, name')
        .eq('id', contractId)
        .maybeSingle();

      if (error) {
        console.warn('[useContractPublicToken] erro ao ler token:', error.message);
        return null;
      }
      if (!data) return null;
      return {
        token: data.public_pmoc_token ?? null,
        shortCode: data.public_short_code ?? null,
        name: data.name ?? null,
      };
    },
  });
}

/**
 * Resolve o param da rota `/contratos/:id` para o id real do contrato.
 *
 * Links amigáveis (2026-06-20): o param pode ser:
 *  - UUID antigo → usado direto como id (sem query).
 *  - `slug-do-nome-<codigo>` → extrai o código curto e busca o id por
 *    `public_short_code` (query autenticada, RLS garante isolamento).
 *
 * Retorna `{ id, isResolving }`. Enquanto resolve o slug, `id` é `undefined`.
 */
export function useResolveContractId(param: string | undefined): {
  id: string | undefined;
  isResolving: boolean;
} {
  const isDirectUuid = isUuid(param);
  const shortCode = isDirectUuid ? null : extractShortCode(param);

  const { data: resolvedId, isLoading } = useQuery<string | null>({
    queryKey: ['contract-id-by-short-code', shortCode],
    enabled: !!shortCode,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!shortCode) return null;
      const { data, error } = await supabase
        .from('contracts')
        .select('id')
        .eq('public_short_code', shortCode)
        .maybeSingle();
      if (error) {
        console.warn('[useResolveContractId] erro ao resolver código:', error.message);
        return null;
      }
      return data?.id ?? null;
    },
  });

  if (isDirectUuid) return { id: param, isResolving: false };
  if (shortCode) return { id: resolvedId ?? undefined, isResolving: isLoading };
  // Param desconhecido (nem UUID nem código válido): repassa o cru pro detalhe
  // decidir (vai dar "não encontrado"), sem travar em loading.
  return { id: param, isResolving: false };
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
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível regenerar',
        description: getErrorMessage(err),
      });
    },
  });
}
