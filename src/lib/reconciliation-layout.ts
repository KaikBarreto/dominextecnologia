/** Largura mínima para dois painéis úteis, independente da largura da viewport. */
export const RECONCILIATION_TWO_PANEL_MIN_WIDTH = 1000;

export function isReconciliationContainerCompact(width: number): boolean {
  return width > 0 && width < RECONCILIATION_TWO_PANEL_MIN_WIDTH;
}
