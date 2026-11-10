export interface CivilDateRange {
  from?: Date;
  to?: Date;
}

export function filterItemsByCivilDateRange<T extends object>(
  items: T[],
  range: CivilDateRange,
  dateField: string,
  fallbackField?: string,
  opts?: { keepUndated?: boolean },
): T[] {
  if (!range.from && !range.to) return items;
  return items.filter((item) => {
    const values = item as Record<string, unknown>;
    const raw = values[dateField] ?? (fallbackField ? values[fallbackField] : null);
    if (!raw) return opts?.keepUndated === true;
    const dateStr = String(raw);
    const date = dateStr.length === 10 ? new Date(dateStr + 'T12:00:00') : new Date(dateStr);
    return isDateInCivilRange(date, range);
  });
}

/**
 * Compara uma data com bordas inclusivas por dia civil.
 *
 * Calendários podem entregar a data final às 00:00, enquanto registros
 * `YYYY-MM-DD` são ancorados ao meio-dia para não sofrer deslocamento de fuso.
 * A hora da borda não deve excluir o próprio primeiro/último dia selecionado.
 */
export function isDateInCivilRange(date: Date, range?: CivilDateRange): boolean {
  if (!range?.from && !range?.to) return true;
  if (Number.isNaN(date.getTime())) return false;

  if (range.from) {
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    if (date < from) return false;
  }

  if (range.to) {
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    if (date > to) return false;
  }

  return true;
}
