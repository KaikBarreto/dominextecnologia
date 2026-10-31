import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface PartyLabel {
  id: string;
  company_id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

type PartyLabelInput = Pick<PartyLabel, 'name' | 'color'>;

export function usePartyLabels() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['party-labels', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return [] as PartyLabel[];
      const { data, error } = await supabase
        .from('party_labels')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as PartyLabel[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['party-labels'] });

  const createLabel = useMutation({
    mutationFn: async (input: PartyLabelInput) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { data, error } = await supabase
        .from('party_labels')
        .insert({ ...input, company_id: companyId, is_active: true })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PartyLabel;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Etiqueta criada!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao criar etiqueta', description: getErrorMessage(error) }),
  });

  const updateLabel = useMutation({
    mutationFn: async ({ id, ...input }: Partial<PartyLabelInput & Pick<PartyLabel, 'is_active'>> & { id: string }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { data, error } = await supabase
        .from('party_labels')
        .update(input)
        .eq('id', id)
        .eq('company_id', companyId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PartyLabel;
    },
    onSuccess: invalidate,
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao atualizar etiqueta', description: getErrorMessage(error) }),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { error } = await supabase
        .from('party_labels')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Etiqueta removida!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao remover etiqueta', description: getErrorMessage(error) }),
  });

  const labels = query.data ?? [];
  const activeLabels = labels.filter((label) => label.is_active);
  const byId = (id?: string | null) => labels.find((label) => label.id === id);

  return { labels, activeLabels, byId, isLoading: query.isLoading, isError: query.isError, createLabel, updateLabel, deleteLabel };
}
