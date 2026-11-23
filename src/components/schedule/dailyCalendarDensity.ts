const COMPACT_CARD_HEIGHT = 72;

/** Decide quando o card completo deixaria a grade diária ilegível. */
export function shouldUseCompactDailyEventCard(
  totalCols: number,
  height: number,
  isMobile: boolean,
): boolean {
  return height < COMPACT_CARD_HEIGHT || totalCols >= 3 || (isMobile && totalCols >= 2);
}
