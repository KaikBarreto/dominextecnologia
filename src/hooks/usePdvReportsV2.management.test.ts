import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/hooks/pdvReportCache', () => ({ PDV_REPORTS_QUERY_ROOT: ['pdv'], invalidatePdvReportCaches: vi.fn(), usePdvAuthorizedQueryScope: () => ({ key: ['c'], ready: true }) }));

import { PdvReportContractError, projectPdvManagementReport } from './usePdvReportsV2';

const payload = {
  scope: 'pdv_management', from: '2026-11-01', to: '2026-11-07', previous_from: '2026-10-25', previous_to: '2026-10-31',
  current: { orders_count: 4, quantity: 7, revenue: 700, cmv: 300, margin: 400, margin_rate: 0.5714, average_ticket: 175, returns_count: 1, returns_impact: 50 },
  previous: { orders_count: 2, quantity: 3, revenue: 300, cmv: null, margin: null, margin_rate: null, average_ticket: 150, returns_count: 0, returns_impact: 0 },
  daily: [{ date: '2026-11-01', orders_count: 1, revenue: 100, cmv: 40, margin: 60 }],
  payments: [{ method: 'pix', orders_count: 3, amount: 500, share: 0.7143 }, { method: 'dinheiro', orders_count: 1, amount: 200, share: 0.2857 }],
  payment_total: 700,
  cash: { closed_sessions: 2, expected: 500, counted: 495, difference: -5, shortage: 10, surplus: 5 },
};

describe('contrato gerencial dos relatórios do PDV', () => {
  it('preserva CMV indisponível e projeta pagamentos/caixas', () => {
    const report = projectPdvManagementReport(payload);
    expect(report.current).toMatchObject({ ordersCount: 4, marginRate: 0.5714, returnsImpact: 50 });
    expect(report.previous.cmv).toBeNull();
    expect(report.payments.map((row) => row.method)).toEqual(['pix', 'dinheiro']);
    expect(report.cash).toMatchObject({ closedSessions: 2, shortage: 10, surplus: 5 });
  });

  it.each([
    ['escopo', { scope: 'other' }],
    ['pagamentos sem conciliar com total', { payment_total: 699 }],
    ['participação inválida', { payments: [{ ...payload.payments[0], share: 2 }, payload.payments[1]] }],
    ['margem percentual como texto', { current: { ...payload.current, margin_rate: '57%' } }],
    ['data diária inválida', { daily: [{ ...payload.daily[0], date: '01/11/2026' }] }],
  ])('recusa %s', (_name, patch) => {
    expect(() => projectPdvManagementReport({ ...payload, ...patch })).toThrow(PdvReportContractError);
  });
});
