import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CompanySettings {
  id: string;
  company_id?: string | null;
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

// Estado interno do cache: além das settings, guarda o company_id do profile
// pra (a) saber que o usuário é de tenant com empresa mesmo quando ainda não
// existe linha em company_settings e (b) permitir o INSERT de auto-criação.
interface CompanySettingsState {
  settings: CompanySettings | null;
  companyId: string | null;
}

export function useCompanySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole, loading: authLoading } = useAuth();

  // Cache must be keyed per-user, otherwise switching accounts (or hitting
  // hard refresh after a logout) reuses the previous tenant's settings.
  // IMPORTANTE: onMutate/onSuccess/onError usam ESTA mesma chave — usar
  // ['company-settings'] sem o user id escreve numa entrada morta do cache.
  const queryKey = ['company-settings', user?.id ?? null];

  const settingsQuery = useQuery({
    queryKey,
    // Wait for AuthContext to finish loading roles/permissions before firing,
    // otherwise on hard refresh hasRole('super_admin') is briefly false and
    // we'd return another tenant's settings to a master.
    enabled: !!user && !authLoading,
    queryFn: async (): Promise<CompanySettingsState> => {
      if (!user) return { settings: null, companyId: null };

      // super_admin (master) operates the admin panel and must never see a
      // tenant's branding/whitelabel — even if they happen to have a stale
      // company_id on their profile from past testing data.
      // companyId: null aqui também mantém canSave=false (sem auto-save).
      if (hasRole('super_admin')) return { settings: null, companyId: null };

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Sem company_id nao da pra escolher settings deterministicamente.
      // Sem este guard, .limit(1).single() devolvia a primeira linha visivel
      // (pode ser de outra empresa) e quebrava o branding em share-links.
      if (!profile?.company_id) return { settings: null, companyId: null };

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      if (error) throw error;
      return { settings: data as CompanySettings | null, companyId: profile.company_id };
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (input: Partial<Omit<CompanySettings, 'id' | 'created_at' | 'updated_at'>>) => {
      // Lê do cache (não da closure) pra pegar o estado mais fresco — após um
      // INSERT bem-sucedido, o save seguinte já enxerga a linha e vira UPDATE.
      const state = queryClient.getQueryData<CompanySettingsState>(queryKey) ?? settingsQuery.data;
      const current = state?.settings ?? null;

      if (current) {
        const { data, error } = await supabase
          .from('company_settings')
          .update(input)
          .eq('id', current.id)
          .select();
        if (error) throw error;
        // UPDATE bloqueado por RLS no PostgREST retorna 0 linhas SEM erro.
        // Sem este guard o save "sucede" silenciosamente sem ter salvo nada.
        const row = data?.[0];
        if (!row) throw new Error('Sem permissão para alterar os dados da empresa.');

        // O espelhamento company_settings -> companies e feito server-side por
        // trigger (SECURITY DEFINER), pois o RLS de UPDATE em `companies` exige
        // is_admin_user e bloqueia o tenant comum. Nao tentar espelhar no client.

        return row as CompanySettings;
      }

      // Sem linha em company_settings: auto-cria via INSERT com o company_id
      // do profile (resiliência client-side; o backfill do banco cobre o resto).
      const companyId = state?.companyId ?? null;
      if (!companyId) {
        throw new Error('Não foi possível identificar a empresa do usuário. Recarregue a página e tente novamente.');
      }
      const { data, error } = await supabase
        .from('company_settings')
        .insert({ ...input, company_id: companyId })
        .select();
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('Sem permissão para alterar os dados da empresa.');
      return row as CompanySettings;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CompanySettingsState>(queryKey);

      if (previous?.settings) {
        queryClient.setQueryData<CompanySettingsState>(queryKey, {
          ...previous,
          settings: {
            ...previous.settings,
            ...input,
            updated_at: new Date().toISOString(),
          },
        });
      }

      return { previous };
    },
    onSuccess: (row) => {
      if (row) {
        queryClient.setQueryData<CompanySettingsState>(queryKey, (old) => ({
          settings: row,
          companyId: old?.companyId ?? row.company_id ?? null,
        }));
      }
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(error) });
    },
  });

  return {
    settings: settingsQuery.data?.settings ?? null,
    isLoading: settingsQuery.isLoading,
    // true quando a query terminou e o usuário pertence a um tenant com
    // empresa — mesmo sem linha em company_settings (o save cria via INSERT).
    // super_admin e usuário sem company ficam false (auto-save morto).
    canSave: !settingsQuery.isLoading && !!settingsQuery.data?.companyId,
    updateSettings,
  };
}
