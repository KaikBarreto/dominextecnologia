export const NFSE_MUTABLE_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export interface NfseStatusTruthInput {
  status: string;
  status_fiscal_confirmado?: boolean | null;
  status_fiscal_confirmado_em?: string | null;
}

const AUTHORIZED = new Set(['autorizada', 'authorized']);
const IMMUTABLE_TERMINAL = new Set([
  'rejeitada', 'rejected', 'cancelada', 'cancelled', 'canceled',
]);

/**
 * Evita apresentar um rótulo local como verdade atual do Fisco.
 * Autorização pode mudar por cancelamento e expira; rejeição/cancelamento
 * comprovados são desfechos imutáveis do documento consultado.
 */
export function resolveNfseDisplayStatus(
  emission: NfseStatusTruthInput,
  nowMs = Date.now(),
): string {
  const status = String(emission.status || '').toLowerCase();
  if (!AUTHORIZED.has(status) && !IMMUTABLE_TERMINAL.has(status)) return status;
  if (emission.status_fiscal_confirmado !== true) return 'confirmacao_pendente';

  const confirmedAt = Date.parse(emission.status_fiscal_confirmado_em ?? '');
  if (!Number.isFinite(confirmedAt)) return 'confirmacao_pendente';
  if (AUTHORIZED.has(status) && nowMs - confirmedAt > NFSE_MUTABLE_CONFIRMATION_TTL_MS) {
    return 'confirmacao_pendente';
  }
  return status;
}

export function nfseNeedsOfficialRefresh(
  emission: NfseStatusTruthInput,
  nowMs = Date.now(),
): boolean {
  return resolveNfseDisplayStatus(emission, nowMs) === 'confirmacao_pendente' &&
    String(emission.status || '').toLowerCase() !== 'confirmacao_pendente';
}
