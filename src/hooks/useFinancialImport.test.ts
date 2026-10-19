import { describe, it, expect } from 'vitest';
import { buildFinancialImportPayload, isFinancialImportRowSendable } from './useFinancialImport';
import type { ParsedRow } from '@/utils/financialImport/parseSheet';

/**
 * `buildFinancialImportPayload` é a ponte PURA entre o que `parseSheet.ts`
 * devolve (camelCase) e o que o contrato das RPCs espera (`p_rows`,
 * snake_case). Linha estruturalmente quebrada (data/tipo/valor/descrição
 * ausentes) NUNCA é enviada — o contrato não tem status de resolução pra
 * esses 4 campos, só pra categoria/conta/centro de custo/forma de
 * pagamento/contraparte.
 */
function makeRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowNumber: 2,
    state: 'ready',
    issues: [],
    date: '2026-10-18',
    dueDate: null,
    type: 'saida',
    description: 'Compra de material',
    amount: 150.5,
    category: 'Material',
    account: 'Banco Principal',
    customer: null,
    supplier: 'Fornecedor X',
    counterparty: 'Fornecedor X',
    costCenter: null,
    paymentMethod: 'pix',
    isPaid: true,
    paidDate: '2026-10-18',
    notes: null,
    contentKey: 'abc123',
    ...overrides,
  };
}

describe('isFinancialImportRowSendable', () => {
  it('linha pronta (ready) é sendável', () => {
    expect(isFinancialImportRowSendable(makeRow())).toBe(true);
  });

  it('linha "skipped" (vazia no fim do arquivo) NÃO é sendável', () => {
    expect(isFinancialImportRowSendable(makeRow({ state: 'skipped', date: null, amount: null }))).toBe(false);
  });

  it('data inválida (null) NÃO é sendável, mesmo com o resto preenchido', () => {
    expect(isFinancialImportRowSendable(makeRow({ date: null }))).toBe(false);
  });

  it('valor ausente (null) NÃO é sendável', () => {
    expect(isFinancialImportRowSendable(makeRow({ amount: null }))).toBe(false);
  });

  it('tipo não inferível (null) NÃO é sendável', () => {
    expect(isFinancialImportRowSendable(makeRow({ type: null }))).toBe(false);
  });

  it('descrição vazia NÃO é sendável', () => {
    expect(isFinancialImportRowSendable(makeRow({ description: '' }))).toBe(false);
    expect(isFinancialImportRowSendable(makeRow({ description: null }))).toBe(false);
  });

  it('categoria/conta ausentes AINDA são sendáveis — o servidor resolve e marca blocked', () => {
    expect(isFinancialImportRowSendable(makeRow({ category: null, account: null }))).toBe(true);
  });
});

describe('buildFinancialImportPayload', () => {
  it('linha pronta gera o payload snake_case completo', () => {
    const { rows, excludedRowNumbers } = buildFinancialImportPayload([makeRow()]);
    expect(excludedRowNumbers).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      row_number: 2,
      date: '2026-10-18',
      due_date: null,
      type: 'saida',
      description: 'Compra de material',
      amount: 150.5,
      category: 'Material',
      account: 'Banco Principal',
      cost_center: null,
      payment_method: 'pix',
      customer: null,
      supplier: 'Fornecedor X',
      counterparty: 'Fornecedor X',
      is_paid: true,
      paid_date: '2026-10-18',
      notes: null,
    });
  });

  it('vencimento da planilha atravessa o payload como `due_date` (sem o campo, conta a pagar nasce atrasada)', () => {
    const { rows } = buildFinancialImportPayload([
      makeRow({ isPaid: false, paidDate: null, dueDate: '2026-11-15' }),
    ]);
    expect(rows[0].due_date).toBe('2026-11-15');
    expect(rows[0].is_paid).toBe(false);
  });

  it('linha "skipped" não entra no payload NEM na contagem de excluídas (não é erro, é linha vazia)', () => {
    const skipped = makeRow({ state: 'skipped', date: null, type: null, amount: null, description: null });
    const { rows, excludedRowNumbers } = buildFinancialImportPayload([skipped]);
    expect(rows).toEqual([]);
    expect(excludedRowNumbers).toEqual([]);
  });

  it('linha com problema estrutural (data inválida) é EXCLUÍDA e contada, não quebra o lote', () => {
    const broken = makeRow({ rowNumber: 5, date: null, state: 'needs_review' });
    const ok = makeRow({ rowNumber: 6 });
    const { rows, excludedRowNumbers } = buildFinancialImportPayload([broken, ok]);
    expect(excludedRowNumbers).toEqual([5]);
    expect(rows).toHaveLength(1);
    expect(rows[0].row_number).toBe(6);
  });

  it('override de category_id/account_id/cost_center_id entra no payload (o id vence no servidor)', () => {
    const { rows } = buildFinancialImportPayload([makeRow({ rowNumber: 3 })], {
      3: { category_id: 'cat-uuid-1', account_id: 'acc-uuid-1', cost_center_id: 'cc-uuid-1' },
    });
    expect(rows[0].category_id).toBe('cat-uuid-1');
    expect(rows[0].account_id).toBe('acc-uuid-1');
    expect(rows[0].cost_center_id).toBe('cc-uuid-1');
    // o texto cru da planilha continua indo também — é o servidor que decide
    // qual vence quando os dois chegam.
    expect(rows[0].category).toBe('Material');
    expect(rows[0].account).toBe('Banco Principal');
  });

  it('override de payment_method substitui o texto cru da planilha (não tem variante _id)', () => {
    const { rows } = buildFinancialImportPayload([makeRow({ rowNumber: 4, paymentMethod: 'Dinheiro' })], {
      4: { payment_method: 'dinheiro' },
    });
    expect(rows[0].payment_method).toBe('dinheiro');
  });

  it('sem override, nenhuma chave `*_id` aparece no payload (nunca manda uuid vazio)', () => {
    const { rows } = buildFinancialImportPayload([makeRow()]);
    expect('category_id' in rows[0]).toBe(false);
    expect('account_id' in rows[0]).toBe(false);
    expect('cost_center_id' in rows[0]).toBe(false);
  });
});
