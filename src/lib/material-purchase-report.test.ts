import { describe, expect, it } from 'vitest';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import {
  buildMaterialPriceTrend,
  buildPaymentBreakdown,
  groupMaterialPurchaseRows,
  rankMaterialPriceChanges,
  sortMaterialPurchaseRows,
  summarizeMaterialPrice,
  summarizeMaterialPurchases,
  toMaterialDisplayRows,
} from './material-purchase-report';

function material(overrides: Partial<MaterialPurchaseReportRow> = {}): MaterialPurchaseReportRow {
  return {
    inventory_id: 'material-1', sku: 'COB-01', material_name: 'Cobre', unit: 'kg',
    group_id: 'group-1', group_name: 'Metais', group_color: '#A855F7', current_balance: 4,
    registered_sale_price: 18, purchased_quantity: 10, priced_quantity: 10, unpriced_quantity: 0,
    purchased_total: 100, average_paid: 10, purchase_count: 1, last_purchase_date: '2026-10-10',
    history: [{ date: '2026-10-10', kind: 'compra', order_id: 'order-1', order_number: 10,
      supplier_id: 'supplier-1', supplier_name: 'Fornecedor', stock_id: 'stock-1', stock_name: 'Central',
      created_by: 'user-1', created_by_name: 'Ana', financial_transaction_id: 'transaction-1', payment_method: 'pix', is_paid: true, payment_status: 'pago',
      flow_type: 'compra_direta', unit: 'kg', quantity: 10, unit_price: 10, total: 100 }],
    ...overrides,
  };
}

