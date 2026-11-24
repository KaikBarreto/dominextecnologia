import { describe, expect, it } from 'vitest';
import { parseSubscriptionGatewayPaidAt } from '../../supabase/functions/_shared/subscription-payment-date';

describe('data de pagamento do gateway no calendário brasileiro', () => {
  it.each([
    ['2026-02-01', '2026-02-01T03:00:00.000Z'],
    ['2027-01-01', '2027-01-01T03:00:00.000Z'],
    ['2026-02-01T00:00:00-03:00', '2026-02-01T03:00:00.000Z'],
    ['2026-02-01T01:00:00+02:00', '2026-01-31T23:00:00.000Z'],
    ['2026-02-01T00:00:00Z', '2026-02-01T00:00:00.000Z'],
    ['2026-02-01 12:30:00', '2026-02-01T15:30:00.000Z'],
  ])('preserva data civil/instante %s', (input, expected) => {
    expect(parseSubscriptionGatewayPaidAt(input)).toBe(expected);
  });
  it.each(['2026-02-30', '', 'invalid-date', null, undefined])('não aceita âncora inválida %s', input => {
    expect(parseSubscriptionGatewayPaidAt(input)).toBeNull();
  });
});
