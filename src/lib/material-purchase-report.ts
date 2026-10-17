import type {
  MaterialPurchaseHistoryItem,
  MaterialPurchaseReportRow,
} from '@/hooks/useMaterialPurchaseReport';

export type MaterialPurchaseReportView = 'material' | 'group';

export interface MaterialPurchaseDisplayRow {
  id: string;
  inventory_id: string | null;
  sku: string;
  label: string;
  unit: string;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  material_count: number;
  current_balance: number;
  purchased_quantity: number;
  priced_quantity: number;
  unpriced_quantity: number;
  purchased_total: number;
  average_paid: number | null;
  purchase_count: number;
  last_purchase_date: string | null;
  projected_sale_total: number;
  projected_profit: number;
  projected_margin: number;
  history: MaterialPurchaseHistoryItem[];
  materials?: MaterialPurchaseReportRow[];
}

export interface PurchaseReportSummary {
  purchasedTotal: number;
  purchasedQuantity: number;
  averagePurchaseTicket: number;
  materialCount: number;
  purchaseCount: number;
  projectedSaleTotal: number;
  projectedProfit: number;
  projectedMargin: number;
  topMaterial: MaterialPurchaseReportRow | null;
}

export interface PaymentBreakdownItem {
  key: string;
  amount: number;
  percentage: number;
  purchaseCount: number;
}

export type PurchaseReportSortKey =
  | 'label'
  | 'last_purchase_date'
  | 'purchase_count'
  | 'purchased_quantity'
  | 'purchased_total'
  | 'average_paid'
  | 'current_balance'
  | 'projected_profit';

export function sortMaterialPurchaseRows(
  rows: MaterialPurchaseDisplayRow[],
  key: PurchaseReportSortKey,
  direction: 'asc' | 'desc',
): MaterialPurchaseDisplayRow[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * factor;
    return String(aValue).localeCompare(String(bValue), 'pt-BR', { sensitivity: 'base' }) * factor;
  });
}

function projectionFor(row: MaterialPurchaseReportRow) {
  const projectedSaleTotal = row.registered_sale_price > 0
    ? row.purchased_quantity * row.registered_sale_price
    : row.purchased_total;
  const projectedProfit = projectedSaleTotal - row.purchased_total;
  return {
    projectedSaleTotal,
    projectedProfit,
    projectedMargin: projectedSaleTotal > 0 ? (projectedProfit / projectedSaleTotal) * 100 : 0,
  };
}

export function toMaterialDisplayRows(rows: MaterialPurchaseReportRow[]): MaterialPurchaseDisplayRow[] {
  return rows.map((row) => {
    const projection = projectionFor(row);
    return {
      id: row.inventory_id,
      inventory_id: row.inventory_id,
      sku: row.sku,
      label: row.material_name,
      unit: row.unit,
      group_id: row.group_id,
      group_name: row.group_name,
      group_color: row.group_color,
      material_count: 1,
      current_balance: row.current_balance,
      purchased_quantity: row.purchased_quantity,
      priced_quantity: row.priced_quantity,
      unpriced_quantity: row.unpriced_quantity,
      purchased_total: row.purchased_total,
      average_paid: row.average_paid,
      purchase_count: row.purchase_count,
      last_purchase_date: row.last_purchase_date,
      projected_sale_total: projection.projectedSaleTotal,
      projected_profit: projection.projectedProfit,
      projected_margin: projection.projectedMargin,
      history: row.history,
    };
  });
}

