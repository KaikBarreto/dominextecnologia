import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/hooks/pdvReportCache', () => ({ PDV_REPORTS_QUERY_ROOT: ['pdv'], invalidatePdvReportCaches: vi.fn(), usePdvAuthorizedQueryScope: () => ({ key: ['c'], ready: true }) }));

import { PdvReportContractError, projectPdvSalesReport } from './usePdvReportsV2';
import { salesRowLabel } from '@/lib/pdv/salesReport';

const base = {
  dimension: 'product', from: '2026-11-01', to: '2026-11-21',
  totals: { orders_count: 11, quantity: 20, revenue: 662.1, cmv: 270.49, margin: 391.61 },
  total_count: 2, limit: 25, offset: 0, has_more: false,
  rows: [
    { key: 'p1', label: 'Capacitor 35uF', detail: 'SKU 123 · un', orders_count: 8, quantity: 12, revenue: 500, cmv: 200, margin: 300, share: 0.755 },
    { key: null, label: 'Sem cliente identificado', detail: null, orders_count: 3, quantity: 8, revenue: 162.1, cmv: null, margin: null, share: 0.245 },
  ],
};

describe('relatório de vendas do PDV (o que eu vendi)', () => {
  it('lê ranking, totais e linhas sem chave', () => {
    const report = projectPdvSalesReport(base);
    expect(report.totals).toEqual({ ordersCount: 11, quantity: 20, revenue: 662.1, cmv: 270.49, margin: 391.61 });
    expect(report.rows[0]).toMatchObject({ key: 'p1', label: 'Capacitor 35uF', ordersCount: 8, share: 0.755 });
    expect(report.rows[1]).toMatchObject({ key: null, cmv: null, margin: null, detail: null });
  });

  it.each([
    ['dimensão desconhecida', { dimension: 'category' }],
    ['rows ausente', { rows: undefined }],
    ['has_more incoerente', { has_more: true }],
    ['contagem de vendas fracionada', { totals: { ...base.totals, orders_count: 1.5 } }],
    ['receita total como texto', { totals: { ...base.totals, revenue: '662' } }],
    ['nome vazio', { rows: [{ ...base.rows[0], label: ' ' }, base.rows[1]] }],
    ['participação acima de 100%', { rows: [{ ...base.rows[0], share: 1.5 }, base.rows[1]] }],
    ['chave numérica', { rows: [{ ...base.rows[0], key: 8 }, base.rows[1]] }],
    ['custo indefinido', { rows: [{ ...base.rows[0], cmv: undefined }, base.rows[1]] }],
  ])('recusa resposta com %s', (_name, patch) => {
    expect(() => projectPdvSalesReport({ ...base, ...patch })).toThrow(PdvReportContractError);
  });

  it('mostra a hora como faixa de horário', () => {
    const row = { key: '8', label: '8', detail: null, ordersCount: 1, quantity: 1, revenue: 1, cmv: null, margin: null, share: 1 };
    expect(salesRowLabel(row, 'hour')).toBe('08h às 09h');
    expect(salesRowLabel({ ...row, key: '23' }, 'hour')).toBe('23h às 00h');
    expect(salesRowLabel({ ...row, label: 'Maria' }, 'customer')).toBe('Maria');
  });
});
