import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CompanySettings {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  neighborhood?: string;
  complement?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  logo_url?: string;
  proposal_customization?: {
    primary_color?: string;
    accent_color?: string;
    header_bg?: string;
  };
  white_label_enabled?: boolean;
  white_label_logo_url?: string;
  white_label_primary_color?: string;
  created_at: string;
  updated_at: string;
}

export function useCompanySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as CompanySettings;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (input: Partial<Omit<CompanySettings, 'id' | 'created_at' | 'updated_at'>>) => {
      const current = settingsQuery.data;
      if (!current) throw new Error('Settings not found');
      const { data, error } = await supabase
        .from('company_settings')
        .update(input)
        .eq('id', current.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast({ title: 'Dados da empresa salvos!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    updateSettings,
  };
}
