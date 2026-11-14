import { describe, expect, it } from 'vitest';
import {
  MaterialPurchaseReportContractError,
  projectMaterialPurchaseReportPage,
  projectMaterialPurchaseReportRow,
} from './useMaterialPurchaseReport';

const row = {
  inventory_id: 'material-1', sku: '', material_name: 'Cimento CP II', unit: 'sc',
  group_id: null, group_name: null, group_color: null,
  current_balance: 20, registered_sale_price: 42.9,
  purchased_quantity: 10, priced_quantity: 10, unpriced_quantity: 0,
  purchased_total: 300, average_paid: 30, purchase_count: 1,
  last_purchase_date: '2026-11-07', history: [],
  delivered_quantity: 2, returned_quantity: 0, net_sold_quantity: 2,
  returned_amount: 0, net_revenue: 85.8, net_cmv: null,
  cost_coverage: 'partial', cost_coverage_percent: 50, margin: null,
};

describe('contrato do relatório de materiais', () => {
  it('preserva custo e margem indisponíveis como null', () => {
    const result = projectMaterialPurchaseReportRow(row);
    expect(result.net_cmv).toBeNull();
    expect(result.margin).toBeNull();
    expect(result.sku).toBe('');
  });

  it.each([null, '', false, [], {}, '20'])('rejeita número obrigatório inválido: %j', (invalid) => {
    expect(() => projectMaterialPurchaseReportRow({ ...row, current_balance: invalid }))
      .toThrow(MaterialPurchaseReportContractError);
  });

  it.each([undefined, '', false, [], {}, '30'])('rejeita número nullable inválido: %j', (invalid) => {
    expect(() => projectMaterialPurchaseReportRow({ ...row, average_paid: invalid }))
      .toThrow(MaterialPurchaseReportContractError);
  });

  it('rejeita data impossível, metadados incoerentes e payload ausente', () => {
    expect(() => projectMaterialPurchaseReportRow({ ...row, last_purchase_date: '2026-02-31' }))
      .toThrow(MaterialPurchaseReportContractError);
    expect(() => projectMaterialPurchaseReportPage({
      scope: 'inventory_material_period', total_count: 2, limit: 1, offset: 0,
      has_more: false, rows: [row],
    })).toThrow(MaterialPurchaseReportContractError);
    expect(() => projectMaterialPurchaseReportPage(null)).toThrow(MaterialPurchaseReportContractError);
  });
});
