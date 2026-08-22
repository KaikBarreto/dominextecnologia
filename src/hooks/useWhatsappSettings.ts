import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

export type WhatsappConnectionStatus = 'disconnected' | 'qr' | 'connected' | 'banned';

export interface WhatsappSettings {
  id: string;
  company_id: string;
  instance_name: string | null;
  connection_status: WhatsappConnectionStatus;
  connected_number: string | null;
  connected_at: string | null;
  enabled: boolean;
  trigger_a_caminho: boolean;
  trigger_em_andamento: boolean;
  trigger_concluida: boolean;
  created_at: string;
  updated_at: string;
}

export type WhatsappSettingsUpdate = Partial<
  Pick<
    WhatsappSettings,
    | 'enabled'
    | 'trigger_a_caminho'
    | 'trigger_em_andamento'
    | 'trigger_concluida'
  >
>;

export function useWhatsappSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { companyId } = useUserCompany();

  const queryKey = ['whatsapp-settings', companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<WhatsappSettings | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('company_whatsapp_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data as WhatsappSettings | null;
    },
  });

  const update = useMutation({
    mutationFn: async (input: WhatsappSettingsUpdate) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const current = queryClient.getQueryData<WhatsappSettings | null>(queryKey);
      if (current) {
        const { data, error } = await supabase
          .from('company_whatsapp_settings')
          .update(input)
          .eq('company_id', companyId)
          .select()
          .single();
        if (error) throw error;
        return data as WhatsappSettings;
      }
      // Sem linha: inserir
      const { data, error } = await supabase
        .from('company_whatsapp_settings')
        .insert({ ...input, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data as WhatsappSettings;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WhatsappSettings | null>(queryKey);
      if (previous) {
        queryClient.setQueryData<WhatsappSettings | null>(queryKey, {
          ...previous,
          ...input,
          updated_at: new Date().toISOString(),
        });
      }
      return { previous };
    },
    onSuccess: (row) => {
      queryClient.setQueryData<WhatsappSettings | null>(queryKey, row);
    },
    onError: (error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: getErrorMessage(error),
      });
    },
  });

  return {
    settings: query.data ?? null,
    isLoading: query.isLoading,
    companyId,
    update,
  };
}
