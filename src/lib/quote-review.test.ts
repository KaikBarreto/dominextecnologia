import { describe, expect, it } from 'vitest';
import { buildQuoteReviewIssues, type QuoteReviewInput, type QuoteReviewItem } from './quote-review';

const item: QuoteReviewItem = { item_type: 'servico', description: 'Limpeza', quantity: 1, unit_price: 150, unit_total_cost: 100 };
const review = (patch: Partial<QuoteReviewInput> = {}) => buildQuoteReviewIssues({ items: [item], finalTotal: 150, now: new Date(2026, 10, 7, 23, 59), ...patch });

describe('conferência orientativa do orçamento', () => {
  it('aceita um orçamento simples sem exigir campos opcionais ou custos conhecidos', () => {
    expect(review({ items: [{ ...item, unit_total_cost: 0 }] })).toEqual([]);
    expect(review({ items: [{ ...item, unit_total_cost: undefined }] })).toEqual([]);
    expect(review({ validUntil: '', receivableFirstDueDate: '' })).toEqual([]);
  });

  it('agrupa preços zerados da mesma seção e mantém caminho para os itens', () => {
    const issues = review({ items: [
      ...['Limpeza', 'Instalação', 'Teste', 'Vistoria'].map(description => ({ ...item, description, unit_price: 0 })),
      { ...item, item_type: 'material', description: 'Tubo', unit_price: 0 },
    ] });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ kind: 'missing_price', section: 'services', itemIndexes: [0, 1, 2, 3] });
    expect(issues[0].detail).toContain('Limpeza, Instalação, Teste e mais 1.');
    expect(issues[1]).toMatchObject({ kind: 'missing_price', section: 'materials', itemIndexes: [4] });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('sinaliza quantidade inválida sem repetir preço pendente: %s', quantity => {
    const issues = review({ items: [{ ...item, quantity, unit_price: 0 }] });
    expect(issues.map(issue => issue.kind)).toEqual(['invalid_quantity']);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('sinaliza preço zerado ou inválido: %s', unit_price => {
    expect(review({ items: [{ ...item, unit_price }] })[0].kind).toBe('missing_price');
  });

  it('compara em centavos sem falso alerta por flutuação e sem aplicar BDI', () => {
    expect(review({ items: [{ ...item, unit_price: 100, unit_total_cost: 100.000000001 }], finalTotal: 100 })).toEqual([]);
    const issues = review({ items: [{ ...item, unit_price: 99.99 }] });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('below_item_cost');
  });

  it('detecta quando desconto deixa o total abaixo do custo, incluindo deslocamento real', () => {
    expect(review({ finalTotal: 120, displacementCost: 30 })).toEqual([
      expect.objectContaining({ kind: 'below_total_cost', section: 'commercial' }),
    ]);
    expect(review({ finalTotal: 130, displacementCost: 30 })).toEqual([]);
  });

  it('usa a quantidade ao comparar o conjunto e não duplica alertas já explicados nos itens', () => {
    expect(review({ items: [{ ...item, quantity: 3 }], finalTotal: 299 })[0].kind).toBe('below_total_cost');
    expect(review({ items: [{ ...item, unit_price: 50 }], finalTotal: 50 }).map(issue => issue.kind)).toEqual(['below_item_cost']);
  });

  it('mantém validade de hoje até o fim do dia civil, sem deslocamento UTC', () => {
    expect(review({ validUntil: '2026-11-07' })).toEqual([]);
    expect(review({ validUntil: '2026-11-08' })).toEqual([]);
    expect(review({ validUntil: '2026-11-06' })[0]).toMatchObject({ kind: 'expired_validity', section: 'review' });
  });

  it('sugere data para parcelamento sem impor preenchimento ao pagamento à vista', () => {
    expect(review({ receivableInstallments: 1, receivableFirstDueDate: '' })).toEqual([]);
    expect(review({ receivableInstallments: 3, receivableFirstDueDate: '' })[0]).toMatchObject({ kind: 'missing_first_due_date', section: 'commercial' });
    expect(review({ receivableInstallments: 3, receivableFirstDueDate: '2026-12-10' })).toEqual([]);
  });

  it('não altera o formulário ao revisar', () => {
    const original = Object.freeze({ ...item, unit_price: 0 });
    const items = [original];
    review({ items });
    expect(items).toEqual([original]);
  });
});
