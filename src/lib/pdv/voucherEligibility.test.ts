import { describe, expect, it } from 'vitest';
import { isPdvVoucherEligible } from './voucherEligibility';
import { dateInTz } from '@/lib/timezone';

describe('Elegibilidade de voucher pelo dia civil da empresa', () => {
  it.each([
    [null, true], ['2026-11-13', false], ['2026-11-14', true], ['2026-11-15', true],
    ['', false], ['2026-02-31', false], ['2026-11-14T00:00:00Z', false],
  ])('trata vencimento %s de forma inclusiva e segura', (expiresOn, expected) => {
    expect(isPdvVoucherEligible({ balance: 50, expiresOn }, '2026-11-14')).toBe(expected);
  });
  it('não antecipa o vencimento quando UTC já mudou de dia', () => {
    const day = dateInTz('2026-11-15T01:00:00Z', 'America/Sao_Paulo');
    expect(day).toBe('2026-11-14');
    expect(isPdvVoucherEligible({ balance: 50, expiresOn: '2026-11-14' }, day)).toBe(true);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('não oferece saldo inválido %s', balance => {
    expect(isPdvVoucherEligible({ balance, expiresOn: null }, '2026-11-14')).toBe(false);
  });
});
