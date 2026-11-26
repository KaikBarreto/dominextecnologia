import { describe, expect, it } from 'vitest';
import { selectFinancialOverviewSources, summarizeFinancialTransactions, type FinancialSummaryTransaction } from './financial-summary';
import { calculateDfc, type DfcTransaction } from './dfc';
import { isPdvRoleExcludedFromDre } from './dre-regime';
const principal: FinancialSummaryTransaction = { transaction_type: 'saida', amount: 100, amount_received: 100,
  is_paid: true, transfer_pair_id: null, pdv_financial_role: 'pdv_supplier_obligation' };
const child = { ...principal, amount: 60, pdv_financial_role: 'pdv_supplier_payment' };
describe('fontes de valor na compra com crédito do fornecedor', () => {
  it('alimenta o resumo real com pagamento filho preservando a regra das demais raízes', () => {
    const rows = [
      { ...principal, id: 'obrigacao', parent_transaction_id: null },
      { ...child, id: 'dinheiro', parent_transaction_id: 'obrigacao' },
      { ...child, id: 'outra-filha', parent_transaction_id: 'outra-mae', pdv_financial_role: null },
      { ...principal, id: 'raiz-antiga', amount: 10, pdv_financial_role: null },
    ];
    const selected = selectFinancialOverviewSources(rows);
    expect(selected.map(row => row.id)).toEqual(['obrigacao', 'dinheiro', 'raiz-antiga']);
    expect(summarizeFinancialTransactions(selected)).toMatchObject({ totalSaidas: 70, saldo: -70, aPagar: 0 });
  });
  it('compra 100, saldo 40 e dinheiro 60 mantêm dinheiro 60 e pendência zero', () => {
    expect(summarizeFinancialTransactions([principal, child])).toEqual({ totalEntradas: 0, totalSaidas: 60, saldo: -60, aPagar: 0, aReceber: 0 });
  });
  it('compensação explícita do crédito reabre apenas 40 sem novo movimento monetário', () => {
    expect(summarizeFinancialTransactions([{ ...principal, amount_received: 60, is_paid: false }, child])).toMatchObject({ totalSaidas: 60, saldo: -60, aPagar: 40 });
  });
  it('saldo integral quita 100 sem fabricar pagamento e sem receita', () => {
    expect(summarizeFinancialTransactions([principal])).toEqual({ totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 });
  });
  it('preserva receitas, despesas, pendências e transferências dos papéis antigos', () => {
    expect(summarizeFinancialTransactions([
      { ...principal, pdv_financial_role: null }, { ...principal, pdv_financial_role: null, amount: 20, is_paid: false },
      { ...principal, pdv_financial_role: 'pdv_receivable_settlement', transaction_type: 'entrada', amount: 150 },
      { ...principal, pdv_financial_role: null, transfer_pair_id: 'pair', amount: 900 },
    ])).toEqual({ totalEntradas: 150, totalSaidas: 100, saldo: 50, aPagar: 20, aReceber: 0 });
  });
  it.each([undefined, null, NaN, Infinity, -1, 101])('não anuncia saldo zero para obrigação com valor recebido inválido: %s', amount_received => {
    expect(() => summarizeFinancialTransactions([{ ...principal, amount_received }])).toThrow('conferir');
  });
  it('DFC geral recebe somente a parcela monetária; DRE conserva principal sem duplicar aquisição', () => {
    const rows: DfcTransaction[] = [
      { id: 'principal', transaction_type: 'saida', amount: 100, is_paid: true, paid_date: '2026-11-16', pdv_financial_role: 'pdv_supplier_obligation' },
      { id: 'child', transaction_type: 'saida', amount: 60, is_paid: true, paid_date: '2026-11-16', pdv_financial_role: 'pdv_supplier_payment' },
    ];
    const dfc = calculateDfc(rows, { from: '2026-11-01', to: '2026-11-30' }, 0);
    expect(dfc.netChange).toBe(-60);
    expect(rows.filter(row => !isPdvRoleExcludedFromDre(row.pdv_financial_role, 'competencia')).reduce((sum, row) => sum + Number(row.amount), 0)).toBe(100);
  });
});

describe('conta recebida em partes', () => {
  const parent = { id: 'conta', transaction_type: 'entrada', amount: 700, amount_received: 0, is_paid: false, transfer_pair_id: null };
  it.each([[300, 400], [600, 100], [700, 0]])('preserva dívida de 700, recebido %s e pendente %s sem dupla contagem', (received, open) => {
    const root = { ...parent, amount_received: received, is_paid: open === 0 };
    const payments = (received === 300 ? [300] : received === 600 ? [300, 300] : [300, 300, 100])
      .map((amount, i) => ({ ...parent, id: `pagamento-${i}`, parent_transaction_id: root.id, category: 'Recebimento parcial', is_paid: true, amount, amount_received: 0 }));
    const selected = selectFinancialOverviewSources([root, ...payments]);
    expect(selected).toHaveLength(payments.length + 1);
    expect(summarizeFinancialTransactions(selected)).toMatchObject({ totalEntradas: received, aReceber: open, saldo: received });
    expect(summarizeFinancialTransactions([root, ...payments])).toMatchObject({ totalEntradas: received, aReceber: open });
    const fee = { ...parent, id: 'fee', parent_transaction_id: payments[0].id, transaction_type: 'saida', amount: 5, is_paid: true, description: 'Tarifa do recebimento — OS #123' };
    expect(summarizeFinancialTransactions(selectFinancialOverviewSources([root, ...payments, fee])))
      .toMatchObject({ totalEntradas: received, totalSaidas: 5, saldo: received - 5, aReceber: open });
  });
  it('estornar uma baixa reabre só esse saldo e exclui o pagamento cancelado', () => {
    const root = { ...parent, amount_received: 300 };
    const partial = { ...parent, amount: 300, is_paid: true, parent_transaction_id: 'conta' };
    expect(summarizeFinancialTransactions([root, partial, { ...partial, cancelled_at: '2026-11-26' }]))
      .toMatchObject({ totalEntradas: 300, aReceber: 400 });
  });
});
