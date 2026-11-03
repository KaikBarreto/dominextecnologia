import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  computeServiceCostBreakdown,
  type ServiceCostBreakdown,
  type ServiceExtraCostLine,
} from '@/lib/serviceCostBreakdown';

export const serviceCostBreakdownQueryKey = (companyId: string | null, serviceId: string | null) =>
  ['service-cost-breakdown', companyId, serviceId] as const;

export async function loadServiceCostBreakdown(
  companyId: string,
  serviceId: string,
): Promise<ServiceCostBreakdown> {
  // Todas as fontes são independentes e carregam juntas. Buscar os recursos
  // ativos da empresa em paralelo evita a antiga quinta consulta serial que só
  // começava depois de descobrir os IDs vinculados.
  const [costResult, materialsResult, linksResult, giftsResult, resourcesResult] = await Promise.all([
    supabase
      .from('service_costs')
      .select('hourly_rate, hours, extra_costs')
      .eq('company_id', companyId)
      .eq('service_id', serviceId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('service_materials')
      .select('subtotal')
      .eq('company_id', companyId)
      .eq('service_id', serviceId),
    supabase
      .from('service_cost_resources')
      .select('resource_id, override_value')
      .eq('service_id', serviceId),
    supabase
      .from('service_gifts')
      .select('subtotal')
      .eq('service_id', serviceId),
    supabase
      .from('cost_resources_with_rate')
      .select('id, hourly_rate, category')
      .eq('company_id', companyId)
      .eq('is_active', true),
  ]);

  const firstError = [costResult, materialsResult, linksResult, giftsResult, resourcesResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const cost = costResult.data;
  return computeServiceCostBreakdown({
    hourlyRate: Number(cost?.hourly_rate ?? 0),
    hours: Number(cost?.hours ?? 0),
    extraCosts: (cost?.extra_costs as unknown as ServiceExtraCostLine[] | null) ?? [],
    materials: materialsResult.data ?? [],
    resourceLinks: linksResult.data ?? [],
    resources: resourcesResult.data ?? [],
    gifts: giftsResult.data ?? [],
  });
}

const queryOptions = (companyId: string, serviceId: string) => ({
  queryKey: serviceCostBreakdownQueryKey(companyId, serviceId),
  queryFn: () => loadServiceCostBreakdown(companyId, serviceId),
  staleTime: 30_000,
});

export function fetchServiceCostBreakdown(
  queryClient: QueryClient,
  companyId: string,
  serviceId: string,
) {
  return queryClient.fetchQuery(queryOptions(companyId, serviceId));
}

export function useServiceCostBreakdown(serviceId?: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: serviceCostBreakdownQueryKey(companyId, serviceId ?? null),
    enabled: !!companyId && !!serviceId,
    queryFn: () => loadServiceCostBreakdown(companyId!, serviceId!),
    staleTime: 30_000,
  });
}
