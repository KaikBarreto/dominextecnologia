import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';
import type { CostResource } from './useCostResources';

export interface ServiceCostResource {
  id: string;
  service_id: string;
  resource_id: string;
  override_value: number | null;
}

export interface ServiceGift {
  id: string;
  service_id: string;
  resource_id: string | null;
  name: string;
  unit_cost: number;
  quantity: number;
  subtotal: number;
}

export interface LinkedResource extends ServiceCostResource {
  resource: CostResource;
  calculatedCost: number;
}

export function useServiceCostResources(serviceId: string | null, serviceHours: number = 1) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch linked resources for this service
  const linkedQuery = useQuery({
    queryKey: ['service-cost-resources', serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cost_resources')
        .select('*')
        .eq('service_id', serviceId!);

      if (error) throw error;
      return (data ?? []) as ServiceCostResource[];
    },
  });

  // Fetch all active resources with rates
  const allResourcesQuery = useQuery({
    queryKey: ['cost-resources-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_resources_with_rate')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name');

      if (error) throw error;
      return (data ?? []) as CostResource[];
    },
  });

  // Fetch service gifts
  const giftsQuery = useQuery({
    queryKey: ['service-gifts', serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_gifts')
        .select('*')
        .eq('service_id', serviceId!);

      if (error) throw error;
      return (data ?? []) as ServiceGift[];
    },
  });

  // Calculate linked resources with costs
  const linkedResources = useMemo(() => {
    const linked = linkedQuery.data ?? [];
    const allResources = allResourcesQuery.data ?? [];

    return linked.map(link => {
      const resource = allResources.find(r => r.id === link.resource_id);
      if (!resource) return null;

      const calculatedCost = link.override_value !== null
        ? link.override_value
        : (resource.hourly_rate ?? 0) * serviceHours;

      return {
        ...link,
        resource,
        calculatedCost,
      };
    }).filter(Boolean) as LinkedResource[];
  }, [linkedQuery.data, allResourcesQuery.data, serviceHours]);

  // Calculate totals by category
  const totals = useMemo(() => {
    const byCategory = {
      vehicle: 0,
      tool: 0,
      epi: 0,
      other: 0,
    };

    linkedResources.forEach(lr => {
      if (lr.resource.category !== 'gift') {
        byCategory[lr.resource.category as keyof typeof byCategory] += lr.calculatedCost;
      }
    });

    const giftTotal = (giftsQuery.data ?? []).reduce((sum, g) => sum + (g.subtotal ?? 0), 0);

    return {
      ...byCategory,
      gift: giftTotal,
      total: Object.values(byCategory).reduce((a, b) => a + b, 0) + giftTotal,
    };
  }, [linkedResources, giftsQuery.data]);

  // Link a resource to service
  const linkResource = useMutation({
    mutationFn: async (input: { resourceId: string; overrideValue?: number }) => {
      if (!serviceId) throw new Error('Serviço não selecionado');

      const { error } = await supabase
        .from('service_cost_resources')
        .insert({
          service_id: serviceId,
          resource_id: input.resourceId,
          override_value: input.overrideValue ?? null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cost-resources', serviceId] });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao vincular recurso', description: error.message });
    },
  });

  // Unlink a resource from service
  const unlinkResource = useMutation({
    mutationFn: async (resourceId: string) => {
      if (!serviceId) throw new Error('Serviço não selecionado');

      const { error } = await supabase
        .from('service_cost_resources')
        .delete()
        .eq('service_id', serviceId)
        .eq('resource_id', resourceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cost-resources', serviceId] });
    },
  });

  // Update override value
  const updateOverride = useMutation({
    mutationFn: async (input: { resourceId: string; overrideValue: number | null }) => {
      if (!serviceId) throw new Error('Serviço não selecionado');

      const { error } = await supabase
        .from('service_cost_resources')
        .update({ override_value: input.overrideValue })
        .eq('service_id', serviceId)
        .eq('resource_id', input.resourceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cost-resources', serviceId] });
    },
  });

  // Add gift to service
  const addGift = useMutation({
    mutationFn: async (input: { resourceId?: string; name: string; unitCost: number; quantity: number }) => {
      if (!serviceId) throw new Error('Serviço não selecionado');

      const { error } = await supabase
        .from('service_gifts')
        .insert({
          service_id: serviceId,
          resource_id: input.resourceId ?? null,
          name: input.name,
          unit_cost: input.unitCost,
          quantity: input.quantity,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-gifts', serviceId] });
    },
  });

  // Remove gift from service
  const removeGift = useMutation({
    mutationFn: async (giftId: string) => {
      const { error } = await supabase
        .from('service_gifts')
        .delete()
        .eq('id', giftId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-gifts', serviceId] });
    },
  });

  // Check if a resource is linked
  const isResourceLinked = (resourceId: string) => {
    return linkedResources.some(lr => lr.resource_id === resourceId);
  };

  return {
    linkedResources,
    allResources: allResourcesQuery.data ?? [],
    gifts: giftsQuery.data ?? [],
    totals,
    isLoading: linkedQuery.isLoading || allResourcesQuery.isLoading,
    linkResource,
    unlinkResource,
    updateOverride,
    addGift,
    removeGift,
    isResourceLinked,
  };
}
