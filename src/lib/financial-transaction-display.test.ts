import { describe, expect, it } from 'vitest';
import {
  buildReceiptBreakdowns,
  matchesFinancialTransactionSearch,
  type ReceiptBreakdownTransaction,
} from './financial-transaction-display';

const formatBRL = (amount: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(amount);

describe('matchesFinancialTransactionSearch', () => {
  const transaction = {
    description: 'Manutencao preventiva',
    category: 'Servicos',
    amount: 1250.5,
    customer: { name: 'Climatizacao Sao Jose' },
  };

  it('mantem descricao e categoria pesquisaveis', () => {
    expect(matchesFinancialTransactionSearch(transaction, 'preventiva', formatBRL)).toBe(true);
    expect(matchesFinancialTransactionSearch(transaction, 'servicos', formatBRL)).toBe(true);
  });

  it('localiza pelo nome do cliente vinculado ignorando acentos', () => {
    expect(matchesFinancialTransactionSearch(transaction, 'climatização são josé', formatBRL)).toBe(true);
  });

  it('localiza pelo valor cru e pelo valor monetario formatado', () => {
    expect(matchesFinancialTransactionSearch(transaction, '1250', formatBRL)).toBe(true);
    expect(matchesFinancialTransactionSearch(transaction, '1.250,50', formatBRL)).toBe(true);
  });

  it('nao casa campos ausentes nem outro valor', () => {
    expect(matchesFinancialTransactionSearch(transaction, '999,99', formatBRL)).toBe(false);
    expect(matchesFinancialTransactionSearch({ ...transaction, customer: null }, 'sao jose', formatBRL)).toBe(false);
  });
});

const tx = (
  partial: Partial<ReceiptBreakdownTransaction> & Pick<ReceiptBreakdownTransaction, 'id'>,
): ReceiptBreakdownTransaction => ({
  amount: 0,
  transaction_type: 'entrada',
  is_paid: true,
  ...partial,
});

describe('buildReceiptBreakdowns', () => {
  it('soma tarifa direta e calcula o liquido em centavos', () => {
    const root = tx({ id: 'receber-1', amount: 100.1 });
    const fee = tx({
      id: 'taxa-1',
      amount: 2.03,
      transaction_type: 'saida',
      description: 'Tarifa do recebimento — OS 10',
      parent_transaction_id: root.id,
    });

    expect(buildReceiptBreakdowns([root], [root, fee]).get(root.id)).toEqual({
      gross: 100.1,
      fee: 2.03,
      net: 98.07,
    });
  });

  it('rastreia e soma tarifas netas de recebimentos parciais', () => {
    const root = tx({ id: 'receber-2', amount: 300 });
    const partialOne = tx({ id: 'parcial-1', amount: 100, parent_transaction_id: root.id });
    const partialTwo = tx({ id: 'parcial-2', amount: 200, parent_transaction_id: root.id });
    const feeOne = tx({
      id: 'taxa-2', amount: 1.25, transaction_type: 'saida',
      description: 'Tarifa de recebimento (Asaas) — parcela 1', parent_transaction_id: partialOne.id,
    });
    const feeTwo = tx({
      id: 'taxa-3', amount: 2.5, transaction_type: 'saida',
      description: 'Tarifa do recebimento — parcela 2', parent_transaction_id: partialTwo.id,
    });

    expect(buildReceiptBreakdowns(
      [root],
      [root, partialOne, partialTwo, feeOne, feeTwo],
    ).get(root.id)).toEqual({ gross: 300, fee: 3.75, net: 296.25 });
  });

  it('encontra tarifa Asaas pela cobranca mesmo quando ela nao tem parent_transaction_id', () => {
    const root = tx({ id: 'receber-3', amount: 175, tenant_charge_id: 'charge-1' });
    const fee = tx({
      id: 'taxa-4', amount: 0.99, transaction_type: 'saida',
      description: 'Tarifa de recebimento (Asaas) — cobrança #charge-1',
      tenant_charge_id: 'charge-1', parent_transaction_id: null,
    });

    expect(buildReceiptBreakdowns([root], [root, fee]).get(root.id)).toEqual({
      gross: 175,
      fee: 0.99,
      net: 174.01,
    });
  });

  it('mostra taxa zero sem confundir CMV vinculado com tarifa', () => {
    const root = tx({ id: 'receber-4', amount: 90 });
    const cmv = tx({
      id: 'cmv', amount: 40, transaction_type: 'saida',
      description: 'CSP Materiais — Orcamento 9', parent_transaction_id: root.id,
    });
    const unpaidFee = tx({
      id: 'taxa-pendente', amount: 3, transaction_type: 'saida', is_paid: false,
      description: 'Tarifa do recebimento — pendente', parent_transaction_id: root.id,
    });

    expect(buildReceiptBreakdowns([root], [root, cmv, unpaidFee]).get(root.id)).toEqual({
      gross: 90,
      fee: 0,
      net: 90,
    });
  });

  it('nao mistura tarifas de outra conta ou cobranca', () => {
    const root = tx({ id: 'receber-5', amount: 500, tenant_charge_id: 'charge-a' });
    const foreignFee = tx({
      id: 'taxa-externa', amount: 99, transaction_type: 'saida',
      description: 'Tarifa de recebimento (Asaas)', tenant_charge_id: 'charge-b',
    });

    expect(buildReceiptBreakdowns([root], [root, foreignFee]).get(root.id)?.fee).toBe(0);
  });
});
