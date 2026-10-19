import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPdvSaleEditDraft,
  isPdvSaleEditDraft,
  loadPdvSaleEditDraft,
  savePdvSaleEditDraft,
  type PdvSaleEditDraft,
} from './order-edit';

const OWNER = { userId: 'user-1', companyId: 'company-1' };

function draft(overrides: Partial<PdvSaleEditDraft> = {}): PdvSaleEditDraft {
  return {
    ownerUserId: OWNER.userId,
    companyId: OWNER.companyId,
    clientRequestId: 'retry-order-1',
    sourceOrderId: 'order-1',
    sourceReference: '#101',
    customerId: 'customer-1',
    stockId: 'stock-1',
    discountAmount: 5,
    notes: 'Preservar observação',
    transactionDate: '2026-10-18',
    items: [
      {
        inventoryId: 'inventory-1',
        description: 'Produto',
        quantity: 2,
        unitPrice: 20,
        unitCost: 8,
        discountAmount: 3,
      },
    ],
    ...overrides,
  };
}

describe('rascunho seguro da edição de venda', () => {
  beforeEach(() => sessionStorage.clear());

  it('mantém rascunhos de vendas diferentes sem uma sobrescrever a outra', () => {
    const first = draft();
    const second = draft({
      sourceOrderId: 'order-2',
      sourceReference: '#102',
      clientRequestId: 'retry-order-2',
    });

    savePdvSaleEditDraft(first);
    savePdvSaleEditDraft(second);

    expect(loadPdvSaleEditDraft('order-1', OWNER)).toEqual(first);
    expect(loadPdvSaleEditDraft('order-2', OWNER)).toEqual(second);
  });

  it('não entrega o rascunho a outro usuário nem a outra empresa no terminal compartilhado', () => {
    savePdvSaleEditDraft(draft());

    expect(loadPdvSaleEditDraft('order-1', { ...OWNER, userId: 'user-2' })).toBeNull();
    expect(loadPdvSaleEditDraft('order-1', { ...OWNER, companyId: 'company-2' })).toBeNull();
    expect(loadPdvSaleEditDraft('order-1', OWNER)).not.toBeNull();
  });

  it('preserva chave de retry, competência e descontos depois de recarregar', () => {
    savePdvSaleEditDraft(draft());

    expect(loadPdvSaleEditDraft('order-1', OWNER)).toMatchObject({
      clientRequestId: 'retry-order-1',
      transactionDate: '2026-10-18',
      discountAmount: 5,
      items: [{ discountAmount: 3 }],
    });
  });

  it('limpa somente a venda concluída e preserva outra edição aberta', () => {
    savePdvSaleEditDraft(draft());
    savePdvSaleEditDraft(draft({
      sourceOrderId: 'order-2',
      clientRequestId: 'retry-order-2',
    }));

    clearPdvSaleEditDraft('order-1');

    expect(loadPdvSaleEditDraft('order-1', OWNER)).toBeNull();
    expect(loadPdvSaleEditDraft('order-2', OWNER)).not.toBeNull();
  });

  it('falha fechado para conteúdo corrompido ou incompleto', () => {
    sessionStorage.setItem('dominex:pdv:sale-edit-draft:order-1', '{inválido');
    expect(loadPdvSaleEditDraft('order-1', OWNER)).toBeNull();

    sessionStorage.setItem(
      'dominex:pdv:sale-edit-draft:order-1',
      JSON.stringify({ ...draft(), clientRequestId: '' }),
    );
    expect(loadPdvSaleEditDraft('order-1', OWNER)).toBeNull();
  });

  it('rejeita estado de navegação legado ou com números inválidos', () => {
    expect(isPdvSaleEditDraft({ ...draft(), transactionDate: undefined }, 'order-1', OWNER)).toBe(false);
    expect(isPdvSaleEditDraft({ ...draft(), items: [{ ...draft().items[0], quantity: 0 }] }, 'order-1', OWNER)).toBe(false);
    expect(isPdvSaleEditDraft({ ...draft(), discountAmount: Number.NaN }, 'order-1', OWNER)).toBe(false);
  });
});
