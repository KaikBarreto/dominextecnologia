export type ServiceMaterialSortKey =
  | 'material'
  | 'quantity'
  | 'unit_cost'
  | 'bdi_value'
  | 'subtotal';

export type ServiceMaterialSortDirection = 'asc' | 'desc';

export interface ServiceMaterialTableRow {
  id: string;
  item_name: string;
  quantity: number;
  purchase_price: number;
  subtotal: number | null;
}

export function materialBdiUnitValue(unitCost: number, bdiFactor: number): number {
  const safeCost = Math.max(0, Number(unitCost) || 0);
  const safeFactor = Number.isFinite(bdiFactor) ? Math.max(0.01, bdiFactor) : 0.01;
  // O fator já vem do cálculo BDI canônico. Não há fórmula paralela aqui:
  // apenas aplicamos Preço = Custo ÷ BDI à unidade do material.
  return safeCost / safeFactor;
}

export function materialBdiTotal(
  rows: ServiceMaterialTableRow[],
  bdiFactor: number,
): number {
  return rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.quantity) || 0)
      * materialBdiUnitValue(row.purchase_price, bdiFactor),
    0,
  );
}

export function sortServiceMaterials<T extends ServiceMaterialTableRow>(
  rows: T[],
  key: ServiceMaterialSortKey,
  direction: ServiceMaterialSortDirection,
  bdiFactor: number,
): T[] {
  const value = (row: T): string | number => {
    switch (key) {
      case 'material': return row.item_name;
      case 'quantity': return Number(row.quantity) || 0;
      case 'unit_cost': return Number(row.purchase_price) || 0;
      case 'bdi_value': return materialBdiUnitValue(row.purchase_price, bdiFactor);
      case 'subtotal': return Number(row.subtotal ?? 0);
    }
  };

  return rows.slice().sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'pt-BR', { sensitivity: 'base' });
    return direction === 'desc' ? -comparison : comparison;
  });
}

export function isServiceMaterialCostOverride(
  savedUnitCost: number,
  canonicalPurchaseCost: number | null | undefined,
): boolean {
  if (canonicalPurchaseCost == null) return false;
  return Math.abs(Number(savedUnitCost) - Number(canonicalPurchaseCost)) > 0.0001;
}
