import type { Database } from '@/integrations/supabase/types';

export type InventoryAbcSourceRow = Database['public']['Functions']['get_inventory_abc_report']['Returns'][number];
export type InventoryAbcView = 'usage' | 'pdv' | 'stock';
export type InventoryAbcClass = 'A' | 'B' | 'C';

export interface InventoryAbcRow extends InventoryAbcSourceRow {
  abcClass: InventoryAbcClass;
  metricValue: number;
  quantityValue: number;
  share: number;
  cumulativeShare: number;
  rank: number;
}

export interface InventoryAbcClassSummary {
  abcClass: InventoryAbcClass;
  itemCount: number;
  value: number;
  share: number;
}

const numeric = (value: number | null | undefined) => Number(value) || 0;

export function inventoryAbcMetric(row: InventoryAbcSourceRow, view: InventoryAbcView): number {
  if (view === 'usage') return numeric(row.usage_value);
  if (view === 'pdv') return numeric(row.pdv_revenue);
  return numeric(row.stock_value);
}

export function inventoryAbcQuantity(row: InventoryAbcSourceRow, view: InventoryAbcView): number {
  if (view === 'usage') return numeric(row.usage_quantity);
  if (view === 'pdv') return numeric(row.pdv_quantity);
  return numeric(row.current_balance);
}

/**
 * Curva ABC por participação acumulada: A cobre os primeiros ~80% do valor,
 * B os próximos ~15% e C o restante. A classe usa o acumulado ANTES do item,
 * garantindo que o item mais relevante continue A mesmo quando, sozinho,
 * ultrapassa 80% do total.
 */
export function classifyInventoryAbc(
  source: InventoryAbcSourceRow[],
  view: InventoryAbcView,
): InventoryAbcRow[] {
  const sorted = source
    .map((row) => ({ row, metricValue: inventoryAbcMetric(row, view) }))
    .sort((a, b) => b.metricValue - a.metricValue || a.row.material_name.localeCompare(b.row.material_name, 'pt-BR'));
  const total = sorted.reduce((sum, item) => sum + item.metricValue, 0);
  let cumulative = 0;

  return sorted.map(({ row, metricValue }, index) => {
    const share = total > 0 ? metricValue / total : 0;
    const before = cumulative;
    cumulative += share;
    const abcClass: InventoryAbcClass = metricValue <= 0
      ? 'C'
      : before < 0.8
        ? 'A'
        : before < 0.95
          ? 'B'
          : 'C';
    return {
      ...row,
      abcClass,
      metricValue,
      quantityValue: inventoryAbcQuantity(row, view),
      share,
      cumulativeShare: cumulative,
      rank: index + 1,
    };
  });
}

export function summarizeInventoryAbc(rows: InventoryAbcRow[]): InventoryAbcClassSummary[] {
  const total = rows.reduce((sum, row) => sum + row.metricValue, 0);
  return (['A', 'B', 'C'] as const).map((abcClass) => {
    const classRows = rows.filter((row) => row.abcClass === abcClass);
    const value = classRows.reduce((sum, row) => sum + row.metricValue, 0);
    return {
      abcClass,
      itemCount: classRows.length,
      value,
      share: total > 0 ? value / total : 0,
    };
  });
}
