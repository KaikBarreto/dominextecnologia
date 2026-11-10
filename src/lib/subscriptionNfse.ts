export type SubscriptionNfseState = 'not_paid' | 'none' | 'processing' | 'issued' | 'error';

interface SubscriptionNfseSnapshot {
  paymentStatus: string;
  nfseStatus?: string | null;
  nfsePdfUrl?: string | null;
  nfseRequestedAt?: string | null;
}

const REQUEST_STALE_MS = 10 * 60_000;

const PROCESSING_STATUSES = new Set([
  'REQUESTING',
  'SCHEDULED',
  'SYNCHRONIZED',
  'AUTHORIZED',
  'PROCESSING',
  'PROCESSING_CANCELLATION',
  'CREATED',
  'UPDATED',
  'CANCELLATION_DENIED',
]);

const ERROR_STATUSES = new Set([
  'ERROR',
  'CANCELED',
  'CANCELLED',
]);

export function isSubscriptionPaymentPaid(status: string): boolean {
  const normalized = (status || '').toUpperCase();
  return normalized === 'RECEIVED' || normalized === 'CONFIRMED';
}

export function getSubscriptionNfseState(
  snapshot: SubscriptionNfseSnapshot,
  nowMs = Date.now(),
): SubscriptionNfseState {
  if (!isSubscriptionPaymentPaid(snapshot.paymentStatus)) return 'not_paid';

  const status = (snapshot.nfseStatus || '').toUpperCase();
  if (ERROR_STATUSES.has(status)) return 'error';
  if (snapshot.nfsePdfUrl) return 'issued';
  if (status !== 'CANCELLATION_DENIED' && PROCESSING_STATUSES.has(status) && snapshot.nfseRequestedAt) {
    const requestedAt = new Date(snapshot.nfseRequestedAt).getTime();
    if (Number.isFinite(requestedAt) && nowMs - requestedAt >= REQUEST_STALE_MS) {
      return 'error';
    }
  }
  if (PROCESSING_STATUSES.has(status)) return 'processing';
  return 'none';
}

export function isSubscriptionNfseProcessing(
  status?: string | null,
  requestedAt?: string | null,
  nowMs = Date.now(),
): boolean {
  const normalized = (status || '').toUpperCase();
  if (normalized !== 'CANCELLATION_DENIED' && PROCESSING_STATUSES.has(normalized) && requestedAt) {
    const requestedAtMs = new Date(requestedAt).getTime();
    if (Number.isFinite(requestedAtMs) && nowMs - requestedAtMs >= REQUEST_STALE_MS) return false;
  }
  return PROCESSING_STATUSES.has(normalized);
}

