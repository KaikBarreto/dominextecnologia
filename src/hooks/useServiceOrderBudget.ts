import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  toServiceOrderBudgetPayload,
  type ServiceOrderBudgetItem,
} from '@/lib/serviceOrderBudget';

export const SERVICE_ORDER_BUDGET_KEY = 'service-order-budget';
export const SERVICE_ORDER_SERVICE_TYPES_KEY = 'service-order-service-types';

export interface ServiceOrderServiceTypeSummary {
  id: string;
  name: string;
  color: string | null;
}

export async function syncServiceOrderBudget(
  serviceOrderId: string,
  items: ServiceOrderBudgetItem[],
) {
  const { data, error } = await supabase.rpc('sync_service_order_budget', {
    p_service_order_id: serviceOrderId,
    p_items: toServiceOrderBudgetPayload(items),
  });
  if (error) throw error;
  return data;
}

export async function syncServiceOrderServiceTypes(
  serviceOrderId: string,
  serviceTypeIds: string[],
) {
  const { data, error } = await supabase.rpc('sync_service_order_service_types', {
    p_service_order_id: serviceOrderId,
    p_service_type_ids: serviceTypeIds,
  });
  if (error) throw error;
  return data;
}

export function useServiceOrderBudget(serviceOrderId?: string | null) {
  return useQuery({
    queryKey: [SERVICE_ORDER_BUDGET_KEY, serviceOrderId],
    enabled: !!serviceOrderId,
    queryFn: async (): Promise<ServiceOrderBudgetItem[]> => {
      const { data, error } = await supabase
        .from('service_order_budget_items')
        .select('*')
        .eq('service_order_id', serviceOrderId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceOrderBudgetItem[];
    },
  });
}

export function useServiceOrderServiceTypes(serviceOrderId?: string | null) {
  return useQuery({
    queryKey: [SERVICE_ORDER_SERVICE_TYPES_KEY, serviceOrderId],
    enabled: !!serviceOrderId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('service_order_service_types')
        .select('service_type_id')
        .eq('service_order_id', serviceOrderId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(row => row.service_type_id);
    },
  });
}

export function useServiceOrderServiceTypeDetails(serviceOrderId?: string | null) {
  return useQuery({
    queryKey: [SERVICE_ORDER_SERVICE_TYPES_KEY, serviceOrderId, 'details'],
    enabled: !!serviceOrderId,
    queryFn: async (): Promise<ServiceOrderServiceTypeSummary[]> => {
      const { data, error } = await supabase
        .from('service_order_service_types')
        .select('position, service_type:service_types(id, name, color)')
        .eq('service_order_id', serviceOrderId!)
        .order('position', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        service_type: ServiceOrderServiceTypeSummary | ServiceOrderServiceTypeSummary[] | null;
      }>;
      return rows
        .map(row => Array.isArray(row.service_type) ? row.service_type[0] : row.service_type)
        .filter((serviceType): serviceType is ServiceOrderServiceTypeSummary => !!serviceType?.id);
    },
  });
}
