import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ServiceType {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
  requires_equipment: boolean;
  number_prefix: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceTypeInput {
  name: string;
  color: string;
  description?: string;
  is_active?: boolean;
  requires_equipment?: boolean;
}

export function useServiceTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: serviceTypes = [], isLoading } = useQuery({
    queryKey: ['service-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as unknown as ServiceType[];
    },
  });

  const createServiceType = useMutation({
    mutationFn: async (input: ServiceTypeInput) => {
      const { data, error } = await supabase
        .from('service_types')
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço criado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    },
  });

  const updateServiceType = useMutation({
    mutationFn: async ({ id, ...input }: ServiceTypeInput & { id: string }) => {
      const { data, error } = await supabase
        .from('service_types')
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    },
  });

  const deleteServiceType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço removido!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    },
  });

  return {
    serviceTypes,
    isLoading,
    createServiceType,
    updateServiceType,
    deleteServiceType,
  };
}
