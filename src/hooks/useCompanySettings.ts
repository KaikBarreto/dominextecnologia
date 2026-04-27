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
  address_number?: string;
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
  white_label_icon_url?: string;
  white_label_primary_color?: string;
  show_name_in_documents?: boolean;
  show_cnpj_in_documents?: boolean;
  show_address_in_documents?: boolean;
  show_phone_in_documents?: boolean;
  show_email_in_documents?: boolean;
  report_header_bg_color?: string;
  report_header_text_color?: string;
  report_header_logo_size?: number;
  report_header_show_logo_bg?: boolean;
  report_status_bar_color?: string;
  report_header_logo_type?: string;
  report_header_logo_bg_color?: string;
  created_at: string;
  updated_at: string;
}

export function useCompanySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Sem company_id nao da pra escolher settings deterministicamente.
      // Sem este guard, .limit(1).single() devolvia a primeira linha visivel
      // (pode ser de outra empresa) e quebrava o branding em share-links.
      if (!profile?.company_id) return null;

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      if (error) throw error;
      return data as CompanySettings | null;
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
        .select();
      if (error) throw error;
      const row = data?.[0];

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
          .single();
        if (profile?.company_id) {
          const companyUpdate: Record<string, any> = {};
          if (input.name !== undefined) companyUpdate.name = input.name;
          if (input.phone !== undefined) companyUpdate.phone = input.phone;
          if (input.email !== undefined) companyUpdate.email = input.email;
          if (input.logo_url !== undefined) companyUpdate.logo_url = input.logo_url;
          if (input.document !== undefined) companyUpdate.cnpj = input.document;
          // Sync structured address fields (used by Asaas and other integrations)
          if (input.address !== undefined) companyUpdate.address = input.address;
          if (input.address_number !== undefined) companyUpdate.address_number = input.address_number;
          if (input.neighborhood !== undefined) companyUpdate.neighborhood = input.neighborhood;
          if (input.complement !== undefined) companyUpdate.complement = input.complement;
          if (input.city !== undefined) companyUpdate.city = input.city;
          if (input.state !== undefined) companyUpdate.state = input.state;
          if (input.zip_code !== undefined) companyUpdate.zip_code = input.zip_code;
          if (Object.keys(companyUpdate).length > 0) {
            await supabase.from('companies').update(companyUpdate).eq('id', profile.company_id);
          }
        }
      } catch (syncErr) {
        console.error('Error syncing to companies table:', syncErr);
      }

      return row as CompanySettings | undefined;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['company-settings'] });
      const previous = queryClient.getQueryData<CompanySettings>(['company-settings']);

      if (previous) {
        queryClient.setQueryData<CompanySettings>(['company-settings'], {
          ...previous,
          ...input,
          updated_at: new Date().toISOString(),
        });
      }

      return { previous };
    },
    onSuccess: (row) => {
      if (row) {
        queryClient.setQueryData<CompanySettings>(['company-settings'], row);
      }
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['company-settings'], context.previous);
      }
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    updateSettings,
  };
}
