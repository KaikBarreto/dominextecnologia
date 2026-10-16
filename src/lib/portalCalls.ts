import type { ServiceOrder } from '@/types/database';

const CLOSED_PORTAL_CALL_STATUSES = new Set(['concluida', 'cancelada']);

export type PortalCallSource = 'customer' | 'contract';

export function isPortalCall(order: Pick<ServiceOrder, 'origin'>): boolean {
  return order.origin === 'portal';
}

export function isOpenPortalCall(
  order: Pick<ServiceOrder, 'origin' | 'status'>,
): boolean {
  return isPortalCall(order) && !CLOSED_PORTAL_CALL_STATUSES.has(order.status);
}

export function getPortalCallSource(
  order: Pick<ServiceOrder, 'contract_id'>,
): PortalCallSource {
  return order.contract_id ? 'contract' : 'customer';
}

export function buildPortalCallsPath(serviceOrderId?: string): string {
  const params = new URLSearchParams({ aba: 'chamados' });
  if (serviceOrderId) params.set('os', serviceOrderId);
  return `/ordens-servico?${params.toString()}`;
}
