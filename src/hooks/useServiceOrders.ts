import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, OsStatus, OsType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';

export interface ServiceOrderEquipmentItem {
  equipment_id: string;
  form_template_id?: string;
}

export interface ServiceOrderInput {
  customer_id: string;
  equipment_id?: string;
  technician_id?: string;
  team_id?: string;
  os_type: OsType;
  service_type_id?: string;
  status?: OsStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  duration_minutes?: number;
  description?: string;
  notes?: string;
  form_template_id?: string;
  require_tech_signature?: boolean;
  require_client_signature?: boolean;
  equipment_items?: ServiceOrderEquipmentItem[];
  assignee_user_ids?: string[];
  assignee_team_ids?: string[];
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
      // Fetch all service orders (paginated to avoid 1000 row limit)
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('service_orders')
          .select(`
            *,
            customer:customers(id, name, phone, email, document, address, address_number, complement, neighborhood, city, state, zip_code, company_name, customer_type),
            equipment:equipment(id, name, brand, model),
            form_template:form_templates(id, name),
            service_type:service_types(id, name, color, number_prefix)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        allData = allData.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Fetch all assignees in one query
      const orderIds = allData.map((o: any) => o.id);
      let allAssignees: any[] = [];
      if (orderIds.length > 0) {
        const { data: assignees } = await supabase
          .from('service_order_assignees')
          .select('service_order_id, user_id')
          .in('service_order_id', orderIds);
        allAssignees = assignees || [];
      }

      // Attach assignees to each order
      const assigneeMap = new Map<string, string[]>();
      allAssignees.forEach((a: any) => {
        const list = assigneeMap.get(a.service_order_id) || [];
        list.push(a.user_id);
        assigneeMap.set(a.service_order_id, list);
      });

      allData.forEach((order: any) => {
        order._assignee_user_ids = assigneeMap.get(order.id) || [];
      });

      return allData as unknown as (ServiceOrder & { customer: any; equipment: any; form_template: any; _assignee_user_ids?: string[] })[];
    },
  });

  const createServiceOrder = useMutation({
    mutationFn: async (input: ServiceOrderInput) => {
      const { equipment_items, assignee_user_ids, assignee_team_ids, ...rest } = input;
      const sanitized = normalizeOptionalForeignKeys(
        {
          ...rest,
          created_by: user?.id,
        },
        ['technician_id', 'team_id', 'customer_id', 'equipment_id', 'service_type_id', 'form_template_id']
      );
      const { data, error } = await supabase
        .from('service_orders')
        .insert(sanitized as any)
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

      // Insert assignees into junction table
      if (assignee_user_ids && assignee_user_ids.length > 0) {
        const rows = assignee_user_ids.map(uid => ({
          service_order_id: data.id,
          user_id: uid,
        }));
        const { error: aErr } = await supabase
          .from('service_order_assignees')
          .insert(rows);
        if (aErr) console.error('Error inserting assignees:', aErr);
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
        description: getErrorMessage(error) 
      });
    },
  });

  const updateServiceOrder = useMutation({
    mutationFn: async ({ id, assignee_user_ids, equipment_items, ...input }: ServiceOrderUpdate & { assignee_user_ids?: string[]; equipment_items?: Array<{ equipment_id?: string; form_template_id?: string }> }) => {
      const sanitized = normalizeOptionalForeignKeys(input, [
        'technician_id',
        'team_id',
        'customer_id',
        'equipment_id',
        'service_type_id',
        'form_template_id',
        'contract_id',
      ] as Array<keyof typeof input>);

      const { data, error } = await supabase
        .from('service_orders')
        .update(sanitized as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Auto-create rating token when status changes to concluida
      if (input.status === 'concluida') {
        const { error: ratingError } = await supabase
          .from('service_ratings')
          .insert({ service_order_id: id })
          .select()
          .single();
        // Ignore duplicate constraint error (already exists)
        if (ratingError && ratingError.code !== '23505') {
          console.error('Error creating rating token:', ratingError);
        }
      }

      // Sync assignees if provided
      if (assignee_user_ids !== undefined) {
        await supabase.from('service_order_assignees').delete().eq('service_order_id', id);
        if (assignee_user_ids.length > 0) {
          await supabase.from('service_order_assignees').insert(
            assignee_user_ids.map(uid => ({ service_order_id: id, user_id: uid }))
          );
        }
      }

      // Sync equipment items if provided
      if (equipment_items !== undefined) {
        await supabase.from('service_order_equipment').delete().eq('service_order_id', id);
        if (equipment_items.length > 0) {
          const rows = equipment_items.map(item => ({
            service_order_id: id,
            equipment_id: item.equipment_id || null,
            form_template_id: item.form_template_id || null,
          }));
          await supabase.from('service_order_equipment').insert(rows);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['service-ratings'] });
      toast({ title: 'OS atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao atualizar OS', 
        description: getErrorMessage(error) 
      });
    },
  });

  const deleteServiceOrder = useMutation({
    mutationFn: async (id: string) => {
      // Clear FK references in contract_occurrences
      await supabase
        .from('contract_occurrences')
        .update({ service_order_id: null })
        .eq('service_order_id', id);

      // Clear FK references in other tables
      await supabase
        .from('service_order_equipment')
        .delete()
        .eq('service_order_id', id);

      // Delete form responses
      await supabase
        .from('form_responses')
        .delete()
        .eq('service_order_id', id);

      // Delete OS photos
      await supabase
        .from('os_photos')
        .delete()
        .eq('service_order_id', id);

      // Delete service ratings
      await supabase
        .from('service_ratings')
        .delete()
        .eq('service_order_id', id);

      // Delete inventory movements
      await supabase
        .from('inventory_movements')
        .delete()
        .eq('service_order_id', id);

      // Delete PMOC schedules references
      await supabase
        .from('pmoc_schedules')
        .update({ service_order_id: null })
        .eq('service_order_id', id);

      // Now delete the OS
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
        description: getErrorMessage(error) 
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
