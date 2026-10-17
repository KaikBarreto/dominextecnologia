import { describe, expect, it } from 'vitest';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import { buildPaymentBreakdown, groupMaterialPurchaseRows, sortMaterialPurchaseRows, summarizeMaterialPurchases, toMaterialDisplayRows } from './material-purchase-report';

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
});
