import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import type {
  DreProjectionCharge,
  DreProjectionSubscription,
} from '@/lib/dre-subscription-projections';

interface UseDreSubscriptionProjectionsOptions {
  /** Gate completo: módulo Cobranças + Competência + toggle ligado + período finito. */
  enabled: boolean;
  from?: string;
  to?: string;
}

/**
 * Leitura mínima para a projeção do DRE. RLS isola o tenant; o predicado de
 * company_id é reaplicado também no client por defesa em profundidade.
 */
export function useDreSubscriptionProjections({
  enabled,
  from,
  to,
}: UseDreSubscriptionProjectionsOptions) {
  const { companyId } = useUserCompany();

  return useQuery({
    queryKey: ['dre-subscription-projections', companyId, from ?? null, to ?? null],
    enabled: enabled && !!companyId && !!to,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<{
      subscriptions: DreProjectionSubscription[];
      charges: DreProjectionCharge[];
    }> => {
      if (!companyId || !to) return { subscriptions: [], charges: [] };

      const chargesQuery = supabase
        .from('tenant_charges')
        .select('id, subscription_id, due_date')
        .eq('company_id', companyId)
        .not('subscription_id', 'is', null)
        .lte('due_date', to);
      // Busca também ciclos anteriores ao recorte: além de deduplicar o mês
      // visível, eles reduzem corretamente o saldo de uma assinatura finita
      // (`max_payments`). Nenhum valor passado é projetado pelo motor puro.

      const [subscriptionsResult, chargesResult] = await Promise.all([
        supabase
          .from('tenant_subscriptions')
          .select(
            'id, value, cycle, next_due_date, status, description, category, cost_center_id, customer_id, source_type, source_id, max_payments',
          )
          .eq('company_id', companyId)
          .eq('status', 'active'),
        chargesQuery,
      ]);

      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (chargesResult.error) throw chargesResult.error;

      return {
        subscriptions: (subscriptionsResult.data ?? []) as DreProjectionSubscription[],
        charges: (chargesResult.data ?? []) as DreProjectionCharge[],
      };
    },
  });
}
