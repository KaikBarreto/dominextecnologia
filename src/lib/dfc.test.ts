import { describe, expect, it } from 'vitest';

import {
  calculateDfc,
  DFC_GROUP_KEYS,
  DFC_UNCLASSIFIED_FALLBACK,
  type DfcTransaction,
} from './dfc';

function movement(overrides: Partial<DfcTransaction> = {}): DfcTransaction {
  return {
    id: 'txn',
    transaction_type: 'entrada',
    amount: 100,
    is_paid: true,
    paid_date: '2026-09-15',
    transfer_pair_id: null,
    cancelled_at: null,
    category: 'Receitas',
    dfc_group: 'operacional',
    ...overrides,
  };
}

describe('calculateDfc — metodo direto', () => {
  it('fecha saldo inicial, tres fluxos, variacao e saldo final', () => {
    const operationalEntry = movement({ id: 'op-in', amount: 500, category: 'Vendas' });
    const operationalExit = movement({
      id: 'op-out',
      transaction_type: 'saida',
      amount: 100,
      category: 'Fornecedores',
    });
    const investmentExit = movement({
      id: 'inv-out',
      transaction_type: 'saida',
      amount: 300,
      category: 'Equipamentos',
      dfc_group: 'investimento',
    });
    const financingEntry = movement({
      id: 'fin-in',
      amount: 200,
      category: 'Capital dos socios',
      dfc_group: 'financiamento',
    });

    const result = calculateDfc(
      [
        movement({ id: 'opening-in', amount: 1_000, paid_date: '2026-08-01' }),
        movement({
          id: 'opening-out',
          transaction_type: 'saida',
          amount: 200,
          paid_date: '2026-08-31',
        }),
        operationalEntry,
        operationalExit,
        investmentExit,
        financingEntry,
      ],
      { from: '2026-09-01', to: '2026-09-30' },
    );

    expect(result.openingBalance).toBe(800);
    expect(result.netChange).toBe(300);
    expect(result.closingBalance).toBe(1_100);
    expect(result.groups.map(({ key, total }) => ({ key, total }))).toEqual([
      { key: 'operacional', total: 400 },
      { key: 'investimento', total: -300 },
      { key: 'financiamento', total: 200 },
    ]);
    expect(result.groups[0].categories).toEqual([
      { name: 'Vendas', total: 500, transactions: [operationalEntry] },
      { name: 'Fornecedores', total: -100, transactions: [operationalExit] },
    ]);
  });

  it('considera somente caixa realizado e exclui transferencias internas e cancelados', () => {
    const valid = movement({ id: 'valid', amount: 90 });
    const result = calculateDfc(
      [
        valid,
        movement({ id: 'unpaid', amount: 10, is_paid: false }),
        movement({ id: 'without-paid-date', amount: 20, paid_date: null }),
        movement({ id: 'transfer', amount: 30, transfer_pair_id: 'pair-1' }),
        movement({ id: 'cancelled', amount: 40, cancelled_at: '2026-09-16T10:00:00Z' }),
        movement({ id: 'invalid-amount', amount: 'valor-invalido' }),
        movement({ id: 'after-range', amount: 50, paid_date: '2026-10-01' }),
      ],
      { from: '2026-09-01', to: '2026-09-30' },
    );

    expect(result.netChange).toBe(90);
    expect(result.closingBalance).toBe(90);
    expect(result.groups[0].categories[0].transactions).toEqual([valid]);
  });

  it('conta pagamento parcial de fatura pela conta pagadora e nunca duplica as compras do cartao', () => {
    const partialPayment = movement({
      id: 'bill-payment-out',
      transaction_type: 'saida',
      amount: 300,
      category: 'Pagamento de Fatura',
      transfer_pair_id: 'bill-pair',
      bill_id: 'bill-1',
    });

    const result = calculateDfc([
      // A compra pode estar pendente ou quitada: em ambos os casos não é caixa.
      movement({
        id: 'card-purchase-paid',
        transaction_type: 'saida',
        amount: 1_000,
        category: 'Materiais',
        credit_card_bill_date: '2026-09-01',
      }),
      movement({
        id: 'card-purchase-open',
        transaction_type: 'saida',
        amount: 500,
        is_paid: false,
        paid_date: null,
        category: 'Combustível',
        credit_card_bill_date: '2026-09-01',
      }),
      partialPayment,
      // Perna de entrada no cartão: recompõe limite, não é entrada de caixa.
      movement({
        id: 'bill-payment-card-leg',
        transaction_type: 'entrada',
        amount: 300,
        category: 'Pagamento de Fatura',
        transfer_pair_id: 'bill-pair',
        bill_id: 'bill-1',
      }),
    ]);

    expect(result.netChange).toBe(-300);
    expect(result.groups[0].categories).toEqual([
      { name: 'Pagamento de Fatura', total: -300, transactions: [partialPayment] },
    ]);
  });

  it('usa fallback operacional explicito sem inferir classificacao pelo nome', () => {
    const result = calculateDfc([
      movement({
        id: 'classified-op',
        category: 'Investimentos e maquinas',
        amount: 100,
        dfc_group: 'operacional',
      }),
      movement({
        id: 'unclassified',
        category: 'Aporte e financiamento',
        amount: 200,
        dfc_group: null,
      }),
      movement({
        id: 'invalid-runtime-value',
        category: 'Outra',
        amount: 300,
        dfc_group: 'grupo-invalido',
      }),
    ]);

    expect(DFC_UNCLASSIFIED_FALLBACK).toBe('operacional');
    expect(result.groups[0].total).toBe(600);
    expect(result.groups[1].total).toBe(0);
    expect(result.groups[2].total).toBe(0);
  });

  it('sem data inicial mantem saldo inicial zero; sem limites inclui todo o realizado', () => {
    const history = [
      movement({ id: 'old', amount: 100, paid_date: '2025-01-01' }),
      movement({ id: 'current', amount: 200, paid_date: '2026-09-01' }),
      movement({ id: 'future', amount: 400, paid_date: '2027-01-01' }),
    ];

    expect(calculateDfc(history)).toMatchObject({
      openingBalance: 0,
      netChange: 700,
      closingBalance: 700,
    });
    expect(calculateDfc(history, { to: '2026-12-31' })).toMatchObject({
      openingBalance: 0,
      netChange: 300,
      closingBalance: 300,
    });
    expect(calculateDfc(history, { from: '2026-01-01' })).toMatchObject({
      openingBalance: 100,
      netChange: 600,
      closingBalance: 700,
    });
  });

  it('incorpora o saldo-base das contas ao saldo inicial e ao fechamento', () => {
    const result = calculateDfc(
      [
        movement({ id: 'before', amount: 200, paid_date: '2026-08-20' }),
        movement({ id: 'inside', transaction_type: 'saida', amount: 50 }),
      ],
      { from: '2026-09-01', to: '2026-09-30' },
      1_000,
    );

    expect(result).toMatchObject({
      openingBalance: 1_200,
      netChange: -50,
      closingBalance: 1_150,
    });
  });

  it('soma em centavos e devolve sempre os tres grupos na ordem canonica', () => {
    const result = calculateDfc([
      movement({ id: 'decimal-a', amount: 0.1 }),
      movement({ id: 'decimal-b', amount: 0.2 }),
      movement({ id: 'round-cent', amount: 10.005 }),
      movement({ id: 'legacy-negative-exit', transaction_type: 'saida', amount: -1 }),
    ]);

    expect(result.netChange).toBe(9.31);
    expect(result.groups.map((group) => group.key)).toEqual(DFC_GROUP_KEYS);
  });

  it('rejeita range invalido em vez de produzir um relatorio silenciosamente errado', () => {
    expect(() => calculateDfc([], { from: '2026-02-30' })).toThrow(TypeError);
    expect(() => calculateDfc([], { from: '2026-10-01', to: '2026-09-30' })).toThrow(RangeError);
  });
});
