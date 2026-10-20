import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface CustomerPortalPermissions {
  service_orders: boolean;
  equipment: boolean;
  contracts: boolean;
  charges: boolean;
  invoices: boolean;
  documents: boolean;
  ticket_requests: boolean;
}

export interface CustomerPortalSettings {
  token: string | null;
  isActive: boolean;
  passwordEnabled: boolean;
  passwordConfigured: boolean;
  permissions: CustomerPortalPermissions;
}

export const DEFAULT_CUSTOMER_PORTAL_PERMISSIONS: CustomerPortalPermissions = {
  service_orders: true,
  equipment: true,
  contracts: true,
  charges: true,
  invoices: false,
  documents: false,
  ticket_requests: true,
};

export const DEFAULT_CUSTOMER_PORTAL_SETTINGS: CustomerPortalSettings = {
  token: null,
  isActive: true,
  passwordEnabled: false,
  passwordConfigured: false,
  permissions: DEFAULT_CUSTOMER_PORTAL_PERMISSIONS,
};

export function parsePortalSettings(value: unknown): CustomerPortalSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const permissions = raw.permissions && typeof raw.permissions === 'object'
    ? raw.permissions as Record<string, unknown>
    : {};

  return {
    token: typeof raw.token === 'string' ? raw.token : null,
    isActive: raw.is_active === true,
    passwordEnabled: raw.password_enabled === true,
    passwordConfigured: raw.password_configured === true,
    permissions: {
      service_orders: permissions.service_orders !== false,
      equipment: permissions.equipment !== false,
      contracts: permissions.contracts !== false,
      charges: permissions.charges !== false,
      // Conteudo sensivel: ausencia da chave em portal antigo falha fechado.
      invoices: permissions.invoices === true,
      documents: permissions.documents === true,
      ticket_requests: permissions.ticket_requests !== false,
    },
  };
}

export function useCustomerPortalSettings(customerId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['customer-portal-settings', customerId],
    enabled: enabled && !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_portal_settings', {
        p_customer_id: customerId!,
      });
      if (error) throw error;
      return parsePortalSettings(data);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      targetCustomerId,
      settings,
      password,
    }: {
      targetCustomerId: string;
      settings: CustomerPortalSettings;
      password: string | null;
    }) => {
      const { data, error } = await supabase.rpc('save_customer_portal_settings', {
        p_customer_id: targetCustomerId,
        p_is_active: settings.isActive,
        p_password_enabled: settings.passwordEnabled,
        p_password: password,
        p_permissions: settings.permissions as unknown as Json,
      });
      if (error) throw error;
      const parsed = parsePortalSettings(data);
      if (!parsed) throw new Error('Resposta inválida ao salvar o portal');
      return parsed;
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(
        ['customer-portal-settings', variables.targetCustomerId],
        saved,
      );
    },
  });

  return {
    settings: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    saveSettings: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}

export function buildCustomerPortalUrl(token: string): string {
  return `${window.location.origin}/portal/${token}`;
}
