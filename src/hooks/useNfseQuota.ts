import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Medidor de cota de emissão de NFS-e (Fase 3).
 *
 * Lê o estado atual de cota mensal via RPC `nfse_can_emit(p_company_id)`, que
 * devolve quantas notas já foram emitidas no mês, o limite do nível atual e o
 * próximo nível disponível (pra UI de upgrade). A RPC é a fonte da verdade —
 * o servidor é quem bloqueia a emissão (HTTP 402) quando estoura.
 *
 * staleTime curto (30s) porque o selo precisa refletir emissões recentes.
 */

export interface NfseNextTier {
  tier: number;
  name: string;
  limit: number | null;
  price: number;
}

export interface NfseQuotaState {
  allowed: boolean;
  used: number;
  /** null quando o nível é ilimitado (N4). */
  limit: number | null;
  tier: number;
  unlimited: boolean;
  nextTier: NfseNextTier | null;
}

/** Normaliza o jsonb cru da RPC pro shape consumido pela UI. */
function parseQuota(raw: unknown): NfseQuotaState {
  const q = (raw ?? {}) as Record<string, unknown>;
  const nt = q.next_tier as Record<string, unknown> | null | undefined;
  return {
    allowed: q.allowed !== false,
    used: typeof q.used === 'number' ? q.used : 0,
    limit: q.unlimited ? null : (typeof q.limit === 'number' ? q.limit : null),
    tier: typeof q.tier === 'number' ? q.tier : 1,
    unlimited: q.unlimited === true,
    nextTier: nt
      ? {
          tier: Number(nt.tier),
          name: String(nt.name ?? `Nível ${nt.tier}`),
          limit: nt.limit == null ? null : Number(nt.limit),
          price: Number(nt.price ?? 0),
        }
      : null,
  };
}

export function useNfseQuota(companyId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['nfse-quota', companyId],
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<NfseQuotaState> => {
      const { data, error } = await supabase.rpc('nfse_can_emit', {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return parseQuota(data);
    },
  });

  return {
    quota: query.data ?? null,
    used: query.data?.used ?? 0,
    limit: query.data?.limit ?? null,
    tier: query.data?.tier ?? 1,
    unlimited: query.data?.unlimited ?? false,
    nextTier: query.data?.nextTier ?? null,
    allowed: query.data?.allowed ?? true,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
