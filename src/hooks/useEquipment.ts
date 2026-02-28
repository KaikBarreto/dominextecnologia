import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Equipment } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export interface EquipmentInput {
  customer_id: string;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  capacity?: string;
  location?: string;
  install_date?: string;
  notes?: string;
  category_id?: string;
  identifier?: string;
}

export function useEquipment(customerId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const equipmentQuery = useQuery({
    queryKey: ['equipment', customerId],
    queryFn: async () => {
      let query = supabase
        .from('equipment')
        .select(`
          *,
          customer:customers(id, name)
        `)
        .order('name');
      
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as (Equipment & { customer: any })[];
    },
    enabled: customerId !== undefined || customerId === undefined,
  });

  const createEquipment = useMutation({
    mutationFn: async (input: EquipmentInput) => {
      const { data, error } = await supabase
        .from('equipment')
        .insert(input)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast({ title: 'Equipamento criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao criar equipamento', 
        description: error.message 
      });
    },
  });

  return {
    equipment: equipmentQuery.data ?? [],
    isLoading: equipmentQuery.isLoading,
    error: equipmentQuery.error,
    createEquipment,
  };
}
