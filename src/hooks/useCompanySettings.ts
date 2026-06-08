import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';

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
  const { user, hasRole, loading: authLoading } = useAuth();

  const settingsQuery = useQuery({
    // Cache must be keyed per-user, otherwise switching accounts (or hitting
    // hard refresh after a logout) reuses the previous tenant's settings.
    queryKey: ['company-settings', user?.id ?? null],
    // Wait for AuthContext to finish loading roles/permissions before firing,
    // otherwise on hard refresh hasRole('super_admin') is briefly false and
    // we'd return another tenant's settings to a master.
    enabled: !!user && !authLoading,
    queryFn: async () => {
      if (!user) return null;

      // super_admin (master) operates the admin panel and must never see a
      // tenant's branding/whitelabel — even if they happen to have a stale
      // company_id on their profile from past testing data.
      if (hasRole('super_admin')) return null;

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

      // O espelhamento company_settings -> companies e feito server-side por
      // trigger (SECURITY DEFINER), pois o RLS de UPDATE em `companies` exige
      // is_admin_user e bloqueia o tenant comum. Nao tentar espelhar no client.

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
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['company-settings'], context.previous);
      }
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(error) });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    updateSettings,
  };
}
