import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export type PartyEntityType = 'customer' | 'supplier';
export type PartyFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface PartyFieldConfig {
  id: string;
  company_id: string;
  entity_type: PartyEntityType;
  field_key: string;
  label: string;
  field_type: PartyFieldType;
  options: string[] | null;
  is_required: boolean;
  is_visible: boolean;
  is_visible_in_portal: boolean;
  position: number;
  created_at: string;
  updated_at?: string;
}

type CreateFieldInput = Omit<PartyFieldConfig, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

export function usePartyFieldConfig(entityType: PartyEntityType) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['party-field-config', companyId, entityType],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return [] as PartyFieldConfig[];
      const { data, error } = await supabase
        .from('party_field_config')
        .select('*')
        .eq('company_id', companyId)
        .eq('entity_type', entityType)
        .order('position');
      if (error) throw error;
      return (data ?? []) as unknown as PartyFieldConfig[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['party-field-config'] });

  const createField = useMutation({
    mutationFn: async (input: Omit<CreateFieldInput, 'entity_type'>) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { data, error } = await supabase
        .from('party_field_config')
        .insert({ ...input, entity_type: entityType, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PartyFieldConfig;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Campo criado!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao criar campo', description: getErrorMessage(error) }),
  });

  const updateField = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Omit<CreateFieldInput, 'entity_type'>> & { id: string }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { data, error } = await supabase
        .from('party_field_config')
        .update(input)
        .eq('id', id)
        .eq('company_id', companyId)
        .eq('entity_type', entityType)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PartyFieldConfig;
    },
    onSuccess: invalidate,
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao atualizar campo', description: getErrorMessage(error) }),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { error } = await supabase
        .from('party_field_config')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId)
        .eq('entity_type', entityType);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Campo removido!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao remover campo', description: getErrorMessage(error) }),
  });

  return { fields: query.data ?? [], isLoading: query.isLoading, isError: query.isError, createField, updateField, deleteField };
}

export function missingRequiredPartyFields(fields: PartyFieldConfig[], values: Record<string, unknown>) {
  return fields.filter((field) => {
    if (!field.is_visible || !field.is_required) return false;
    const value = values[field.field_key];
    return value === null || value === undefined || value === '';
  });
}

export function formatPartyFieldValue(field: Pick<PartyFieldConfig, 'field_type'>, value: unknown): string {
  if (field.field_type === 'boolean') return value === true || value === 'true' ? 'Sim' : 'Não';
  if (field.field_type === 'date' && typeof value === 'string') {
    const [year, month, day] = value.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return String(value ?? '');
}
