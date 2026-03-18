import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type CrmWebhook = Tables<'crm_webhooks'>;

interface CreateWebhookInput {
  name: string;
  origin?: string | null;
}

interface UpdateWebhookInput {
  id: string;
  name?: string;
  origin?: string | null;
  is_active?: boolean;
}

export function useCrmWebhooks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getCurrentCompanyId = async () => {
    if (!user?.id) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    if (!data?.company_id) throw new Error('Empresa do usuário não encontrada');

    return data.company_id;
  };

  const webhooksQuery = useQuery({
    queryKey: ['crm-webhooks'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CrmWebhook[];
    },
  });

  const createWebhook = useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const companyId = await getCurrentCompanyId();

      const { data, error } = await supabase
        .from('crm_webhooks')
        .insert({
          company_id: companyId,
          name: input.name,
          origin: input.origin ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CrmWebhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-webhooks'] });
      toast({ title: 'Webhook criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar webhook', description: getErrorMessage(error) });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...input }: UpdateWebhookInput) => {
      const { data, error } = await supabase
        .from('crm_webhooks')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmWebhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-webhooks'] });
      toast({ title: 'Webhook atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar webhook', description: getErrorMessage(error) });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_webhooks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-webhooks'] });
      toast({ title: 'Webhook removido!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao remover webhook', description: getErrorMessage(error) });
    },
  });

  return {
    webhooks: webhooksQuery.data ?? [],
    isLoading: webhooksQuery.isLoading,
    createWebhook,
    updateWebhook,
    deleteWebhook,
  };
}
