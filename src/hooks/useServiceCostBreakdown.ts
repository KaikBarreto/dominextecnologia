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

export interface ServiceCostSnapshotLine {
  id: string;
  label: string;
  quantity: number;
  unitCost: number;
  source: 'supply' | 'extra' | 'resource' | 'gift';
  sourceId?: string | null;
  resourceId?: string | null;
  stockItemId?: string | null;
  unit?: string | null;
}

export interface ServiceCostBreakdownSnapshot extends ServiceCostBreakdown {
  composition: {
    supplies: ServiceCostSnapshotLine[];
    resources: ServiceCostSnapshotLine[];
  };
}

export async function loadServiceCostBreakdown(
  companyId: string,
  serviceId: string,
): Promise<ServiceCostBreakdownSnapshot> {
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
      .select('id, item_name, quantity, purchase_price, subtotal, stock_item_id, unit')
      .eq('company_id', companyId)
      .eq('service_id', serviceId),
    supabase
      .from('service_cost_resources')
      .select('id, resource_id, override_value')
      .eq('service_id', serviceId),
    supabase
      .from('service_gifts')
      .select('id, name, quantity, unit_cost, subtotal, resource_id')
      .eq('service_id', serviceId),
    supabase
      .from('cost_resources_with_rate')
      .select('id, name, hourly_rate, category')
      .eq('company_id', companyId)
      .eq('is_active', true),
  ]);

  const firstError = [costResult, materialsResult, linksResult, giftsResult, resourcesResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const cost = costResult.data;
  const breakdown = computeServiceCostBreakdown({
    hourlyRate: Number(cost?.hourly_rate ?? 0),
    hours: Number(cost?.hours ?? 0),
    extraCosts: (cost?.extra_costs as unknown as ServiceExtraCostLine[] | null) ?? [],
    materials: materialsResult.data ?? [],
    resourceLinks: linksResult.data ?? [],
    resources: resourcesResult.data ?? [],
    gifts: giftsResult.data ?? [],
  });

  const resourcesById = new Map((resourcesResult.data ?? []).map(resource => [resource.id, resource]));
  const extraLines = ((cost?.extra_costs as unknown as Array<{ label?: string; amount?: number }> | null) ?? [])
    .map((line, index) => ({
      id: `extra-${index}`,
      label: line.label?.trim() || 'Custo extra',
      quantity: 1,
      unitCost: Math.max(0, Number(line.amount ?? 0) || 0),
      source: 'extra' as const,
    }));
  const linkedResourceLines = (linksResult.data ?? []).flatMap(link => {
    const resource = resourcesById.get(link.resource_id);
    if (!resource || resource.category === 'gift') return [];
    const calculated = link.override_value != null
      ? Number(link.override_value)
      : Number(resource.hourly_rate ?? 0) * breakdown.hours;
    return [{
      id: link.id,
      label: resource.name?.trim() || 'Recurso',
      quantity: 1,
      unitCost: Math.max(0, calculated || 0),
      source: 'resource' as const,
      sourceId: link.id,
      resourceId: link.resource_id,
    }];
  });

  return {
    ...breakdown,
    composition: {
      supplies: (materialsResult.data ?? []).map(material => {
        const quantity = Math.max(0, Number(material.quantity ?? 0) || 0);
        const subtotal = Math.max(0, Number(material.subtotal ?? 0) || 0);
        const purchasePrice = Math.max(0, Number(material.purchase_price ?? 0) || 0);
        return {
          id: material.id,
          label: material.item_name?.trim() || 'Insumo',
          quantity,
          unitCost: quantity > 0 && subtotal > 0 ? subtotal / quantity : purchasePrice,
          source: 'supply' as const,
          sourceId: material.id,
          stockItemId: material.stock_item_id,
          unit: material.unit,
        };
      }),
      resources: [
        ...extraLines,
        ...linkedResourceLines,
        ...(giftsResult.data ?? []).map(gift => ({
          id: gift.id,
          label: gift.name?.trim() || 'Brinde ou recurso',
          quantity: Math.max(0, Number(gift.quantity ?? 0) || 0),
          unitCost: Math.max(0, Number(gift.unit_cost ?? 0) || 0),
          source: 'gift' as const,
          sourceId: gift.id,
          resourceId: gift.resource_id,
        })),
      ],
    },
  };
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
