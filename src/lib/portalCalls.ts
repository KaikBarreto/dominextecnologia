export type PortalCallSource = 'customer' | 'contract';
export type PortalCallStatus = 'aguardando_analise' | 'convertido' | 'encerrado_sem_os';

export interface PortalCall {
  id: string;
  company_id: string;
  customer_id: string;
  equipment_id: string | null;
  contract_id: string | null;
  description: string;
  source: PortalCallSource;
  status: PortalCallStatus;
  service_order_id: string | null;
  protocol_number: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    celular: string | null;
  } | null;
  equipment?: {
    id: string;
    name: string;
    brand: string | null;
    model: string | null;
  } | null;
  contract?: { id: string; name: string | null } | null;
  service_order?: {
    id: string;
    order_number: number;
    status: string;
    scheduled_date: string | null;
  } | null;
}

export function isAwaitingPortalCall(call: Pick<PortalCall, 'status'>): boolean {
  return call.status === 'aguardando_analise';
}

export function buildPortalCallsPath(portalCallId?: string): string {
  const params = new URLSearchParams({ aba: 'chamados' });
  if (portalCallId) params.set('chamado', portalCallId);
  return `/ordens-servico?${params.toString()}`;
}
