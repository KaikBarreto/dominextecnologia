import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ModuleCode } from '@/hooks/useCompanyModules';
import {
  BASE_SUBSCRIPTION_MODULE_CODE,
  CUSTOMER_PORTAL_MODULE_CODE,
  resolveExtraUserPrice,
} from '@/lib/subscriptionCatalog';

export interface PublicSubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  maxUsers: number;
  includedModules: ModuleCode[];
}

export interface PublicSubscriptionModule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  type: string;
}

export interface PublicSubscriptionCatalog {
  plans: PublicSubscriptionPlan[];
  modules: PublicSubscriptionModule[];
  extraUserPrice: number;
}

export function usePublicSubscriptionCatalog() {
  return useQuery({
    queryKey: ['public-subscription-catalog'],
    queryFn: async () => {
      const [plansResult, modulesResult] = await Promise.all([
        supabase
          .from('subscription_plans')
          .select('id, code, name, description, price, max_users, included_modules')
          .eq('is_active', true)
          .gt('price', 0)
          .order('price'),
        supabase
          .from('subscription_modules')
          .select('id, code, name, description, price, type')
          .eq('is_active', true)
          .order('sort_order'),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (modulesResult.error) throw modulesResult.error;

      const plans = (plansResult.data ?? []).map((plan) => ({
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
      const allModules = (modulesResult.data ?? []).map((module) => ({
        id: module.id,
        code: module.code,
        name: module.name,
        description: module.description ?? null,
        price: module.price === null ? Number.NaN : Number(module.price),
        type: module.type ?? 'module',
      })) as PublicSubscriptionModule[];
      const pricesAreValid = allModules.every(
        (module) => Number.isFinite(module.price) && module.price >= 0,
      );
      const basePrice = allModules.find(
        (module) => module.code === BASE_SUBSCRIPTION_MODULE_CODE,
      )?.price;
      const customerPortalPrice = allModules.find(
        (module) => module.code === CUSTOMER_PORTAL_MODULE_CODE,
      )?.price;
      const extraUserPrice = resolveExtraUserPrice(allModules);
      if (
        !pricesAreValid
        || typeof basePrice !== 'number'
        || !Number.isFinite(basePrice)
        || basePrice <= 0
        || customerPortalPrice !== 0
        || extraUserPrice === null
      ) {
        throw new Error('O catálogo comercial não está configurado corretamente.');
      }

      return {
        plans,
        modules: allModules.filter((module) => module.code !== 'extra_user'),
        extraUserPrice,
      } satisfies PublicSubscriptionCatalog;
    },
    staleTime: 30 * 60 * 1000,
  });
}