export function groupMaterialPurchaseRows(
  rows: MaterialPurchaseReportRow[],
  ungroupedLabel: string,
): MaterialPurchaseDisplayRow[] {
  const groups = new Map<string, MaterialPurchaseReportRow[]>();
  for (const row of rows) {
    const key = row.group_id ?? '__ungrouped__';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()].map(([id, materials]) => {
    const purchasedQuantity = materials.reduce((sum, row) => sum + row.purchased_quantity, 0);
    const purchasedTotal = materials.reduce((sum, row) => sum + row.purchased_total, 0);
    const projectedSaleTotal = materials.reduce((sum, row) => sum + projectionFor(row).projectedSaleTotal, 0);
    const projectedProfit = projectedSaleTotal - purchasedTotal;
    const histories = materials.flatMap((row) => row.history)
      .sort((a, b) => b.date.localeCompare(a.date));
    const orders = new Set(histories.map((item) => item.order_id));
    const latest = histories[0]?.date ?? null;
    const units = new Set(materials.filter((row) => row.purchased_quantity > 0).map((row) => row.unit));

    return {
      id,
      inventory_id: null,
      sku: '',
      label: materials[0]?.group_name || ungroupedLabel,
      unit: units.size === 1 ? [...units][0] : '',
      group_id: materials[0]?.group_id ?? null,
      group_name: materials[0]?.group_name ?? null,
      group_color: materials[0]?.group_color ?? null,
      material_count: materials.length,
      current_balance: materials.reduce((sum, row) => sum + row.current_balance, 0),
      purchased_quantity: purchasedQuantity,
      priced_quantity: materials.reduce((sum, row) => sum + row.priced_quantity, 0),
      unpriced_quantity: materials.reduce((sum, row) => sum + row.unpriced_quantity, 0),
      purchased_total: purchasedTotal,
      average_paid: units.size === 1 && materials.reduce((sum, row) => sum + row.priced_quantity, 0) > 0
        ? purchasedTotal / materials.reduce((sum, row) => sum + row.priced_quantity, 0)
        : null,
      purchase_count: orders.size,
      last_purchase_date: latest,
      projected_sale_total: projectedSaleTotal,
      projected_profit: projectedProfit,
      projected_margin: projectedSaleTotal > 0 ? (projectedProfit / projectedSaleTotal) * 100 : 0,
      history: histories,
      materials,
    };
  });
}

export function summarizeMaterialPurchases(rows: MaterialPurchaseReportRow[]): PurchaseReportSummary {
  const purchaseRows = rows.filter((row) => row.purchased_quantity > 0);
  const purchasedTotal = purchaseRows.reduce((sum, row) => sum + row.purchased_total, 0);
  const purchasedQuantity = purchaseRows.reduce((sum, row) => sum + row.purchased_quantity, 0);
  const projectedSaleTotal = purchaseRows.reduce((sum, row) => sum + projectionFor(row).projectedSaleTotal, 0);
  const projectedProfit = projectedSaleTotal - purchasedTotal;
  const orders = new Set(purchaseRows.flatMap((row) => row.history.map((item) => item.order_id)));
  const topMaterial = purchaseRows.reduce<MaterialPurchaseReportRow | null>(
    (best, row) => (!best || row.purchased_quantity > best.purchased_quantity ? row : best),
    null,
  );
  return {
    purchasedTotal,
    purchasedQuantity,
    averagePurchaseTicket: orders.size > 0 ? purchasedTotal / orders.size : 0,
    materialCount: purchaseRows.length,
    purchaseCount: orders.size,
    projectedSaleTotal,
    projectedProfit,
    projectedMargin: projectedSaleTotal > 0 ? (projectedProfit / projectedSaleTotal) * 100 : 0,
    topMaterial,
  };
}

export function buildPaymentBreakdown(rows: MaterialPurchaseReportRow[]): PaymentBreakdownItem[] {
  const totals = new Map<string, { amount: number; orders: Set<string> }>();
  for (const item of rows.flatMap((row) => row.history)) {
    const key = item.payment_status === 'pendente'
      ? 'pending'
      : item.payment_status === 'pago' && item.payment_method
        ? item.payment_method
        : 'not_informed';
    const current = totals.get(key) ?? { amount: 0, orders: new Set<string>() };
    current.amount += item.total ?? 0;
    current.orders.add(item.order_id);
    totals.set(key, current);
  }
  const grandTotal = [...totals.values()].reduce((sum, item) => sum + item.amount, 0);
  return [...totals.entries()]
    .map(([key, item]) => ({
      key,
      amount: item.amount,
      percentage: grandTotal > 0 ? (item.amount / grandTotal) * 100 : 0,
      purchaseCount: item.orders.size,
    }))
    .sort((a, b) => b.amount - a.amount);
}
