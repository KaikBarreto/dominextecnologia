export interface SubscriptionActivationSnapshot {
  subscription_status: string | null;
  subscription_expires_at: string | null;
}

/**
 * Confirma que o webhook realmente concedeu um período pago.
 *
 * Na primeira venda, a troca para `active` com vencimento futuro basta. Numa
 * renovação antecipada, a empresa já estava ativa e com data futura; nesse caso
 * a nova data precisa ser posterior à que existia antes do pagamento.
 */
export function hasSubscriptionActivationAdvanced(
  before: SubscriptionActivationSnapshot | null | undefined,
  after: SubscriptionActivationSnapshot | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!after || after.subscription_status !== 'active' || !after.subscription_expires_at) {
    return false;
  }

  const afterMs = Date.parse(after.subscription_expires_at);
  if (!Number.isFinite(afterMs) || afterMs <= nowMs) return false;

  if (!before || before.subscription_status !== 'active' || !before.subscription_expires_at) {
    return true;
  }

  const beforeMs = Date.parse(before.subscription_expires_at);
  if (!Number.isFinite(beforeMs)) return true;
  return afterMs > beforeMs;
}
