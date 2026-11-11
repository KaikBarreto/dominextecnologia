import { describe, expect, it } from 'vitest';
import { projectPdvCashV2SessionDetail } from './usePdvCashSessionDetailV2';

const VALID = {
  session_id: '10000000-0000-4000-8000-000000000001',
  position: '140.25',
  opening_amount: 100,
  cash_receipts: 75.25,
  cash_payments: 10,
  supplies: 5,
  withdrawals: 20,
  refunds: 10,
  entries: [
    {
      id: '10000000-0000-4000-8000-000000000002',
      kind: 'cash_receipt',
      amount: '75.25',
      created_at: '2026-11-07T12:00:00.000Z',
      created_by: null,
      source_type: 'financial_transaction',
      source_id: '10000000-0000-4000-8000-000000000003',
      reversal_of_id: null,
      description: 'Recebimento no balcão',
      notes: null,
      payment_method: 'dinheiro',
      transaction_type: 'entrada',
      financial_transaction_id: '10000000-0000-4000-8000-000000000003',
      order_id: '10000000-0000-4000-8000-000000000004',
    },
  ],
};

describe('projectPdvCashV2SessionDetail', () => {
  it('projeta a posição e o livro assinado sem perder os vínculos seguros', () => {
    const result = projectPdvCashV2SessionDetail(VALID);

    expect(result.position).toBe(140.25);
    expect(result.cashPayments).toBe(10);
    expect(result.entries[0]).toMatchObject({
      kind: 'cash_receipt',
      amount: 75.25,
      sourceType: 'financial_transaction',
      transactionType: 'entrada',
      orderId: '10000000-0000-4000-8000-000000000004',
    });
  });

  it('falha fechado quando o servidor devolve kind desconhecido', () => {
    expect(() => projectPdvCashV2SessionDetail({
      ...VALID,
      entries: [{ ...VALID.entries[0], kind: 'manual_unsafe' }],
    })).toThrow('tipo de movimento inválido');
  });

  it('falha fechado quando a coleção de movimentos não é uma lista', () => {
    expect(() => projectPdvCashV2SessionDetail({ ...VALID, entries: null }))
      .toThrow('movimentos do caixa em formato inválido');
  });
});
