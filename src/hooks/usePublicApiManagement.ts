import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const PUBLIC_API_SCOPES = [
  'availability:read',
  'catalogs:read',
  'customers:resolve',
  'crm_cards:read',
  'crm_cards:write',
  'service_orders:read',
  'service_orders:create',
] as const;

export type PublicApiScope = (typeof PUBLIC_API_SCOPES)[number];
export type PublicApiDistributionMode = 'agent_selects' | 'round_robin' | 'unassigned';

export interface PublicApiKeyMetadata {
  id: string;
  integration_id: string;
  name: string | null;
  public_id: string;
  secret_last_four: string;
  created_at: string;
  valid_from: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  rotated_from_key_id: string | null;
}

export interface PublicApiIntegrationResource {
  id: string;
  type: 'user' | 'team';
}

export interface PublicApiIntegration {
  id: string;
  name: string;
  scopes: PublicApiScope[];
  distribution_mode: PublicApiDistributionMode;
  ip_allowlist: string[];
  status: 'active' | 'inactive';
  resources: PublicApiIntegrationResource[];
  created_at: string;
  updated_at: string;
  keys: PublicApiKeyMetadata[];
}

export interface PublicApiResource {
  id: string;
  name: string;
  type: 'user' | 'team';
}

export type PublicApiWeekday = '0' | '1' | '2' | '3' | '4' | '5' | '6';
export type PublicApiBusinessHours = Array<[start: string, end: string]>;

export interface PublicApiBookingSettings {
  weekly_hours: Record<PublicApiWeekday, PublicApiBusinessHours>;
  slot_interval_minutes: number;
  minimum_notice_minutes: number;
  booking_horizon_days: number;
  default_duration_minutes: number;
}

export interface PublicApiBookingException {
  id?: string;
  starts_at: string;
  ends_at: string;
  is_available?: boolean;
  reason?: string | null;
}

export interface PublicApiActivity {
  integration_id: string;
  requests_30d: number;
  errors_30d: number;
  p95_ms: number | null;
}

export interface PublicApiManagementData {
  integrations: PublicApiIntegration[];
  booking_settings: PublicApiBookingSettings | null;
  booking_exceptions: PublicApiBookingException[];
  resources: {
    users: PublicApiResource[];
    teams: PublicApiResource[];
  };
  activity: PublicApiActivity[];
  timezone?: string;
}

export interface PublicApiIntegrationInput {
  name: string;
  scopes: PublicApiScope[];
  distribution_mode: PublicApiDistributionMode;
  status?: 'active' | 'inactive';
  ip_allowlist?: string[];
  resources?: PublicApiIntegrationResource[];
  /** Compatibilidade com consumidores anteriores que selecionavam apenas usuários. */
  resource_ids?: string[];
}

interface OneTimeKeyResponse {
  api_key: string;
  key: PublicApiKeyMetadata;
}

type ApiKeyManagerRequest =
  | { action: 'list' }
  | ({ action: 'create_integration' } & PublicApiIntegrationInput)
  | ({ action: 'update_integration'; integration_id: string } & PublicApiIntegrationInput)
  | { action: 'create_key'; integration_id: string; name?: string }
  | { action: 'rotate_key'; key_id: string }
  | { action: 'revoke_key'; key_id: string }
  | { action: 'save_booking_settings'; settings: PublicApiBookingSettings }
  | { action: 'save_booking_exceptions'; exceptions: PublicApiBookingException[] };

export function canManagePublicApiKeys(input: {
  isAdmin: boolean;
  hasPermissionRecord: boolean;
  permissions: string[];
}): boolean {
  return input.isAdmin || (
    input.hasPermissionRecord
    && (input.permissions.includes('*') || input.permissions.includes('fn:manage_api_keys'))
  );
}

async function invokeApiKeyManager<T>(body: ApiKeyManagerRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke('api-key-manager', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      let message: unknown;
      try {
        const payload = await context.clone().json();
        message = payload?.message ?? payload?.error;
      } catch {
        // Corpo não-JSON: usa a mensagem padrão da SDK abaixo.
      }
      if (typeof message === 'string' && message.trim()) throw new Error(message);
    }
    throw new Error(error.message || 'Não foi possível acessar a gestão da API Pública.');
  }
  return data as T;
}

export function usePublicApiManagement() {
  const queryClient = useQueryClient();
  const { hasRole, hasPermissionRecord, permissions, profile } = useAuth();
  const canManage = canManagePublicApiKeys({
    isAdmin: hasRole('admin') || hasRole('super_admin'),
    hasPermissionRecord,
    permissions,
  });
  // Inclui o tenant no cache para que uma eventual troca de contexto de empresa
  // nunca reaproveite metadados de integração do tenant anterior.
  const queryKey = ['public-api-management', profile?.company_id ?? null];

  const query = useQuery({
    queryKey,
    enabled: canManage && Boolean(profile?.company_id),
    queryFn: () => invokeApiKeyManager<PublicApiManagementData>({ action: 'list' }),
  });

  const refreshAfter = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const createIntegration = useMutation({
    mutationFn: (input: PublicApiIntegrationInput) => invokeApiKeyManager<{ integration: PublicApiIntegration }>({
      action: 'create_integration',
      ...input,
    }),
    onSuccess: refreshAfter,
  });

  const updateIntegration = useMutation({
    mutationFn: ({ integrationId, input }: { integrationId: string; input: PublicApiIntegrationInput }) =>
      invokeApiKeyManager<{ integration: PublicApiIntegration }>({
        action: 'update_integration',
        integration_id: integrationId,
        ...input,
      }),
    onSuccess: refreshAfter,
  });

  const createKey = useMutation({
    mutationFn: ({ integrationId, name }: { integrationId: string; name?: string }) =>
      invokeApiKeyManager<OneTimeKeyResponse>({
        action: 'create_key',
        integration_id: integrationId,
        name,
      }),
    onSuccess: refreshAfter,
  });

  const rotateKey = useMutation({
    mutationFn: (keyId: string) => invokeApiKeyManager<OneTimeKeyResponse>({
      action: 'rotate_key',
      key_id: keyId,
    }),
    onSuccess: refreshAfter,
  });

  const revokeKey = useMutation({
    mutationFn: (keyId: string) => invokeApiKeyManager<{ success: true }>({
      action: 'revoke_key',
      key_id: keyId,
    }),
    onSuccess: refreshAfter,
  });

  const saveBookingSettings = useMutation({
    mutationFn: (settings: PublicApiBookingSettings) => invokeApiKeyManager<{ booking_settings: PublicApiBookingSettings }>({
      action: 'save_booking_settings',
      settings,
    }),
    onSuccess: refreshAfter,
  });

  const saveBookingExceptions = useMutation({
    mutationFn: (exceptions: PublicApiBookingException[]) => invokeApiKeyManager<{ booking_exceptions: PublicApiBookingException[] }>({
      action: 'save_booking_exceptions',
      exceptions,
    }),
    onSuccess: refreshAfter,
  });

  return {
    canManage,
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createIntegration,
    updateIntegration,
    createKey,
    rotateKey,
    revokeKey,
    saveBookingSettings,
    saveBookingExceptions,
  };
}
