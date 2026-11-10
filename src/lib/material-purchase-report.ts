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

export type MaterialPriceGranularity = 'day' | 'week' | 'month' | 'quarter';

export interface MaterialPriceTrendPoint {
  key: string;
  startDate: string;
  endDate: string;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  purchasedQuantity: number;
  purchaseCount: number;
}

export interface MaterialPriceTrend {
  granularity: MaterialPriceGranularity;
  points: MaterialPriceTrendPoint[];
}

export interface MaterialPriceSummary {
  latestPrice: number | null;
  previousPrice: number | null;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  variationPercentage: number | null;
  latestDate: string | null;
  previousDate: string | null;
  purchasedQuantity: number;
  purchaseCount: number;
}

export interface MaterialPriceChange {
  inventoryId: string;
  materialName: string;
  sku: string;
  unit: string;
  latestPrice: number;
  previousPrice: number;
  latestDate: string;
  previousDate: string;
  variationPercentage: number;
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

const DAY_MS = 86_400_000;

function parseCivilDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function civilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfBucket(value: Date, granularity: MaterialPriceGranularity): Date {
  const date = new Date(value);
  if (granularity === 'day') return date;
  if (granularity === 'week') {
    const dayFromMonday = (date.getUTCDay() + 6) % 7;
    return addUtcDays(date, -dayFromMonday);
  }
  if (granularity === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
}

function nextBucket(value: Date, granularity: MaterialPriceGranularity): Date {
  if (granularity === 'day') return addUtcDays(value, 1);
  if (granularity === 'week') return addUtcDays(value, 7);
  if (granularity === 'month') {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 3, 1));
}

function endOfBucket(value: Date, granularity: MaterialPriceGranularity): Date {
  return addUtcDays(nextBucket(value, granularity), -1);
}

function priceGranularity(startDate: string, endDate: string): MaterialPriceGranularity {
  const span = Math.max(1, Math.round((parseCivilDate(endDate).getTime() - parseCivilDate(startDate).getTime()) / DAY_MS) + 1);
  if (span <= 14) return 'day';
  if (span <= 62) return 'week';
  if (span <= 400) return 'month';
  return 'quarter';
}

function pricedHistory(history: MaterialPurchaseHistoryItem[], expectedUnit?: string) {
  return history.filter((item) => (
    item.unit_price != null
    && item.quantity > 0
    && (!expectedUnit || item.unit === expectedUnit)
  ));
}

function aggregatePricesByDate(history: MaterialPurchaseHistoryItem[]) {
  const dates = new Map<string, { total: number; quantity: number }>();
  for (const item of pricedHistory(history)) {
    const current = dates.get(item.date) ?? { total: 0, quantity: 0 };
    current.total += Number(item.unit_price) * item.quantity;
    current.quantity += item.quantity;
    dates.set(item.date, current);
  }
  return [...dates.entries()]
    .map(([date, value]) => ({ date, price: value.total / value.quantity }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Cria a série temporal sem interpolar períodos sem compra. O custo de cada
 * balde é sempre ponderado pela quantidade efetivamente recebida.
 */
export function buildMaterialPriceTrend(
  history: MaterialPurchaseHistoryItem[],
  range: { startDate?: string; endDate?: string; unit?: string } = {},
): MaterialPriceTrend {
  const priced = pricedHistory(history, range.unit).sort((a, b) => a.date.localeCompare(b.date));
  const fallbackDate = priced[0]?.date ?? range.startDate ?? range.endDate;
  if (!fallbackDate) return { granularity: 'day', points: [] };

  const startDate = range.startDate || priced[0]?.date || fallbackDate;
  const endDate = range.endDate || priced.at(-1)?.date || fallbackDate;
  const granularity = priceGranularity(startDate, endDate);
  const firstBucket = startOfBucket(parseCivilDate(startDate), granularity);
  const lastBucket = startOfBucket(parseCivilDate(endDate), granularity);
  const buckets = new Map<string, {
    total: number;
    quantity: number;
    min: number | null;
    max: number | null;
    orders: Set<string>;
  }>();

  for (const item of priced) {
    if (item.date < startDate || item.date > endDate) continue;
    const key = civilDate(startOfBucket(parseCivilDate(item.date), granularity));
    const current = buckets.get(key) ?? { total: 0, quantity: 0, min: null, max: null, orders: new Set<string>() };
    const price = Number(item.unit_price);
    current.total += price * item.quantity;
    current.quantity += item.quantity;
    current.min = current.min == null ? price : Math.min(current.min, price);
    current.max = current.max == null ? price : Math.max(current.max, price);
    current.orders.add(item.order_id);
    buckets.set(key, current);
  }

  const points: MaterialPriceTrendPoint[] = [];
  for (let bucket = firstBucket; bucket.getTime() <= lastBucket.getTime(); bucket = nextBucket(bucket, granularity)) {
    const key = civilDate(bucket);
    const value = buckets.get(key);
    const bucketEnd = civilDate(endOfBucket(bucket, granularity));
    points.push({
      key,
      startDate: key < startDate ? startDate : key,
      endDate: bucketEnd > endDate ? endDate : bucketEnd,
      averagePrice: value && value.quantity > 0 ? value.total / value.quantity : null,
      minPrice: value?.min ?? null,
      maxPrice: value?.max ?? null,
      purchasedQuantity: value?.quantity ?? 0,
      purchaseCount: value?.orders.size ?? 0,
    });
  }

  return { granularity, points };
}

export function summarizeMaterialPrice(history: MaterialPurchaseHistoryItem[], expectedUnit?: string): MaterialPriceSummary {
  const priced = pricedHistory(history, expectedUnit);
  const daily = aggregatePricesByDate(priced);
  const latest = daily.at(-1);
  const previous = daily.at(-2);
  const totalQuantity = priced.reduce((sum, item) => sum + item.quantity, 0);
  const totalPaid = priced.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
  const prices = priced.map((item) => Number(item.unit_price));
  return {
    latestPrice: latest?.price ?? null,
    previousPrice: previous?.price ?? null,
    averagePrice: totalQuantity > 0 ? totalPaid / totalQuantity : null,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    variationPercentage: latest && previous && previous.price > 0
      ? ((latest.price - previous.price) / previous.price) * 100
      : null,
    latestDate: latest?.date ?? null,
    previousDate: previous?.date ?? null,
    purchasedQuantity: totalQuantity,
    purchaseCount: new Set(priced.map((item) => item.order_id)).size,
  };
}

/** Compara cada material apenas com ele mesmo; nunca mistura unidades. */
export function rankMaterialPriceChanges(rows: MaterialPurchaseReportRow[]): MaterialPriceChange[] {
  return rows.flatMap((row) => {
    const summary = summarizeMaterialPrice(row.history, row.unit);
    if (
      summary.latestPrice == null
      || summary.previousPrice == null
      || summary.latestDate == null
      || summary.previousDate == null
      || summary.variationPercentage == null
    ) return [];
    return [{
      inventoryId: row.inventory_id,
      materialName: row.material_name,
      sku: row.sku,
      unit: row.unit,
      latestPrice: summary.latestPrice,
      previousPrice: summary.previousPrice,
      latestDate: summary.latestDate,
      previousDate: summary.previousDate,
      variationPercentage: summary.variationPercentage,
    }];
  }).sort((a, b) => (
    b.variationPercentage - a.variationPercentage
    || a.materialName.localeCompare(b.materialName, 'pt-BR', { sensitivity: 'base' })
  ));
}

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
