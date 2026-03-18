import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface EquipmentFieldConfig {
  id: string;
  field_key: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options?: string[];
  is_visible: boolean;
  is_required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useEquipmentFieldConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fieldsQuery = useQuery({
    queryKey: ['equipment-field-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_field_config')
        .select('*')
        .order('position');
      if (error) throw error;
      return data as EquipmentFieldConfig[];
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, ...input }: Partial<EquipmentFieldConfig> & { id: string }) => {
      const { data, error } = await supabase.from('equipment_field_config').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-field-config'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar campo', description: getErrorMessage(error) });
    },
  });

  const createField = useMutation({
    mutationFn: async (input: Omit<EquipmentFieldConfig, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('equipment_field_config').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-field-config'] });
      toast({ title: 'Campo criado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar campo', description: error.message });
    },
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('equipment_field_config').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-field-config'] });
      toast({ title: 'Campo excluído!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir campo', description: error.message });
    },
  });

  return {
    fields: fieldsQuery.data ?? [],
    isLoading: fieldsQuery.isLoading,
    updateField,
    createField,
    deleteField,
  };
}
