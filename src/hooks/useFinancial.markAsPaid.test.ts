import { describe, it, expect } from 'vitest';
import { buildPartialReceiptRow, buildReceiptFeeRow } from './useFinancial';

/**
 * Baixa de recebimento cria LINHAS FILHAS (recebimento parcial e tarifa). Se a
 * filha nasce sem o `cost_center_id` da mãe, a receita cai na obra e a tarifa
 * cai em "sem centro" — a quebra por centro de custo passa a mentir em
 * silêncio, sem erro nenhum na tela.
 *
 * O bug clássico aqui é a mãe vir de um `.select(...)` que NÃO pediu
 * `cost_center_id`: o campo chega `undefined` e a herança vira no-op. Por isso
 * os testes checam `null` explícito, nunca `undefined` nem `''`.
 */
const parent = {
  id: 'txn-mae',
  company_id: 'co-1',
  description: 'Orçamento #1042',
  due_date: '2026-03-10',
  customer_id: 'cus-1',
  cost_center_id: 'cc-obra-shopping',
};

describe('buildPartialReceiptRow', () => {
  it('filha do recebimento parcial herda o centro de custo da mãe', () => {
    const row = buildPartialReceiptRow({
      parent,
      cfg: { amountReceived: 400, account_id: 'acc-1', payment_method: 'pix' },
      paidDate: '2026-03-05',
      createdBy: 'u-1',
    });

    expect(row.cost_center_id).toBe('cc-obra-shopping');
    expect(row.parent_transaction_id).toBe('txn-mae');
    expect(row.company_id).toBe('co-1');
    expect(row.amount).toBe(400);
    expect(row.transaction_type).toBe('entrada');
    // O caixa moveu na data do pagamento, não no vencimento da mãe.
    expect(row.transaction_date).toBe('2026-03-05');
    expect(row.due_date).toBe('2026-03-10');
    expect(row.is_paid).toBe(true);
  });

  it('mãe sem centro produz filha com null (não undefined, não string vazia)', () => {
    const row = buildPartialReceiptRow({
      parent: { id: 'txn-mae', company_id: 'co-1' },
      cfg: { amountReceived: 100 },
      paidDate: '2026-03-05',
    });

    expect(row.cost_center_id).toBeNull();
    expect(row.cost_center_id).not.toBeUndefined();
    expect('cost_center_id' in row).toBe(true);
  });

  it('string vazia vinda do form vira null (senão é erro de FK no banco)', () => {
    const row = buildPartialReceiptRow({
      parent: { ...parent, cost_center_id: '' },
      cfg: { amountReceived: 100 },
      paidDate: '2026-03-05',
    });

    expect(row.cost_center_id).toBeNull();
  });
});

describe('buildReceiptFeeRow', () => {
  it('quitação total: tarifa herda o centro da mãe', () => {
    const fee = buildReceiptFeeRow({
      parent,
      // Em quitação total a linha de origem é a própria mãe atualizada.
      sourceRow: { id: 'txn-mae', description: parent.description, cost_center_id: parent.cost_center_id },
      cfg: { fee_amount: 12.5, account_id: 'acc-1' },
      paidDate: '2026-03-05',
      companyId: 'co-1',
    });

    expect(fee.cost_center_id).toBe('cc-obra-shopping');
    expect(fee.transaction_type).toBe('saida');
    expect(fee.category).toBe('Tarifas e Taxas');
    expect(fee.parent_transaction_id).toBe('txn-mae');
  });

  it('recebimento parcial: tarifa é filha da FILHA e sai no mesmo centro da mãe', () => {
    const child = buildPartialReceiptRow({
      parent,
      cfg: { amountReceived: 400, account_id: 'acc-1' },
      paidDate: '2026-03-05',
    });
    // Simula o que o banco devolve no `.select('*')` do insert da filha.
    const childRow = { id: 'txn-filha', ...child };

    const fee = buildReceiptFeeRow({
      parent,
      sourceRow: childRow as any,
      cfg: { fee_amount: 4, account_id: 'acc-1' },
      paidDate: '2026-03-05',
      companyId: 'co-1',
    });

    expect(child.cost_center_id).toBe('cc-obra-shopping');
    expect(fee.cost_center_id).toBe(child.cost_center_id);
    // Rastreio preservado: a tarifa pendura no recebimento que a gerou.
    expect(fee.parent_transaction_id).toBe('txn-filha');
  });

  it('linha de origem antiga (sem centro) cai no fallback da mãe', () => {
    const fee = buildReceiptFeeRow({
      parent,
      sourceRow: { id: 'txn-legado', description: 'linha antiga' },
      cfg: { fee_amount: 4 },
      paidDate: '2026-03-05',
      companyId: 'co-1',
    });

    expect(fee.cost_center_id).toBe('cc-obra-shopping');
  });

  it('nem origem nem mãe com centro: null explícito', () => {
    const fee = buildReceiptFeeRow({
      parent: { id: 'txn-mae', company_id: 'co-1' },
      sourceRow: { id: 'txn-mae' },
      cfg: { fee_amount: 4 },
      paidDate: '2026-03-05',
      companyId: 'co-1',
    });

    expect(fee.cost_center_id).toBeNull();
  });
});
