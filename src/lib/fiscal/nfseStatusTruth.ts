export const NFSE_MUTABLE_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export interface NfseStatusTruthInput {
  status: string;
  status_fiscal_confirmado?: boolean | null;
  status_fiscal_confirmado_em?: string | null;
  chave_acesso?: string | null;
  error_message?: string | null;
}

const AUTHORIZED = new Set(['autorizada', 'authorized']);
const IMMUTABLE_TERMINAL = new Set([
  'rejeitada', 'rejected', 'cancelada', 'cancelled', 'canceled',
]);

/**
 * Evita apresentar um rótulo local como verdade atual do Fisco.
 * Uma autorização comprovada não deixa de existir visualmente só porque a
 * consulta envelheceu: a idade da prova dispara uma nova consulta em segundo
 * plano, sem rebaixar a nota para "aguardando confirmação".
 */
export function resolveNfseDisplayStatus(
  emission: NfseStatusTruthInput,
  _nowMs = Date.now(),
): string {
  const status = String(emission.status || '').toLowerCase();
  if (!AUTHORIZED.has(status) && !IMMUTABLE_TERMINAL.has(status)) return status;

  // Tentativa que falhou antes de existir documento fiscal: não é uma nota
  // aguardando confirmação nem uma rejeição fiscal consultável.
  if (
    (status === 'rejeitada' || status === 'rejected') &&
    emission.status_fiscal_confirmado !== true &&
    !emission.chave_acesso &&
    Boolean(emission.error_message)
  ) {
    return 'falhou';
  }

  if (emission.status_fiscal_confirmado !== true) return 'confirmacao_pendente';

  const confirmedAt = Date.parse(emission.status_fiscal_confirmado_em ?? '');
  if (!Number.isFinite(confirmedAt)) return 'confirmacao_pendente';
  return status;
}

export function nfseNeedsOfficialRefresh(
  emission: NfseStatusTruthInput,
  nowMs = Date.now(),
): boolean {
  const status = String(emission.status || '').toLowerCase();
  if (!AUTHORIZED.has(status) && !IMMUTABLE_TERMINAL.has(status)) return false;
  if (resolveNfseDisplayStatus(emission, nowMs) === 'falhou') return false;
  if (emission.status_fiscal_confirmado !== true) return true;

  const confirmedAt = Date.parse(emission.status_fiscal_confirmado_em ?? '');
  if (!Number.isFinite(confirmedAt)) return true;

  return AUTHORIZED.has(status) &&
    nowMs - confirmedAt > NFSE_MUTABLE_CONFIRMATION_TTL_MS;
}
