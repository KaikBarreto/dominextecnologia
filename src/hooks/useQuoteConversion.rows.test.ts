import { describe, it, expect } from 'vitest';
import {
  buildQuoteFeeRow,
  buildQuoteReceivableRows,
  buildQuoteRevenueRow,
} from './useQuoteConversion';
import { resolveSystemCategoryName, type SystemCategoryLike } from '@/lib/finance-system-categories';

/**
 * A aprovação de orçamento gera receita (e a tarifa do recebimento) com a
 * categoria resolvida por PAPEL. Estes testes ligam as duas pontas: a lista de
 * categorias RENOMEADAS da empresa entra, e o payload que vai pro banco tem
 * que sair com o nome NOVO. Se alguém rechumbar o literal, quebra aqui.
 */

const seeded: SystemCategoryLike[] = [
  { id: 'c1', name: 'Tarifas e Taxas', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true },
  { id: 'c4', name: 'Vendas de Serviços', type: 'entrada', dre_group: 'opex', is_system: true, is_active: true },
];

const renomeadas: SystemCategoryLike[] = [
  { id: 'c1', name: 'Taxas da maquininha', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true },
  { id: 'c4', name: 'Receita de serviços', type: 'entrada', dre_group: 'opex', is_system: true, is_active: true },
];

const plan = [
  { number: 1, date: '2026-10-05', amount: 500 },
  { number: 2, date: '2026-11-05', amount: 500 },
];

const base = {
  quoteNumber: 1042,
  customerId: 'cus-1',
  costCenterId: 'cc-obra',
  createdBy: 'u-1',
  companyId: 'co-1',
};

describe('aprovação de orçamento: categoria vem do papel, não do literal', () => {
  it('"vou receber depois": empresa que nunca renomeou gera o nome de sempre', () => {
    const rows = buildQuoteReceivableRows({
      ...base,
      plan,
      revenueCategory: resolveSystemCategoryName(seeded, 'service_revenue'),
      expectedAccountId: 'acc-1',
      notes: null,
      groupId: 'grp-1',
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.category === 'Vendas de Serviços')).toBe(true);
  });

  it('"vou receber depois": DEPOIS de renomeada, TODAS as parcelas usam o nome novo', () => {
    const rows = buildQuoteReceivableRows({
      ...base,
      plan,
      revenueCategory: resolveSystemCategoryName(renomeadas, 'service_revenue'),
      expectedAccountId: 'acc-1',
      notes: null,
      groupId: 'grp-1',
    });
    expect(rows.every((r) => r.category === 'Receita de serviços')).toBe(true);
    // O resto do contrato da parcela não pode mudar por causa do rename.
    expect(rows[0].installment_number).toBe(1);
    expect(rows[1].installment_total).toBe(2);
    expect(rows[0].cost_center_id).toBe('cc-obra');
    expect(rows[0].transaction_date).toBe('2026-10-05');
    expect(rows[0].is_paid).toBe(false);
    expect(rows[0].description).toBe('Orçamento #1042 (1/2)');
  });

  it('parcela única não ganha marcação de parcelamento (regressão do badge "1/1")', () => {
    const rows = buildQuoteReceivableRows({
      ...base,
      plan: [{ number: 1, date: '2026-10-05', amount: 1000 }],
      revenueCategory: resolveSystemCategoryName(renomeadas, 'service_revenue'),
      notes: null,
      groupId: null,
    });
    expect(rows[0].description).toBe('Orçamento #1042');
    expect(rows[0].installment_number).toBeNull();
    expect(rows[0].installment_group_id).toBeNull();
  });

  it('"já recebi": receita nasce com o nome ATUAL da categoria de venda', () => {
    const row = buildQuoteRevenueRow({
      ...base,
      amount: 1000,
      revenueCategory: resolveSystemCategoryName(renomeadas, 'service_revenue'),
      accountId: 'acc-1',
      paymentMethod: 'pix',
      paidDate: '2026-09-19',
      notes: null,
    });
    expect(row.category).toBe('Receita de serviços');
    expect(row.is_paid).toBe(true);
    expect(row.transaction_date).toBe('2026-09-19');
    expect(row.cost_center_id).toBe('cc-obra');
  });

  it('"já recebi": tarifa nasce com o nome ATUAL da categoria de tarifa', () => {
    const row = buildQuoteFeeRow({
      ...base,
      feeAmount: 29.9,
      feeCategory: resolveSystemCategoryName(renomeadas, 'receipt_fee'),
      accountId: 'acc-1',
      paymentMethod: 'pix',
      paidDate: '2026-09-19',
      revenueId: 'txn-receita',
    });
    expect(row.category).toBe('Taxas da maquininha');
    expect(row.transaction_type).toBe('saida');
    // A tarifa segue sendo filha da receita e do MESMO centro de custo.
    expect(row.parent_transaction_id).toBe('txn-receita');
    expect(row.cost_center_id).toBe('cc-obra');
  });

  it('empresa sem a categoria cadastrada continua caindo no nome de semente', () => {
    const row = buildQuoteFeeRow({
      ...base,
      feeAmount: 10,
      feeCategory: resolveSystemCategoryName([], 'receipt_fee'),
      accountId: 'acc-1',
      paidDate: '2026-09-19',
      revenueId: 'txn-receita',
    });
    expect(row.category).toBe('Tarifas e Taxas');
  });

  it('string vazia vinda do form vira null (senão é erro de FK no banco)', () => {
    const row = buildQuoteRevenueRow({
      ...base,
      customerId: '',
      costCenterId: '',
      amount: 100,
      revenueCategory: 'Receita de serviços',
      accountId: 'acc-1',
      paidDate: '2026-09-19',
      notes: null,
    });
    expect(row.customer_id).toBeNull();
    expect(row.cost_center_id).toBeNull();
  });
});
