import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

export type WhatsappProvider = 'meta_cloud' | 'evolution_qr';
export type WhatsappConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'attention'
  | 'banned'
  | 'error';
export type WhatsappSendJobStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'skipped'
  | 'retry'
  | 'failed'
  | 'cancelled';

export interface WhatsappConnection {
  id: string;
  company_id: string;
  provider: WhatsappProvider;
  status: WhatsappConnectionStatus;
  display_number: string | null;
  instance_name: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  last_error: string | null;
  risk_accepted_at: string | null;
  updated_at: string;
}

export interface WhatsappSendJob {
  id: string;
  event_key: string;
  provider: WhatsappProvider;
  status: WhatsappSendJobStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface WhatsappQrPayload {
  connection_id: string;
  connection_status: WhatsappConnectionStatus;
  qr: string | null;
  pairing_code: string | null;
  message: string;
}

async function edgeError(error: unknown, fallback: string): Promise<Error> {
  const context = (error as { context?: Response })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.message === 'string') return new Error(body.message);
    } catch {
      // Usa fallback.
    }
  }
  return new Error((error as Error)?.message || fallback);
}

export function useWhatsappConnections() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['whatsapp-connections', companyId];

  const connectionsQuery = useQuery({
    queryKey,
    enabled: Boolean(companyId),
    refetchInterval: (query) => {
      const rows = (query.state.data as WhatsappConnection[] | undefined) ?? [];
      return rows.some((row) => row.status === 'qr' || row.status === 'connecting') ? 4_000 : false;
    },
    queryFn: async (): Promise<WhatsappConnection[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WhatsappConnection[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ['whatsapp-send-jobs', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<WhatsappSendJob[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('whatsapp_send_jobs')
        .select('id, event_key, provider, status, attempts, last_error, created_at, sent_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as WhatsappSendJob[];
    },
  });

  const connectQr = useMutation({
    mutationFn: async (): Promise<WhatsappQrPayload> => {
      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        // Versão sobe junto com o texto do aceite. A 2026-10-16.2 acrescentou a
        // recomendação de conectar um número reserva, e não o principal.
        body: { accepted_risk: true, risk_terms_version: '2026-10-16.2' },
      });
      if (error) throw await edgeError(error, 'Não foi possível iniciar a conexão.');
      return data as WhatsappQrPayload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings', companyId] });
    },
  });

  const selectConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-connection-select', {
        body: { connection_id: connectionId },
      });
      if (error) throw await edgeError(error, 'Não foi possível ativar a conexão.');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings', companyId] });
    },
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-connection-disconnect', {
        body: { connection_id: connectionId },
      });
      if (error) throw await edgeError(error, 'Não foi possível desconectar o número.');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings', companyId] });
    },
  });

  return {
    connections: connectionsQuery.data ?? [],
    jobs: historyQuery.data ?? [],
    isLoading: connectionsQuery.isLoading,
    historyLoading: historyQuery.isLoading,
    refresh: connectionsQuery.refetch,
    connectQr,
    selectConnection,
    disconnect,
  };
}
