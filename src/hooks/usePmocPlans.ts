import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';

export interface PmocPlan {
  id: string;
  customer_id: string;
  name: string;
  frequency_months: number;
  next_generation_date: string;
  status: string;
  contract_id: string | null;
  technician_id: string | null;
  service_type_id: string | null;
  form_template_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: { id: string; name: string; document: string | null; phone: string | null } | null;
  pmoc_items?: PmocItem[];
  pmoc_generated_os?: PmocGeneratedOs[];
}

export interface PmocItem {
  id: string;
  plan_id: string;
  equipment_id: string;
  created_at: string;
  equipment?: { id: string; name: string; brand: string | null; model: string | null; status: string } | null;
}

export interface PmocGeneratedOs {
  id: string;
  plan_id: string;
  service_order_id: string;
  generated_at: string;
  scheduled_for: string;
  service_orders?: { id: string; order_number: number; status: string; scheduled_date: string | null } | null;
}

export interface PmocPlanInput {
  customer_id: string;
  name: string;
  frequency_months: number;
  next_generation_date: string;
  status?: string;
  contract_id?: string | null;
  technician_id?: string | null;
  service_type_id?: string | null;
  form_template_id?: string | null;
  notes?: string | null;
  equipment_ids?: string[];
}

export function usePmocPlans() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['pmoc-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pmoc_plans')
        .select(`
          *,
          customers (id, name, document, phone),
          pmoc_items (id, plan_id, equipment_id, created_at, equipment:equipment(id, name, brand, model, status)),
          pmoc_generated_os (id, plan_id, service_order_id, generated_at, scheduled_for, service_orders:service_orders(id, order_number, status, scheduled_date))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as PmocPlan[];
    },
  });

  const createPlan = useMutation({
    mutationFn: async ({ equipment_ids, ...input }: PmocPlanInput) => {
      const sanitized = normalizeOptionalForeignKeys(
        { ...input, created_by: user?.id } as any,
        ['contract_id', 'technician_id', 'service_type_id', 'form_template_id']
      );

      const { data: plan, error } = await supabase
        .from('pmoc_plans')
        .insert(sanitized as any)
        .select()
        .single();

      if (error) throw error;

      if (equipment_ids && equipment_ids.length > 0) {
        const items = equipment_ids.map(eid => ({ plan_id: (plan as any).id, equipment_id: eid }));
        const { error: itemError } = await supabase.from('pmoc_items').insert(items as any);
        if (itemError) throw itemError;
      }

      return plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-plans'] });
      toast({ title: 'Plano PMOC criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar plano', description: getErrorMessage(error) });
    },
  });

  const updatePlan = useMutation({
    mutationFn: async ({ id, equipment_ids, ...input }: PmocPlanInput & { id: string }) => {
      const sanitized = normalizeOptionalForeignKeys(input as any, [
        'contract_id',
        'technician_id',
        'service_type_id',
        'form_template_id',
      ]);

      const { error } = await supabase
        .from('pmoc_plans')
        .update(sanitized as any)
        .eq('id', id);

      if (error) throw error;

      if (equipment_ids !== undefined) {
        await supabase.from('pmoc_items').delete().eq('plan_id', id);
        if (equipment_ids.length > 0) {
          const items = equipment_ids.map(eid => ({ plan_id: id, equipment_id: eid }));
          const { error: itemError } = await supabase.from('pmoc_items').insert(items as any);
          if (itemError) throw itemError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-plans'] });
      toast({ title: 'Plano atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar plano', description: error.message });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pmoc_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-plans'] });
      toast({ title: 'Plano removido com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao remover plano', description: error.message });
    },
  });

  const activePlans = plans.filter(p => p.status === 'ativo');

  return {
    plans,
    isLoading,
    createPlan,
    updatePlan,
    deletePlan,
    stats: {
      total: plans.length,
      active: activePlans.length,
      paused: plans.length - activePlans.length,
    },
  };
}
