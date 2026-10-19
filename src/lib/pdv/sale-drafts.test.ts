import { describe, expect, it } from 'vitest';
import { addItem, setCartCustomer, setDiscount } from '@/lib/pdv/cart';
import {
  addPdvSaleDraft,
  createPdvSaleWorkspace,
  deletePdvSaleDraft,
  parsePdvSaleWorkspace,
  selectPdvSaleDraft,
  updatePdvSaleDraft,
  MAX_PDV_SALE_DRAFTS,
} from '@/lib/pdv/sale-drafts';

const product = {
  inventoryId: 'item-1',
  name: 'Produto 1',
  imageUrl: null,
  unitPrice: 25,
  unitCost: 10,
  availableQuantity: 50,
};

describe('rascunhos simultâneos da venda PDV', () => {
  it('altera sempre o pedido endereçado sem contaminar o ativo ou os vizinhos', () => {
    let workspace = createPdvSaleWorkspace('2026-10-19', 'stock-a');
    const firstId = workspace.activeId;
    workspace = addPdvSaleDraft(workspace, '2026-10-19', 'stock-b');
    const secondId = workspace.activeId;

    workspace = updatePdvSaleDraft(workspace, firstId, (draft) => ({
      ...draft,
      notes: 'somente primeiro',
      cart: addItem(draft.cart, product, 2).cart,
    }));
    workspace = updatePdvSaleDraft(workspace, secondId, (draft) => ({
      ...draft,
      cart: setDiscount(setCartCustomer(draft.cart, 'customer-b'), 3),
    }));

    const first = workspace.drafts.find((draft) => draft.id === firstId)!;
    const second = workspace.drafts.find((draft) => draft.id === secondId)!;
    expect(first.notes).toBe('somente primeiro');
    expect(first.cart.lines[0].quantity).toBe(2);
    expect(first.cart.customerId).toBeNull();
    expect(second.notes).toBe('');
    expect(second.cart.lines).toHaveLength(0);
    expect(second.cart.customerId).toBe('customer-b');
    expect(second.cart.discount).toBe(3);
  });

  it('mantém atualizações antigas no ID original mesmo após trocas rápidas', () => {
    let workspace = createPdvSaleWorkspace('2026-10-19');
    const firstId = workspace.activeId;
    workspace = addPdvSaleDraft(workspace, '2026-10-19');
    const secondId = workspace.activeId;
    workspace = selectPdvSaleDraft(workspace, firstId);
    workspace = selectPdvSaleDraft(workspace, secondId);
    workspace = updatePdvSaleDraft(workspace, firstId, (draft) => ({ ...draft, notes: 'retorno tardio' }));

    expect(workspace.activeId).toBe(secondId);
    expect(workspace.drafts.find((draft) => draft.id === firstId)?.notes).toBe('retorno tardio');
    expect(workspace.drafts.find((draft) => draft.id === secondId)?.notes).toBe('');
  });

  it('ao excluir o ativo escolhe um vizinho e nunca deixa o workspace sem pedido', () => {
    let workspace = createPdvSaleWorkspace('2026-10-19');
    const firstId = workspace.activeId;
    workspace = addPdvSaleDraft(workspace, '2026-10-19');
    const secondId = workspace.activeId;
    workspace = deletePdvSaleDraft(workspace, secondId, '2026-10-19');
    expect(workspace.activeId).toBe(firstId);
    expect(workspace.drafts).toHaveLength(1);

    workspace = deletePdvSaleDraft(workspace, firstId, '2026-10-19');
    expect(workspace.drafts).toHaveLength(1);
    expect(workspace.activeId).toBe(workspace.drafts[0].id);
    expect(workspace.activeId).not.toBe(firstId);
  });

  it('restaura cache válido e descarta activeId inexistente ou payload corrompido', () => {
    const original = createPdvSaleWorkspace('2026-10-19', 'stock-a');
    const restored = parsePdvSaleWorkspace(
      JSON.stringify({ ...original, activeId: 'nao-existe' }),
      '2026-10-20',
    );
    expect(restored.activeId).toBe(restored.drafts[0].id);
    expect(restored.drafts[0].stockId).toBe('stock-a');

    const recovered = parsePdvSaleWorkspace('{quebrado', '2026-10-20');
    expect(recovered.drafts).toHaveLength(1);
    expect(recovered.drafts[0].transactionDate).toBe('2026-10-20');
  });

  it('não ultrapassa o limite de pedidos simultâneos', () => {
    let workspace = createPdvSaleWorkspace('2026-10-19');
    while (workspace.drafts.length < MAX_PDV_SALE_DRAFTS) {
      workspace = addPdvSaleDraft(workspace, '2026-10-19');
    }
    const full = workspace;
    workspace = addPdvSaleDraft(workspace, '2026-10-19');
    expect(workspace).toBe(full);
    expect(workspace.drafts).toHaveLength(MAX_PDV_SALE_DRAFTS);
  });
});
