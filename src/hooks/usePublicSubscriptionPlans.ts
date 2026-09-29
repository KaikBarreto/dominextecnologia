import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ModuleCode } from '@/hooks/useCompanyModules';

export interface PublicSubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  maxUsers: number;
  includedModules: ModuleCode[];
}

export function usePublicSubscriptionPlans() {
  return useQuery({
    queryKey: ['public-subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, code, name, description, price, max_users, included_modules')
        .eq('is_active', true)
        .gt('price', 0)
        .order('price');

      if (error) throw error;

      return (data ?? []).map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description ?? null,
        price: Math.max(0, Number(plan.price) || 0),
        maxUsers: Math.max(0, Number(plan.max_users) || 0),
        includedModules: Array.isArray(plan.included_modules)
          ? (plan.included_modules as unknown[]).filter(
              (module): module is ModuleCode => typeof module === 'string',
            )
          : [],
      })) as PublicSubscriptionPlan[];
    },
    staleTime: 30 * 60 * 1000,
  });
}
