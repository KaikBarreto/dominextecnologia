import { describe, expect, it } from 'vitest';
import {
  addPdvPurchaseDraft,
  createPdvPurchaseWorkspace,
  deletePdvPurchaseDraft,
  hasPdvPurchaseDraftContent,
  parsePdvPurchaseWorkspace,
  pdvPurchaseDraftTotal,
  selectPdvPurchaseDraft,
  updatePdvPurchaseDraft,
  MAX_PDV_PURCHASE_DRAFTS,
} from '@/lib/pdv/purchase-drafts';

const defaults = { purchaseDate: '2026-10-19', stockId: 'stock-a', accountId: 'acc-a', categoryId: 'cat-a' };

describe('rascunhos simultâneos da compra PDV', () => {
  it('isola conteúdo e clientRequestId por draftId durante troca rápida', () => {
    let workspace = addPdvPurchaseDraft(createPdvPurchaseWorkspace(defaults), defaults);
    const [first, second] = workspace.drafts;
    workspace = updatePdvPurchaseDraft(workspace, first.id, (draft) => ({ ...draft, supplierId: 'supplier-a' }));
    workspace = selectPdvPurchaseDraft(workspace, second.id);
    workspace = updatePdvPurchaseDraft(workspace, second.id, (draft) => ({ ...draft, notes: 'Somente B' }));

    expect(workspace.drafts.find((draft) => draft.id === first.id)?.supplierId).toBe('supplier-a');
    expect(workspace.drafts.find((draft) => draft.id === first.id)?.notes).toBe('');
    expect(workspace.drafts.find((draft) => draft.id === second.id)?.supplierId).toBe('');
    expect(workspace.drafts.find((draft) => draft.id === second.id)?.notes).toBe('Somente B');
    expect(first.clientRequestId).not.toBe(second.clientRequestId);
  });

  it('preserva a chave idempotente ao editar e remove pelo ID sem contaminar o ativo', () => {
    let workspace = addPdvPurchaseDraft(createPdvPurchaseWorkspace(defaults), defaults);
    const [first, second] = workspace.drafts;
    workspace = selectPdvPurchaseDraft(workspace, second.id);
    workspace = updatePdvPurchaseDraft(workspace, first.id, (draft) => ({ ...draft, description: 'Compra A' }));
    expect(workspace.drafts[0].clientRequestId).toBe(first.clientRequestId);

    workspace = deletePdvPurchaseDraft(workspace, first.id, defaults);
    expect(workspace.activeId).toBe(second.id);
    expect(workspace.drafts).toHaveLength(1);
  });

  it('calcula total decimal e detecta conteúdo real sem contar defaults', () => {
    let workspace = createPdvPurchaseWorkspace(defaults);
    expect(hasPdvPurchaseDraftContent(workspace.drafts[0])).toBe(false);
    workspace = updatePdvPurchaseDraft(workspace, workspace.activeId, (draft) => ({
      ...draft,
      items: [{ ...draft.items[0], inventoryId: 'item', quantityText: '2,5', unitPriceText: '10,20' }],
    }));
    expect(pdvPurchaseDraftTotal(workspace.drafts[0])).toBe(25.5);
    expect(hasPdvPurchaseDraftContent(workspace.drafts[0])).toBe(true);
  });

  it('falha fechado para storage inválido e descarta shape corrompido', () => {
    expect(parsePdvPurchaseWorkspace('{quebrado', defaults).drafts).toHaveLength(1);
    const parsed = parsePdvPurchaseWorkspace(JSON.stringify({ drafts: [{ id: 'x' }] }), defaults);
    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.drafts[0].id).not.toBe('x');
  });

  it('não ultrapassa o limite de compras simultâneas', () => {
    let workspace = createPdvPurchaseWorkspace(defaults);
    while (workspace.drafts.length < MAX_PDV_PURCHASE_DRAFTS) {
      workspace = addPdvPurchaseDraft(workspace, defaults);
    }
    const full = workspace;
    workspace = addPdvPurchaseDraft(workspace, defaults);
    expect(workspace).toBe(full);
    expect(workspace.drafts).toHaveLength(MAX_PDV_PURCHASE_DRAFTS);
  });
});
