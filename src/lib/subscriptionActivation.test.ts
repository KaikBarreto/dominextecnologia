import { describe, expect, it } from 'vitest';
import { hasSubscriptionActivationAdvanced } from './subscriptionActivation';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');

describe('hasSubscriptionActivationAdvanced', () => {
  it('libera a primeira venda somente quando ficou ativa e com vencimento futuro', () => {
    expect(hasSubscriptionActivationAdvanced(
      { subscription_status: 'pending_payment', subscription_expires_at: '2026-10-04T03:00:00.000Z' },
      { subscription_status: 'active', subscription_expires_at: '2026-11-04T03:00:00.000Z' },
      NOW,
    )).toBe(true);
  });

  it('não aceita status ativo com vencimento ainda no passado', () => {
    expect(hasSubscriptionActivationAdvanced(
      { subscription_status: 'active', subscription_expires_at: '2026-06-04T03:00:00.000Z' },
      { subscription_status: 'active', subscription_expires_at: '2026-07-04T03:00:00.000Z' },
      NOW,
    )).toBe(false);
  });

  it('na renovação antecipada exige que o vencimento realmente avance', () => {
    const before = { subscription_status: 'active', subscription_expires_at: '2026-10-20T03:00:00.000Z' };
    expect(hasSubscriptionActivationAdvanced(before, before, NOW)).toBe(false);
    expect(hasSubscriptionActivationAdvanced(before, {
      subscription_status: 'active',
      subscription_expires_at: '2026-11-20T03:00:00.000Z',
    }, NOW)).toBe(true);
  });
});
