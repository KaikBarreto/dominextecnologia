import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TIME_ZONE } from '@/lib/timezone';

export type CommunicationChannel = 'all' | 'email' | 'whatsapp';

export interface CommunicationChannelSummary {
  channel: 'email' | 'whatsapp';
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

export interface CommunicationSeriesPoint {
  bucket: string;
  channel: 'email' | 'whatsapp';
  total: number;
  success: number;
  failed: number;
}

export interface CommunicationFailure {
  channel: 'email' | 'whatsapp';
  company_id: string;
  company_name: string;
  event_key: string;
  status: string;
  attempts: number;
  safe_error: string;
  updated_at: string;
}

export interface CommunicationErrorGroup {
  channel: 'email' | 'whatsapp';
  safe_error: string;
  total: number;
  last_seen_at: string;
}

export interface CommunicationCompanyRow {
  company_id: string;
  company_name: string;
  total: number;
  email: number;
  whatsapp: number;
  success: number;
  failed: number;
  last_activity: string;
}

export interface EmailQuotaRow {
  company_id: string;
  company_name: string;
  enabled: boolean;
  used: number;
  limit: number;
}

export interface WhatsappConnectionHealth {
  company_id: string;
  company_name: string;
  provider: string;
  status: string;
  last_seen_at: string | null;
  consecutive_failures: number;
  has_error: boolean;
}

export interface AdminCommunicationStatistics {
  period: { from: string; to: string; timezone: string };
  filters: {
    channel: CommunicationChannel;
    company_id: string | null;
    companies: Array<{ id: string; name: string }>;
  };
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    channels: CommunicationChannelSummary[];
  };
  queue: {
    total: number;
    email: number;
    whatsapp: number;
    ready: number;
    oldest_created_at: string | null;
  };
  series: CommunicationSeriesPoint[];
  recent_failures: CommunicationFailure[];
  errors: CommunicationErrorGroup[];
  companies: CommunicationCompanyRow[];
  email_quota: EmailQuotaRow[];
  whatsapp_connections: WhatsappConnectionHealth[];
}

export interface ResendUsageWindow {
  used: number;
  limit: number | null;
  sent: number;
  received: number;
  resetsAt: string | null;
}

export type CommunicationProviderResponse =
  | {
      ok: true;
      checkedAt?: string;
      resend:
        | {
            available: true;
            daily: ResendUsageWindow;
            monthly: ResendUsageWindow;
            rateLimit: { limit: number | null; duration: string | null };
          }
        | {
            available: false;
            error: { code: string; message: string };
          };
    }
  | { ok: false; error: { code: string; message: string } };

interface StatisticsParams {
  from: string;
  to: string;
  channel?: CommunicationChannel;
  companyId?: string | null;
  enabled?: boolean;
}

export function useAdminCommunicationStatistics({
  from,
  to,
  channel = 'all',
  companyId = null,
  enabled = true,
}: StatisticsParams) {
  return useQuery<AdminCommunicationStatistics>({
    queryKey: ['admin-communication-statistics', from, to, channel, companyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_communication_statistics', {
        p_from: from,
        p_to: to,
        p_channel: channel,
        p_company_id: companyId,
        p_timezone: DEFAULT_TIME_ZONE,
      });
      if (error) throw error;
      return data as unknown as AdminCommunicationStatistics;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (count, error) => !isCommunicationPermissionError(error) && count < 1,
  });
}

async function unpackFunctionError(error: unknown): Promise<CommunicationProviderResponse> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body?.error?.message) return body as CommunicationProviderResponse;
    } catch {
      // Resposta não JSON: usa orientação segura e legível abaixo.
    }
  }
  return {
    ok: false,
    error: {
      code: 'internal_error',
      message: 'Não foi possível consultar o consumo do provedor de e-mail.',
    },
  };
}

export function useAdminCommunicationProviderMetrics(enabled = true) {
  return useQuery<CommunicationProviderResponse>({
    queryKey: ['admin-communication-provider-metrics'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'admin-communication-provider-metrics',
        { method: 'GET' },
      );
      if (error) return unpackFunctionError(error);
      return data as CommunicationProviderResponse;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function isCommunicationPermissionError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  return (
    candidate?.code === '42501' ||
    /permission denied|não autorizado|not authorized/i.test(candidate?.message ?? '')
  );
}
