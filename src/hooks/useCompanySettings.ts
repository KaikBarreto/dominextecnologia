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
  created_at: string;
  updated_at: string;
}

export function useCompanySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      // Try to get settings linked to user's company first
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .single();

      let query = supabase.from('company_settings').select('*');
      if (profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      }
      const { data, error } = await query.limit(1).single();
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
        .select();
      if (error) throw error;
      const row = data?.[0];

      // Sync relevant fields to the companies table
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
          if (input.address !== undefined || input.city !== undefined || input.state !== undefined) {
            const addr = [input.address || row?.address, input.city || row?.city, input.state || row?.state].filter(Boolean).join(', ');
            companyUpdate.address = addr;
          }
          if (Object.keys(companyUpdate).length > 0) {
            await supabase.from('companies').update(companyUpdate).eq('id', profile.company_id);
          }
        }
      } catch (syncErr) {
        console.error('Error syncing to companies table:', syncErr);
      }

      return row;
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
