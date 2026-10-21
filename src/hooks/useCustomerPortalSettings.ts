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
  /**
   * Seções LIVRES (abrem sem pedir a senha) quando a proteção por senha está
   * ligada. `false`/ausente = a seção visível continua atrás da senha.
   * Mapa dos 3 estados por seção:
   *   Oculto     → permissions[k] = false
   *   Sem senha  → permissions[k] = true  E publicSections[k] = true
   *   Com senha  → permissions[k] = true  E publicSections[k] = false
   * Default tudo `false` = nada livre: quem já usa senha hoje não sente
   * diferença nenhuma.
   */
  publicSections: CustomerPortalPermissions;
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

/** Nenhuma seção livre: com senha ligada, tudo continua protegido. */
export const DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS: CustomerPortalPermissions = {
  service_orders: false,
  equipment: false,
  contracts: false,
  charges: false,
  invoices: false,
  documents: false,
  ticket_requests: false,
};

export const DEFAULT_CUSTOMER_PORTAL_SETTINGS: CustomerPortalSettings = {
  token: null,
  isActive: true,
  passwordEnabled: false,
  passwordConfigured: false,
  permissions: DEFAULT_CUSTOMER_PORTAL_PERMISSIONS,
  publicSections: DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS,
};

export function parsePortalSettings(value: unknown): CustomerPortalSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const permissions = raw.permissions && typeof raw.permissions === 'object'
    ? raw.permissions as Record<string, unknown>
    : {};
  // `public_sections` é "quem abre SEM senha". Portal antigo não tem a chave,
  // então TODA leitura aqui é fail-closed (`=== true`): ausência = protegido.
  const publicSections = raw.public_sections && typeof raw.public_sections === 'object'
    ? raw.public_sections as Record<string, unknown>
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
    publicSections: {
      service_orders: publicSections.service_orders === true,
      equipment: publicSections.equipment === true,
      contracts: publicSections.contracts === true,
      charges: publicSections.charges === true,
      invoices: publicSections.invoices === true,
      documents: publicSections.documents === true,
      ticket_requests: publicSections.ticket_requests === true,
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
      // Args em variável (não literal inline) de propósito: `p_public_sections`
      // só entra no types.ts gerado depois que a migration do portal com 3
      // estados for aplicada, e literal inline dispara excess property check.
      const rpcArgs = {
        p_customer_id: targetCustomerId,
        p_is_active: settings.isActive,
        p_password_enabled: settings.passwordEnabled,
        p_password: password,
        p_permissions: settings.permissions as unknown as Json,
        p_public_sections: (settings.publicSections
          ?? DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS) as unknown as Json,
      };
      const { data, error } = await supabase.rpc('save_customer_portal_settings', rpcArgs);
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
