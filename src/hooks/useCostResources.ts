import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';
import { getErrorMessage } from '@/utils/errorMessages';

export type CostResourceCategory = 'vehicle' | 'tool' | 'gift' | 'epi' | 'other';

export interface CostResourceItem {
  id: string;
  resource_id: string;
  name: string;
  value: number;
  is_monthly: boolean;
  annual_value: number | null;
  sort_order: number;
}

export interface CostResource {
  id: string;
  company_id: string;
  category: CostResourceCategory;
  name: string;
  is_active: boolean;
  monthly_hours: number;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  total_monthly_cost?: number;
  hourly_rate?: number;
}

export interface CostResourceWithItems extends CostResource {
  items: CostResourceItem[];
}

const CATEGORY_LABELS: Record<CostResourceCategory, string> = {
  vehicle: 'Veículos',
  tool: 'Ferramentas',
  gift: 'Brindes',
  epi: 'EPIs',
  other: 'Outros',
};

const CATEGORY_ICONS: Record<CostResourceCategory, string> = {
  vehicle: 'Car',
  tool: 'Wrench',
  gift: 'Gift',
  epi: 'HardHat',
  other: 'Package',
};

export function useCostResources() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  // Fetch all resources with calculated rates
  const resourcesQuery = useQuery({
    queryKey: ['cost-resources', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_resources_with_rate')
        .select('*')
        .eq('company_id', companyId!)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as CostResource[];
    },
  });

  // Group by category
  const byCategory = useMemo(() => {
    const resources = resourcesQuery.data ?? [];
    return {
      vehicle: resources.filter(r => r.category === 'vehicle'),
      tool: resources.filter(r => r.category === 'tool'),
      gift: resources.filter(r => r.category === 'gift'),
      epi: resources.filter(r => r.category === 'epi'),
      other: resources.filter(r => r.category === 'other'),
    };
  }, [resourcesQuery.data]);

  // KPIs
  const kpis = useMemo(() => {
    return {
      vehicleHourlyCost: byCategory.vehicle
        .filter(r => r.is_active)
        .reduce((sum, r) => sum + (r.hourly_rate ?? 0), 0),
      toolHourlyCost: byCategory.tool
        .filter(r => r.is_active)
        .reduce((sum, r) => sum + (r.hourly_rate ?? 0), 0),
      epiHourlyCost: byCategory.epi
        .filter(r => r.is_active)
        .reduce((sum, r) => sum + (r.hourly_rate ?? 0), 0),
      giftCostPerUnit: byCategory.gift
        .filter(r => r.is_active)
        .reduce((sum, r) => sum + (r.total_monthly_cost ?? 0), 0),
    };
  }, [byCategory]);

  // Create resource
  const createResource = useMutation({
    mutationFn: async (input: {
      category: CostResourceCategory;
      name: string;
      monthly_hours?: number;
      is_active?: boolean;
      notes?: string;
      photo_url?: string | null;
      items?: Array<{ name: string; value: number; is_monthly: boolean; annual_value?: number }>;
    }) => {
      if (!companyId) throw new Error('Empresa não encontrada');

      const { data: resource, error: resourceError } = await supabase
        .from('cost_resources')
        .insert({
          company_id: companyId,
          category: input.category,
          name: input.name,
          monthly_hours: input.monthly_hours ?? 176,
          is_active: input.is_active ?? true,
          notes: input.notes ?? null,
          photo_url: input.photo_url ?? null,
        } as any)
        .select()
        .single();

      if (resourceError) throw resourceError;

      if (input.items && input.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('cost_resource_items')
          .insert(
            input.items.map((item: any, idx: number) => ({
              resource_id: resource.id,
              name: item.name,
              value: item.value,
              is_monthly: item.is_monthly,
              annual_value: item.annual_value ?? null,
              total_cost: item.total_cost ?? null,
              total_units: item.total_units ?? null,
              qty_per_gift: item.qty_per_gift ?? null,
              sort_order: idx,
            }))
          );

        if (itemsError) throw itemsError;
      }

      return resource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-resources'] });
      toast({ title: 'Recurso criado com sucesso!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao criar recurso', description: error.message });
    },
  });

  // Update resource
  const updateResource = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      monthly_hours?: number;
      is_active?: boolean;
      notes?: string;
      photo_url?: string | null;
      items?: Array<{ id?: string; name: string; value: number; is_monthly: boolean; annual_value?: number }>;
    }) => {
      const { id, items, ...updates } = input;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('cost_resources')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
      }

      if (items !== undefined) {
        // Delete existing items
        await supabase
          .from('cost_resource_items')
          .delete()
          .eq('resource_id', id);

        // Insert new items
        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from('cost_resource_items')
            .insert(
              items.map((item: any, idx: number) => ({
                resource_id: id,
                name: item.name,
                value: item.value,
                is_monthly: item.is_monthly,
                annual_value: item.annual_value ?? null,
                total_cost: item.total_cost ?? null,
                total_units: item.total_units ?? null,
                qty_per_gift: item.qty_per_gift ?? null,
                sort_order: idx,
              }))
            );

          if (itemsError) throw itemsError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-resources'] });
      queryClient.invalidateQueries({ queryKey: ['cost-resource-items'] });
      toast({ title: 'Recurso atualizado!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message });
    },
  });

  // Delete resource
  const deleteResource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cost_resources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-resources'] });
      toast({ title: 'Recurso excluído!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message });
    },
  });

  return {
    resources: resourcesQuery.data ?? [],
    byCategory,
    kpis,
    isLoading: resourcesQuery.isLoading,
    createResource,
    updateResource,
    deleteResource,
    categoryLabels: CATEGORY_LABELS,
    categoryIcons: CATEGORY_ICONS,
  };
}

// Hook for fetching items of a specific resource
export function useCostResourceItems(resourceId: string | null) {
  return useQuery({
    queryKey: ['cost-resource-items', resourceId],
    enabled: !!resourceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_resource_items')
        .select('*')
        .eq('resource_id', resourceId!)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as CostResourceItem[];
    },
  });
}
