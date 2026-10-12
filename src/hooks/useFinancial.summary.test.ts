import { describe, expect, it } from 'vitest';
import { summarizeFinancialTransactions } from './useFinancial';

type SummaryInput = Parameters<typeof summarizeFinancialTransactions>[0][number];

const row = (overrides: Partial<SummaryInput>): SummaryInput => ({
  transaction_type: 'entrada',
  amount: 0,
  is_paid: false,
  transfer_pair_id: null,
  ...overrides,
});

describe('summarizeFinancialTransactions', () => {
  it('preserva entradas, saídas, contas abertas e saldo do ledger completo', () => {
    const summary = summarizeFinancialTransactions([
      row({ transaction_type: 'entrada', amount: 1_250.55, is_paid: true }),
      row({ transaction_type: 'saida', amount: 250.25, is_paid: true }),
      row({ transaction_type: 'entrada', amount: 800, is_paid: false }),
      row({ transaction_type: 'saida', amount: 300, is_paid: false }),
    ]);

    expect(summary).toEqual({
      totalEntradas: 1_250.55,
      totalSaidas: 250.25,
      saldo: 1_000.3,
      aPagar: 300,
      aReceber: 800,
    });
  });

  it('exclui as duas pernas de transferências internas pelo transfer_pair_id', () => {
    const summary = summarizeFinancialTransactions([
      row({ transaction_type: 'entrada', amount: 10_000, is_paid: true, transfer_pair_id: 'par-1' }),
      row({ transaction_type: 'saida', amount: 10_000, is_paid: true, transfer_pair_id: 'par-1' }),
      row({ transaction_type: 'entrada', amount: 500, is_paid: true }),
    ]);

    expect(summary.totalEntradas).toBe(500);
    expect(summary.totalSaidas).toBe(0);
    expect(summary.saldo).toBe(500);
  });

  it('mantém filhas pagas e tarifas no caixa sem reduzir a mãe ainda aberta', () => {
    const summary = summarizeFinancialTransactions([
      // Mãe segue em aberto pelo valor integral: mesma semântica histórica.
      row({ transaction_type: 'entrada', amount: 1_000, is_paid: false }),
      // Filha de recebimento parcial é dinheiro efetivamente recebido.
      row({ transaction_type: 'entrada', amount: 400, is_paid: true }),
      // Tarifa filha é uma saída real e precisa reduzir o saldo.
      row({ transaction_type: 'saida', amount: 8.5, is_paid: true }),
    ]);

    expect(summary).toEqual({
      totalEntradas: 400,
      totalSaidas: 8.5,
      saldo: 391.5,
      aPagar: 0,
      aReceber: 1_000,
    });
  });
});
