/** Limits an advance deduction to the balance that is actually available. */
export function clampAdvanceDiscount(value: number, available: number): number {
  const safeAvailable = Number.isFinite(available) ? Math.max(0, available) : 0;
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return Math.min(safeValue, safeAvailable);
}
