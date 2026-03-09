import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type ServiceCost = Tables<'service_costs'>;
export type ServiceCostInsert = TablesInsert<'service_costs'>;
export type ServiceCostUpdate = TablesUpdate<'service_costs'>;

export interface ExtraCostLine {
  label: string;
  amount: number;
}

export function computeLaborCost(hourlyRate: number, hours: number) {
  return Math.max(0, (hourlyRate || 0) * (hours || 0));
}

export function computeExtraCostsTotal(extraCosts: ExtraCostLine[]) {
  return (extraCosts ?? []).reduce((sum, l) => sum + (l.amount || 0), 0);
}

export function useServiceCosts(serviceId?: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const companyId = profile?.company_id ?? null;

  const costQuery = useQuery({
    queryKey: ['service-costs', companyId, serviceId],
    enabled: !!companyId && !!serviceId,
    queryFn: async () => {
      if (!companyId || !serviceId) return null;
      const { data, error } = await supabase
        .from('service_costs')
        .select('*')
        .eq('company_id', companyId)
        .eq('service_id', serviceId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as ServiceCost) ?? null;
    },
  });

  const saveCost = useMutation({
    mutationFn: async (input: {
      hourly_rate: number;
      hours: number;
      extra_costs: ExtraCostLine[];
      notes?: string;
    }) => {
      if (!companyId || !serviceId) throw new Error('Serviço não selecionado.');

      const labor_cost = computeLaborCost(input.hourly_rate, input.hours);

      const payloadBase: Partial<ServiceCostInsert> = {
        company_id: companyId,
        service_id: serviceId,
        hourly_rate: input.hourly_rate,
        hours: input.hours,
        labor_cost,
        extra_costs: (input.extra_costs ?? []) as any,
        notes: input.notes ?? null,
      };

      const existing = costQuery.data;

      if (existing?.id) {
        const { data, error } = await supabase
          .from('service_costs')
          .update(payloadBase as ServiceCostUpdate)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (error) throw error;
        return data as ServiceCost;
      }

      const { data, error } = await supabase
        .from('service_costs')
        .insert(payloadBase as ServiceCostInsert)
        .select('*')
        .single();

      if (error) throw error;
      return data as ServiceCost;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-costs'] });
      toast({ title: 'Custos do serviço salvos!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar custos', description: error.message });
    },
  });

  return {
    cost: costQuery.data ?? null,
    isLoading: costQuery.isLoading,
    error: costQuery.error,
    saveCost,
  };
}
