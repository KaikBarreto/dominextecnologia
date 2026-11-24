import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionPromotionDraft } from '@/lib/subscriptionPromotions';

interface PromotionRow {
  id: string;
  scope_type: 'module' | 'extra_users';
  module_code: string | null;
  quantity: number;
  standard_unit_price: number;
  promotional_unit_price: number;
  billing_cycles: number;
  consumed_cycles: number;
  status: 'active' | 'completed' | 'cancelled';
  reason: string | null;
}

export const adminCompanyPromotionsQueryKey = (companyId?: string) => [
  'admin-company-subscription-promotions',
  companyId,
];

/**
 * Fronteira de leitura das promoções comerciais de uma empresa.
 *
 * A tabela é protegida por RLS de backoffice; o hook nunca aceita outro filtro
 * além do company_id explícito da ficha aberta.
 */
export function useAdminCompanySubscriptionPromotions(companyId?: string, enabled = true) {
  return useQuery({
    queryKey: adminCompanyPromotionsQueryKey(companyId),
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<SubscriptionPromotionDraft[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_subscription_promotions')
        .select('id, scope_type, module_code, quantity, standard_unit_price, promotional_unit_price, billing_cycles, consumed_cycles, status, reason')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (error) throw error;

      return ((data ?? []) as PromotionRow[]).map((row) => ({
        id: row.id,
        scope_type: row.scope_type,
        module_code: row.module_code,
        quantity: Number(row.quantity) || 1,
        standard_unit_price: Number(row.standard_unit_price) || 0,
        promotional_unit_price: Number(row.promotional_unit_price) || 0,
        billing_cycles: Number(row.billing_cycles) || 1,
        consumed_cycles: Number(row.consumed_cycles) || 0,
        reason: row.reason ?? '',
      }));
    },
    staleTime: 30_000,
  });
}
