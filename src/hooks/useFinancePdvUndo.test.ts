import { describe, expect, it } from 'vitest';
import { isPdvFinancialRow, parsePdvUndoPlan, pdvUndoErrorMessage } from './useFinancePdvUndo';
import { mapPdvOrderCancellationError } from '@/lib/pdv/orderCancellation';

describe('excluir pelo Financeiro um lançamento do PDV', () => {
  it('manda pro desfazer do PDV só o que veio do PDV', () => {
    expect(isPdvFinancialRow({ origin: 'pdv' })).toBe(true);
    expect(isPdvFinancialRow({ origin: 'geral', pdv_financial_role: 'pdv_receivable_settlement' })).toBe(true);
    expect(isPdvFinancialRow({ origin: 'geral', pdv_cash_session_id: 'x' })).toBe(true);
    // A "VENDA GAS" lançada à mão segue a exclusão comum do Financeiro.
    expect(isPdvFinancialRow({ origin: 'geral', pdv_financial_role: null, pdv_settlement_group_id: null })).toBe(false);
    expect(isPdvFinancialRow(null)).toBe(false);
  });

  it('lê o plano do servidor sem quebrar com campos ausentes', () => {
    const plan = parsePdvUndoPlan({
      transaction_id: 't1', path: 'cancel_order', allowed: true, already_done: false,
      order_number: 4, effects: ['stock_returned', 'finance_cancelled', 'drawer_returned'],
    });
    expect(plan).toMatchObject({ path: 'cancel_order', allowed: true, orderNumber: 4 });
    expect(plan.effects).toEqual(['stock_returned', 'finance_cancelled', 'drawer_returned']);
    expect(parsePdvUndoPlan(null)).toMatchObject({ allowed: false, path: 'unsupported', orderNumber: null });
  });

  it('mostra a recusa do servidor em vez da tradução genérica do SQLSTATE', () => {
    const message = 'Esta sobra ou falta faz parte do fechamento do caixa e não pode ser excluída.';
    expect(pdvUndoErrorMessage({ code: '55000', message, details: 'code=pdv_finance_undo_closing_adjustment' })).toBe(message);
  });

  it('cancelamento pela lista de pedidos mostra o motivo da recusa', () => {
    const message = 'Esta venda tem devolução registrada. Desfaça pelo pós-venda.';
    expect(mapPdvOrderCancellationError({ code: '55000', message, details: 'code=pdv_order_cancel_has_return' }).message).toBe(message);
  });
});
