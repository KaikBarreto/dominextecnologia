import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, OsStatus, OsType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface ServiceOrderEquipmentItem {
  equipment_id: string;
  form_template_id?: string;
}

export interface ServiceOrderInput {
  customer_id: string;
  equipment_id?: string;
  technician_id?: string;
  os_type: OsType;
  service_type_id?: string;
  status?: OsStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  description?: string;
  notes?: string;
  form_template_id?: string;
  require_tech_signature?: boolean;
  require_client_signature?: boolean;
  equipment_items?: ServiceOrderEquipmentItem[];
}

export interface ServiceOrderUpdate extends Partial<ServiceOrderInput> {
  id: string;
  diagnosis?: string;
  solution?: string;
  parts_used?: any[];
  labor_hours?: number;
  labor_value?: number;
  parts_value?: number;
  total_value?: number;
  check_in_time?: string;
  check_in_location?: { lat: number; lng: number };
  check_out_time?: string;
  check_out_location?: { lat: number; lng: number };
  client_signature?: string;
}

export function useServiceOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const serviceOrdersQuery = useQuery({
    queryKey: ['service-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          *,
          customer:customers(id, name, phone, address, city),
          equipment:equipment(id, name, brand, model),
          form_template:form_templates(id, name),
          service_type:service_types(id, name, color, number_prefix)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as (ServiceOrder & { customer: any; equipment: any; form_template: any })[];
    },
  });

  const createServiceOrder = useMutation({
    mutationFn: async (input: ServiceOrderInput) => {
      const { equipment_items, ...rest } = input;
      const { data, error } = await supabase
        .from('service_orders')
        .insert({
          ...rest,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;

      // Insert equipment items into junction table
      if (equipment_items && equipment_items.length > 0) {
        const rows = equipment_items.map(item => ({
          service_order_id: data.id,
          equipment_id: item.equipment_id,
          form_template_id: item.form_template_id || null,
        }));
        const { error: eqError } = await supabase
          .from('service_order_equipment')
          .insert(rows);
        if (eqError) console.error('Error inserting equipment items:', eqError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Ordem de serviço criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao criar OS', 
        description: error.message 
      });
    },
  });

  const updateServiceOrder = useMutation({
    mutationFn: async ({ id, ...input }: ServiceOrderUpdate) => {
      const { data, error } = await supabase
        .from('service_orders')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'OS atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao atualizar OS', 
        description: error.message 
      });
    },
  });

  const deleteServiceOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_orders')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'OS excluída com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao excluir OS', 
        description: error.message 
      });
    },
  });

  return {
    serviceOrders: serviceOrdersQuery.data ?? [],
    isLoading: serviceOrdersQuery.isLoading,
    error: serviceOrdersQuery.error,
    createServiceOrder,
    updateServiceOrder,
    deleteServiceOrder,
  };
}
