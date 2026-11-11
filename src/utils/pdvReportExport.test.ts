import { describe, expect, it } from 'vitest';
import { buildPdvCommercialCsv } from './pdvReportExport';

describe('exportação comercial do estoque', () => {
  it('preserva custo desconhecido vazio e escapa texto', () => {
    const csv = buildPdvCommercialCsv([{ material: 'Tubo; PVC', sku: 'TP-1', unit: 'un', purchasedQuantity: 10, purchasedTotal: 100, soldQuantity: 4, returnedQuantity: 1, netRevenue: 80, cmv: null, margin: null }]);
    expect(csv).toContain('"Tubo; PVC"');
    expect(csv.split('\n')[1].endsWith(';;')).toBe(true);
    expect(csv).not.toContain('NaN');
  });
});
