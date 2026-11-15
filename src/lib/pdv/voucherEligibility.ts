/** O vencimento é inclusivo e comparado pelo dia civil da empresa. */
export function isPdvVoucherEligible(voucher: { balance: number; expiresOn: string | null }, today: string): boolean {
  if (!Number.isFinite(voucher.balance) || voucher.balance <= 0) return false;
  if (voucher.expiresOn === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(voucher.expiresOn)) return false;
  const parsed = new Date(voucher.expiresOn + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== voucher.expiresOn) return false;
  return voucher.expiresOn >= today;
}
