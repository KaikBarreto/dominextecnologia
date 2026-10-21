import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ModuleCode } from '@/hooks/useCompanyModules';
import {
  BASE_SUBSCRIPTION_MODULE_CODE,
  FREE_BASE_MODULE_CODES,
  WHATSAPP_MODULE_CODE,
  resolveExtraUserPrice,
  resolveProposalWhatsappPrice,
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
  sortOrder: number;
}

export interface PublicSubscriptionCatalog {
  plans: PublicSubscriptionPlan[];
  modules: PublicSubscriptionModule[];
  allModules: PublicSubscriptionModule[];
  extraUserPrice: number;
  whatsappPaidTier: number;
}

export function usePublicSubscriptionCatalog() {
  return useQuery({
    queryKey: ['public-subscription-catalog'],
    queryFn: async () => {
      const [plansResult, modulesResult, whatsappTiersResult] = await Promise.all([
        supabase
          .from('subscription_plans')
          .select('id, code, name, description, price, max_users, included_modules')
          .eq('is_active', true)
          .gt('price', 0)
          .order('price'),
        supabase
          .from('subscription_modules')
          .select('id, code, name, description, price, type, sort_order')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('whatsapp_tiers')
          .select('tier, price')
          .gt('price', 0)
          .order('tier'),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (modulesResult.error) throw modulesResult.error;
      if (whatsappTiersResult.error) throw whatsappTiersResult.error;

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
      const proposalWhatsappTier = resolveProposalWhatsappPrice(whatsappTiersResult.data ?? []);
      const allModules = (modulesResult.data ?? []).map((module) => {
        const catalogPrice = module.price === null ? Number.NaN : Number(module.price);
        return {
          id: module.id,
          code: module.code,
          name: module.name,
          description: module.description ?? null,
          price: module.code === WHATSAPP_MODULE_CODE
            ? (proposalWhatsappTier?.price ?? Number.NaN)
            : catalogPrice,
          type: module.type ?? 'module',
          sortOrder: Number(module.sort_order) || 0,
        };
      }) as PublicSubscriptionModule[];
      const pricesAreValid = allModules.every(
        (module) => Number.isFinite(module.price) && module.price >= 0,
      );
      const basePrice = allModules.find(
        (module) => module.code === BASE_SUBSCRIPTION_MODULE_CODE,
      )?.price;
      const freeBaseModulesAreValid = FREE_BASE_MODULE_CODES.every(
        (code) => allModules.find((module) => module.code === code)?.price === 0,
      );
      const extraUserPrice = resolveExtraUserPrice(allModules);
      if (
        !pricesAreValid
        || typeof basePrice !== 'number'
        || !Number.isFinite(basePrice)
        || basePrice <= 0
        || !freeBaseModulesAreValid
        || extraUserPrice === null
        || proposalWhatsappTier === null
      ) {
        throw new Error('O catálogo comercial não está configurado corretamente.');
      }

      return {
        plans,
        modules: allModules.filter((module) => module.code !== 'extra_user'),
        allModules,
        extraUserPrice,
        whatsappPaidTier: proposalWhatsappTier!.tier,
      } satisfies PublicSubscriptionCatalog;
    },
    staleTime: 30 * 60 * 1000,
  });
}
