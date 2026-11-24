import { describe, expect, it } from 'vitest';
import { mapPdvCashExportError, projectPdvCashExportPeriod, projectPdvCashExportSession } from './usePdvCashExport';

describe('usePdvCashExport', () => {
  it.each([
    ['PDV_CASH_SESSION_REQUIRED', /Escolha o caixa/],
    ['PDV_CASH_EXPORT_PERIOD_REQUIRED', /data inicial e a data final/],
    ['PDV_CASH_EXPORT_PERIOD_INVALID', /inválido/],
    ['PDV_CASH_EXPORT_PERIOD_TOO_LONG', /92 dias/],
    ['PDV_CASH_EXPORT_TOO_MANY_SESSIONS', /200/],
  ])('mapeia %s (code 22023 no details)', (code, message) => {
    expect(mapPdvCashExportError({ code: '22023', message: 'x', details: code }).message).toMatch(message);
  });
  it('mapeia permissão, caixa aberto e erro desconhecido', () => {
    expect(mapPdvCashExportError({ code: '42501', details: 'PDV_CASH_SESSION_FORBIDDEN' }).message).toMatch(/outro operador/);
    expect(mapPdvCashExportError({ code: '42501', details: 'PDV_CASH_HISTORY_FORBIDDEN' }).message).toMatch(/histórico/);
    expect(mapPdvCashExportError({ code: '42501' }).message).toMatch(/permissão/);
    expect(mapPdvCashExportError({ code: 'P0002' }).message).toMatch(/não foi fechado/);
    expect(mapPdvCashExportError({ code: '99999', message: 'boom interno' }).message).not.toMatch(/boom/);
  });
  it('projeta snake para camel', () => {
    const payload = projectPdvCashExportPeriod({
      from: '2026-11-01', to: '2026-11-30', timezone: 'America/Sao_Paulo',
      sessions: [{
        session_id: 'a', terminal_name: 'Caixa', operator_name: 'Ana', opened_at: '2026-11-10T10:00:00Z', closed_at: null,
        opening_amount: '10.5', expected_amount: 1, counted_amount: 1, difference: 0, was_reopened: true,
        sales_summary: { orders_count: 1, cancelled_orders_count: 0, orders_total: 5, by_payment_method: [{ payment_method: 'pix', amount: 5 }] },
        entries: [{ id: 'e', kind: 'sale_payment', direction: 'in', amount: 5, signed_amount: 5, occurred_at: '2026-11-10T10:00:00Z', payment_method: 'pix',
          is_order_primary: true, order_number: 7, items: [{ name: 'X', unit: 'un', quantity: 1, unit_price: 5, discount: 0, total: 5 }] }],
      }],
    });
    const s = payload.sessions[0];
    expect(s.openingAmount).toBe(10.5);
    expect(s.wasReopened).toBe(true);
    expect(s.salesSummary.byPaymentMethod).toEqual([{ paymentMethod: 'pix', amount: 5 }]);
    expect(s.entries[0]).toMatchObject({ paymentMethod: 'pix', orderNumber: 7, isOrderPrimary: true });
    expect(s.entries[0].items[0].unitPrice).toBe(5);
  });
  it('recusa sessão sem id', () => {
    expect(() => projectPdvCashExportSession({})).toThrow();
  });
});
