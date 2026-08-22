import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Consumo de cota mensal de avisos WhatsApp.
 *
 * Conta os eventos do mês corrente com status 'enviado' ou 'entregue' na
 * tabela `whatsapp_events`, cruzando com `whatsapp_tiers` via
 * `companies.whatsapp_tier` para obter o limite do plano.
 *
 * Espelha o padrão de useNfseQuota — staleTime curto (30s) para refletir
 * envios recentes.
 */

export interface WhatsappQuotaState {
  used: number;
  /** null quando o nível é ilimitado. */
  limit: number | null;
  tier: number;
  unlimited: boolean;
  tierName: string;
  tierPrice: number;
}

export function useWhatsappQuota(companyId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['whatsapp-quota', companyId],
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<WhatsappQuotaState> => {
      if (!companyId) throw new Error('companyId required');

      // 1) Busca o tier atual da empresa
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('whatsapp_tier')
        .eq('id', companyId)
        .maybeSingle();
      if (companyError) throw companyError;

      const tier: number = (company as any)?.whatsapp_tier ?? 1;

      // 2) Busca os detalhes do tier
      const { data: tierData, error: tierError } = await supabase
        .from('whatsapp_tiers')
        .select('tier, name, monthly_limit, price')
        .eq('tier', tier)
        .maybeSingle();
      if (tierError) throw tierError;

      const monthlyLimit: number | null = (tierData as any)?.monthly_limit ?? null;
      const tierName: string = (tierData as any)?.name ?? `Nível ${tier}`;
      const tierPrice: number = Number((tierData as any)?.price ?? 0);

      // 3) Conta os eventos do mês corrente
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count, error: countError } = await supabase
        .from('whatsapp_events')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['enviado', 'entregue'])
        .gte('created_at', startOfMonth);
      if (countError) throw countError;

      const used = count ?? 0;

      return {
        used,
        limit: monthlyLimit,
        tier,
        unlimited: monthlyLimit === null,
        tierName,
        tierPrice,
      };
    },
  });

  return {
    quota: query.data ?? null,
    used: query.data?.used ?? 0,
    limit: query.data?.limit ?? null,
    tier: query.data?.tier ?? 1,
    unlimited: query.data?.unlimited ?? false,
    tierName: query.data?.tierName ?? '',
    tierPrice: query.data?.tierPrice ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
