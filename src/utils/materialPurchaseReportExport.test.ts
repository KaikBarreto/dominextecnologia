import { describe, expect, it } from 'vitest';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import { summarizeMaterialPurchases, toMaterialDisplayRows } from '@/lib/material-purchase-report';
import { buildMaterialPurchaseReportSheets, type MaterialPurchaseReportExportData } from './materialPurchaseReportExport';

const row: MaterialPurchaseReportRow = {
  inventory_id: 'material-1', sku: 'COB-01', material_name: 'Cobre', unit: 'kg', group_id: 'group-1',
  group_name: 'Metais', group_color: null, current_balance: 5, registered_sale_price: 20,
  purchased_quantity: 3, priced_quantity: 3, unpriced_quantity: 0, purchased_total: 30,
  average_paid: 10, purchase_count: 1, last_purchase_date: '2026-10-10',
  history: [{ date: '2026-10-10', kind: 'compra', order_id: 'order-1', order_number: 7,
    supplier_id: 'supplier-1', supplier_name: 'Fornecedor', stock_id: 'stock-1', stock_name: 'Central',
    created_by: 'user-1', created_by_name: 'Ana', financial_transaction_id: 'transaction-1', payment_method: 'pix', is_paid: true, payment_status: 'pago',
    flow_type: 'compra_direta', unit: 'kg', quantity: 3, unit_price: 10, total: 30 }],
};

function exportData(): MaterialPurchaseReportExportData {
  return {
    company: null, whiteLabel: false, materialRows: [row], displayRows: toMaterialDisplayRows([row]),
    viewMode: 'material', summary: summarizeMaterialPurchases([row]),
    filters: { period: '2026-10-01 — 2026-10-31', materials: [], suppliers: [], stocks: [], groups: [], users: [], hideZero: true, search: '' },
    locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo',
  };
}

describe('material purchase report export', () => {
  it('builds summary, history and group sheets with numeric amounts', () => {
    const sheets = buildMaterialPurchaseReportSheets(exportData());
    expect(sheets.summary.flat()).toContain(30);
    expect(sheets.history).toHaveLength(2);
    expect(sheets.history[1][11]).toBe(3);
    expect(sheets.history[1][12]).toBe(10);
    expect(sheets.history[1][13]).toBe(30);
    expect(sheets.groups[1][7]).toBe(30);
  });

  it('keeps the visible row order in the summary sheet', () => {
    const second = { ...row, inventory_id: 'material-2', material_name: 'Alumínio', sku: 'ALU-01' };
    const data = exportData();
    data.materialRows = [row, second];
    data.displayRows = toMaterialDisplayRows([second, row]);
    const summary = buildMaterialPurchaseReportSheets(data).summary;
    const headerIndex = summary.findIndex((line) => line.includes('SKU'));
    expect(summary[headerIndex + 1][2]).toBe('Alumínio');
    expect(summary[headerIndex + 2][2]).toBe('Cobre');
  });
});
