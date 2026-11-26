import { describe, expect, it } from 'vitest';
import { accountSettlementRoute, isPdvFinancialRow, withoutCancelledAccounts } from './finance-pdv-rows';

const fiado = { id: 'r1', origin: 'pdv', pdv_financial_role: 'pdv_receivable_principal', transaction_type: 'entrada',
  customer_id: 'customer-1', is_paid: false, cancelled_at: null };

describe('linhas do PDV na tela de Contas', () => {
  it('reconhece a linha do PDV por qualquer um dos vínculos', () => {
    expect(isPdvFinancialRow({ origin: 'pdv' })).toBe(true);
    expect(isPdvFinancialRow({ origin: 'geral', pdv_financial_role: 'pdv_receivable_settlement' })).toBe(true);
    expect(isPdvFinancialRow({ origin: 'geral', pdv_cash_session_id: 'x' })).toBe(true);
    expect(isPdvFinancialRow({ origin: 'geral', pdv_settlement_group_id: 'g' })).toBe(true);
    expect(isPdvFinancialRow({ origin: 'geral', pdv_financial_role: null, pdv_settlement_group_id: null })).toBe(false);
    expect(isPdvFinancialRow(null)).toBe(false);
  });

  it('conta de venda cancelada não é conta a receber: sai da lista, aberta ou já recebida', () => {
    const rows: Array<{ id: string; cancelled_at?: string | null; [field: string]: unknown }> = [
      fiado,
      // Pedido nº 20 da V Sabrina: fiado de R$ 195 vencido, de uma venda cancelada.
      { ...fiado, id: 'r2', cancelled_at: '2026-11-25T20:43:49Z' },
      { ...fiado, id: 'r3', is_paid: true, cancelled_at: '2026-11-25T20:43:49Z' },
      { id: 'r4', origin: 'geral', transaction_type: 'saida', is_paid: false },
    ];
    expect(withoutCancelledAccounts(rows).map(row => row.id)).toEqual(['r1', 'r4']);
    expect(withoutCancelledAccounts(undefined)).toBeUndefined();
  });

  it('manda o recebimento do fiado do PDV para a conta do cliente, nunca para a edição direta', () => {
    expect(accountSettlementRoute(fiado)).toEqual({ kind: 'pdv_customer_account', customerId: 'customer-1' });
    const customerBalance = { ...fiado, payment_method: 'saldo_cliente' };
    expect(accountSettlementRoute(customerBalance)).toEqual({ kind: 'pdv_customer_account', customerId: 'customer-1' });
  });

  it('linha do PDV sem cliente não tem baixa pelo Financeiro', () => {
    expect(accountSettlementRoute({ ...fiado, customer_id: null })).toEqual({ kind: 'pdv_unavailable' });
    expect(accountSettlementRoute({ ...fiado, transaction_type: 'saida' })).toEqual({ kind: 'pdv_unavailable' });
  });

  it('conta comum continua com a baixa do Financeiro', () => {
    const receivable = { id: 'x', origin: 'geral', transaction_type: 'entrada', customer_id: 'customer-1' };
    const payable = { id: 'y', origin: null, transaction_type: 'saida' };
    expect(accountSettlementRoute(receivable)).toEqual({ kind: 'finance' });
    expect(accountSettlementRoute(payable)).toEqual({ kind: 'finance' });
  });
});
