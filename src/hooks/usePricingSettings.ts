import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type PricingSettings = Tables<'pricing_settings'>;
export type PricingSettingsUpdate = Omit<
  TablesUpdate<'pricing_settings'>,
  'id' | 'company_id' | 'created_at' | 'updated_at'
>;

export function usePricingSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const companyId = profile?.company_id ?? null;

  const settingsQuery = useQuery({
    queryKey: ['pricing-settings', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return null;

      const { data, error } = await supabase
        .from('pricing_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) return data as PricingSettings;

      // Se não existe ainda, cria com defaults (upsert evita corrida/StrictMode)
      const { data: created, error: createError } = await supabase
        .from('pricing_settings')
        .upsert({ company_id: companyId }, { onConflict: 'company_id' })
        .select('*')
        .single();

      if (createError) throw createError;
      return created as PricingSettings;
    },
  });

  const upsertSettings = useMutation({
    mutationFn: async (input: PricingSettingsUpdate) => {
      if (!companyId) throw new Error('Empresa não encontrada para este usuário.');

      const { data, error } = await supabase
        .from('pricing_settings')
        .upsert({ company_id: companyId, ...input }, { onConflict: 'company_id' })
        .select('*')
        .single();

      if (error) throw error;
      return data as PricingSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-settings'] });
      toast({ title: 'Configurações de precificação salvas!' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
    },
  });

  return {
    settings: settingsQuery.data ?? null,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    upsertSettings,
  };
}
