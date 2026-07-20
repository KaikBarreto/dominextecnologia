import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type ServiceMaterial = Tables<'service_materials'>;
export type ServiceMaterialInsert = TablesInsert<'service_materials'>;
export type ServiceMaterialUpdate = TablesUpdate<'service_materials'>;

function computeSubtotal(quantity: number, purchasePrice: number) {
  return Math.max(0, (quantity || 0) * (purchasePrice || 0));
}

export function useServiceMaterials(serviceId?: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const companyId = profile?.company_id ?? null;

  const materialsQuery = useQuery({
    queryKey: ['service-materials', companyId, serviceId],
    enabled: !!companyId && !!serviceId,
    queryFn: async () => {
      if (!companyId || !serviceId) return [];
      const { data, error } = await supabase
        .from('service_materials')
        .select('*')
        .eq('company_id', companyId)
        .eq('service_id', serviceId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ServiceMaterial[];
    },
  });

  const createMaterial = useMutation({
    mutationFn: async (input: Omit<ServiceMaterialInsert, 'id' | 'company_id' | 'service_id' | 'created_at'>) => {
      if (!companyId || !serviceId) throw new Error('Serviço não selecionado.');

      const { subtotal: _subtotal, ...rest } = input as any;

      const payload: ServiceMaterialInsert = {
        ...rest,
        company_id: companyId,
        service_id: serviceId,
        subtotal: computeSubtotal(rest.quantity, rest.purchase_price),
      };

      const { data, error } = await supabase
        .from('service_materials')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data as ServiceMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-materials'] });
      toast({ title: 'Material adicionado!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao adicionar material', description: getErrorMessage(error) });
    },
  });

  const updateMaterial = useMutation({
    mutationFn: async ({ id, ...updates }: ServiceMaterialUpdate & { id: string }) => {
      const { subtotal: _subtotal, ...rest } = updates as any;

      // Recalcular subtotal quando quantity e/ou purchase_price mudarem.
      // O componente envia updates PARCIAIS (só quantity OU só purchase_price),
      // então mesclamos com o valor atual do material para não zerar o subtotal.
      const hasQuantity = rest.quantity !== undefined && rest.quantity !== null;
      const hasPrice = rest.purchase_price !== undefined && rest.purchase_price !== null;
      if (hasQuantity || hasPrice) {
        const existing = (materialsQuery.data ?? []).find((m) => m.id === id);
        const finalQuantity = hasQuantity ? rest.quantity : (existing?.quantity ?? 0);
        const finalPrice = hasPrice ? rest.purchase_price : (existing?.purchase_price ?? 0);
        rest.subtotal = computeSubtotal(finalQuantity, finalPrice);
      }

      const { data, error } = await supabase
        .from('service_materials')
        .update(rest)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ServiceMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-materials'] });
      toast({ title: 'Material atualizado!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar material', description: getErrorMessage(error) });
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-materials'] });
      toast({ title: 'Material removido!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao remover material', description: getErrorMessage(error) });
    },
  });

  const totalCost = (materialsQuery.data ?? []).reduce((sum, m) => sum + Number(m.subtotal ?? 0), 0);

  return {
    materials: materialsQuery.data ?? [],
    isLoading: materialsQuery.isLoading,
    error: materialsQuery.error,
    totalCost,
    createMaterial,
    updateMaterial,
    deleteMaterial,
  };
}
