import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Equipment } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';

export interface EquipmentInput {
  customer_id: string;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  capacity?: string;
  location?: string;
  install_date?: string;
  warranty_until?: string;
  notes?: string;
  category_id?: string;
  identifier?: string;
  photo_url?: string;
  custom_fields?: Record<string, any>;
  status?: string;
}

export function useEquipment(customerId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();

  const equipmentQuery = useQuery({
    queryKey: ['equipment', user?.id ?? 'anon', customerId],
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
    enabled: !loading,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
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
        description: getErrorMessage(error) 
      });
    },
  });

  return {
    equipment: equipmentQuery.data ?? [],
    isLoading: equipmentQuery.isLoading,
    isError: equipmentQuery.isError,
    error: equipmentQuery.error,
    refetch: equipmentQuery.refetch,
    createEquipment,
  };
}
