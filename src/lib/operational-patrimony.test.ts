import { describe, expect, it } from 'vitest';
import type { FinancialTransaction } from '@/types/database';
import { calculateOperationalPatrimony } from './operational-patrimony';

const transaction = (
  id: string,
  overrides: Partial<FinancialTransaction> = {},
): FinancialTransaction => ({
  id,
  transaction_type: 'entrada',
  description: id,
  amount: 100,
  transaction_date: '2026-09-01',
  is_paid: false,
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T12:00:00Z',
  ...overrides,
});

describe('calculateOperationalPatrimony', () => {
  it('reúne caixa, bancos, recebíveis, estoque, contas e cartão sem duplicar a fatura', () => {
    const result = calculateOperationalPatrimony({
      accounts: [
        { id: 'cash', type: 'caixa' },
        { id: 'bank-positive', type: 'banco' },
        { id: 'bank-negative', type: 'banco' },
        { id: 'card', type: 'cartao' },
      ],
      balances: { cash: 100, 'bank-positive': 500, 'bank-negative': -50, card: -999 },
      transactions: [
        transaction('receivable', { amount: 1_000, amount_received: 200 }),
        transaction('payable', { transaction_type: 'saida', amount: 300 }),
        transaction('card-purchase', {
          transaction_type: 'saida',
          amount: 400,
          credit_card_bill_date: '2026-10-01',
        }),
        transaction('cancelled', { amount: 9_999, cancelled_at: '2026-09-02T10:00:00Z' }),
        transaction('paid', { amount: 9_999, is_paid: true }),
      ],
      cardBills: [{ status: 'partial', total_amount: 500, amount_paid: 100 }],
      stockSaleValue: 2_000,
    });

    expect(result).toEqual({
      cashBalance: 100,
      bankBalance: 450,
      receivables: 800,
      payables: 700,
      cardDebt: 400,
      stockValue: 2_000,
      assets: 3_350,
      liabilities: 700,
      result: 2_650,
    });
  });

  it('trata saldo bancário consolidado negativo como obrigação', () => {
    const result = calculateOperationalPatrimony({
      accounts: [{ id: 'bank', type: 'banco' }],
      balances: { bank: -125.35 },
      transactions: [],
      cardBills: [],
      stockSaleValue: 0,
    });

    expect(result.bankBalance).toBe(-125.35);
    expect(result.assets).toBe(0);
    expect(result.liabilities).toBe(125.35);
    expect(result.result).toBe(-125.35);
  });
});