describe('material purchase report calculations', () => {
  it('uses the order ticket instead of mixing measurement units into a global average', () => {
    const rows = [material(), material({ inventory_id: 'material-2', unit: 'un', purchased_quantity: 2, priced_quantity: 2, purchased_total: 80, history: [{ ...material().history[0], order_id: 'order-2', unit: 'un', quantity: 2, total: 80 }] })];
    const summary = summarizeMaterialPurchases(rows);
    expect(summary.purchasedTotal).toBe(180);
    expect(summary.averagePurchaseTicket).toBe(90);
  });

  it('does not calculate a group average or quantity label across mixed units', () => {
    const grouped = groupMaterialPurchaseRows([
      material(),
      material({ inventory_id: 'material-2', material_name: 'Conector', unit: 'un', purchased_quantity: 2, priced_quantity: 2, purchased_total: 80 }),
    ], 'Ungrouped');
    expect(grouped[0].unit).toBe('');
    expect(grouped[0].average_paid).toBeNull();
  });

  it('separates pending and unlinked payments without inventing status', () => {
    const pending = material({ history: [{ ...material().history[0], order_id: 'order-2', is_paid: false, payment_status: 'pendente', payment_method: null, total: 50 }] });
    const unlinked = material({ inventory_id: 'material-2', history: [{ ...material().history[0], order_id: 'order-3', financial_transaction_id: null, is_paid: null, payment_status: 'nao_vinculado', payment_method: null, total: 30 }] });
    expect(buildPaymentBreakdown([pending, unlinked]).map((item) => item.key)).toEqual(['pending', 'not_informed']);
  });

  it('keeps null averages after sorting and places them last', () => {
    const rows = toMaterialDisplayRows([material(), material({ inventory_id: 'material-2', material_name: 'Sem preço', average_paid: null })]);
    expect(sortMaterialPurchaseRows(rows, 'average_paid', 'asc').at(-1)?.average_paid).toBeNull();
  });

  it('builds a weighted daily price and preserves days without purchases as gaps', () => {
    const history = [
      { ...material().history[0], date: '2026-10-01', order_id: 'order-1', quantity: 2, unit_price: 100, total: 200 },
      { ...material().history[0], date: '2026-10-01', order_id: 'order-2', quantity: 1, unit_price: 130, total: 130 },
      { ...material().history[0], date: '2026-10-03', order_id: 'order-3', quantity: 1, unit_price: 110, total: 110 },
    ];
    const trend = buildMaterialPriceTrend(history, { startDate: '2026-10-01', endDate: '2026-10-03' });
    expect(trend.granularity).toBe('day');
    expect(trend.points).toHaveLength(3);
    expect(trend.points[0]).toMatchObject({ averagePrice: 110, minPrice: 100, maxPrice: 130, purchasedQuantity: 3, purchaseCount: 2 });
    expect(trend.points[1].averagePrice).toBeNull();
    expect(trend.points[2].averagePrice).toBe(110);
  });

  it('clamps the visible weekly bucket labels to the inclusive selected range', () => {
    const trend = buildMaterialPriceTrend(material().history, {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(trend.granularity).toBe('week');
    expect(trend.points[0].startDate).toBe('2026-10-01');
    expect(trend.points.at(-1)?.endDate).toBe('2026-10-31');
  });

  it('changes granularity with the selected civil-date range', () => {
    const history = [material().history[0]];
    expect(buildMaterialPriceTrend(history, { startDate: '2026-10-01', endDate: '2026-10-10' }).granularity).toBe('day');
    expect(buildMaterialPriceTrend(history, { startDate: '2026-10-01', endDate: '2026-11-15' }).granularity).toBe('week');
    expect(buildMaterialPriceTrend(history, { startDate: '2026-01-01', endDate: '2026-10-31' }).granularity).toBe('month');
    expect(buildMaterialPriceTrend(history, { startDate: '2024-01-01', endDate: '2026-10-31' }).granularity).toBe('quarter');
  });

  it('summarizes the latest distinct purchase day and weighted period average', () => {
    const history = [
      { ...material().history[0], date: '2026-10-01', order_id: 'order-1', quantity: 2, unit_price: 100, total: 200 },
      { ...material().history[0], date: '2026-10-10', order_id: 'order-2', quantity: 1, unit_price: 130, total: 130 },
    ];
    expect(summarizeMaterialPrice(history)).toMatchObject({
      latestPrice: 130,
      previousPrice: 100,
      averagePrice: 110,
      minPrice: 100,
      maxPrice: 130,
      variationPercentage: 30,
      purchasedQuantity: 3,
      purchaseCount: 2,
    });
  });

  it('ranks price changes without combining materials or incompatible units', () => {
    const rows = [
      material({
        inventory_id: 'copper', material_name: 'Cobre', unit: 'kg',
        history: [
          { ...material().history[0], date: '2026-10-01', unit_price: 100 },
          { ...material().history[0], date: '2026-10-10', order_id: 'order-2', unit_price: 130 },
        ],
      }),
      material({
        inventory_id: 'filter', material_name: 'Filtro', unit: 'un',
        history: [
          { ...material().history[0], date: '2026-10-01', unit: 'un', unit_price: 50 },
          { ...material().history[0], date: '2026-10-10', order_id: 'order-3', unit: 'un', unit_price: 40 },
        ],
      }),
    ];
    const ranking = rankMaterialPriceChanges(rows);
    expect(ranking.map((item) => [item.inventoryId, item.variationPercentage])).toEqual([
      ['copper', 30],
      ['filter', -20],
    ]);
  });

  it('ignores historical entries whose frozen unit differs from the current material unit', () => {
    const history = [
      { ...material().history[0], date: '2026-10-01', unit: 'm', unit_price: 20 },
      { ...material().history[0], date: '2026-10-10', order_id: 'order-2', unit: 'kg', unit_price: 100 },
    ];
    expect(summarizeMaterialPrice(history, 'kg')).toMatchObject({
      latestPrice: 100,
      previousPrice: null,
      variationPercentage: null,
      purchaseCount: 1,
    });
    expect(buildMaterialPriceTrend(history, { unit: 'kg' }).points).toHaveLength(1);
  });

  it('does not produce an infinite variation when the previous price is zero', () => {
    const history = [
      { ...material().history[0], date: '2026-10-01', unit_price: 0 },
      { ...material().history[0], date: '2026-10-10', order_id: 'order-2', unit_price: 100 },
    ];
    expect(summarizeMaterialPrice(history).variationPercentage).toBeNull();
  });
});
