import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import type {BusinessCore} from '@/lib/businessCore';

export interface CorePriceItem {id?: string; code: string; name: string; price: number | null; is_active: boolean}
export interface CorePricing {business_core: BusinessCore; base_price: number | null; configured: boolean; revision: number; plans: CorePriceItem[]; addon: CorePriceItem}
export interface CorePricingInput {
  business_core: BusinessCore; revision: number; base_price: number; expected_base_price: number | null;
  plans: Array<{id: string; price: number; is_active: boolean; expected_price: number | null; expected_active: boolean}>;
  addon: {price: number; is_active: boolean; expected_price: number | null; expected_active: boolean};
}
const ROOT = ['admin-business-core-pricing'] as const;
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: {code?: string} | null}>;
function pricingError(error: {code?: string} | null) {
  if (error?.code === '42501') return new Error('Seu perfil não permite gerenciar os preços.');
  if (error?.code === '40001') return new Error('Os preços mudaram. Recarregue a tela antes de salvar.');
  if (error?.code === '22023') return new Error('Revise os valores. Itens disponíveis para venda precisam ter preço maior que zero.');
  return new Error('Não foi possível atualizar os preços. Tente novamente.');
}
export function parseCorePricing(data: unknown, core: BusinessCore): CorePricing {
  const r = data as CorePricing | null;
  const item = (v: CorePriceItem) => v && typeof v.code === 'string' && typeof v.name === 'string'
    && typeof v.is_active === 'boolean' && (v.price === null || typeof v.price === 'number' && Number.isFinite(v.price) && v.price >= 0);
  if (!r || r.business_core !== core || !Number.isSafeInteger(r.revision) || r.revision < 1
    || !(r.base_price === null || typeof r.base_price === 'number' && Number.isFinite(r.base_price) && r.base_price > 0)
    || typeof r.configured !== 'boolean'
    || r.addon?.code !== (core === 'retail' ? 'service_operations' : 'pdv')
    || !Array.isArray(r.plans) || !r.plans.every(p => item(p) && typeof p.id === 'string') || !item(r.addon)) {
    throw new Error('Não foi possível conferir os preços recebidos. Recarregue a tela.');
  }
  return r;
}
export function useAdminBusinessCorePricing(core: BusinessCore) {
  const {user, profile, hasRole} = useAuth();
  const allowed = !!user && profile?.user_id === user.id && profile?.is_active === true && hasRole('super_admin');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...ROOT, user?.id, core], enabled: allowed, refetchOnWindowFocus: false,
    queryFn: async () => {
      const {data, error} = await rpc('admin_get_business_core_pricing_v1', {p_business_core: core});
      if (error) throw pricingError(error);
      return parseCorePricing(data, core);
    },
  });
  const save = useMutation({
    mutationFn: async (input: CorePricingInput) => {
      if (!allowed || input.business_core !== core) throw pricingError({code:'42501'});
      const {data, error} = await rpc('admin_set_business_core_pricing_v1', {p_input: input});
      if (error) throw pricingError(error);
      return parseCorePricing(data, core);
    },
    onSuccess: async data => {
      client.setQueryData([...ROOT, user?.id, data.business_core], data);
      await Promise.all([
        client.invalidateQueries({queryKey:ROOT}),
        client.invalidateQueries({queryKey:['public-subscription-catalog']}),
        client.invalidateQueries({queryKey:['subscription-plans']}),
        client.invalidateQueries({queryKey:['company-modules']}),
      ]);
    },
  });
  return {...query, data: allowed ? query.data : undefined, allowed, save};
}
