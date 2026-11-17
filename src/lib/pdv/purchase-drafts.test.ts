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
  pdvPurchaseDraftStorageKey,
  setPdvPurchaseDraftFinalAmount,
  setPdvPurchaseItemFinalAmount,
  MAX_PDV_PURCHASE_DRAFTS,
} from '@/lib/pdv/purchase-drafts';

const defaults = { purchaseDate: '2026-10-19', stockId: 'stock-a', accountId: 'acc-a', categoryId: 'cat-a' };

describe('rascunhos simultâneos da compra PDV', () => {
  it('separa a área de compras por local de estoque explícito', () => {
    expect(pdvPurchaseDraftStorageKey({ companyId: 'company', userId: 'buyer', stockId: 'stock-a' }))
      .not.toBe(pdvPurchaseDraftStorageKey({ companyId: 'company', userId: 'buyer', stockId: 'stock-b' }));
  });
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

  it('edita o valor final de um material recalculando seu custo unitário', () => {
    const draft = {
      ...createPdvPurchaseWorkspace(defaults).drafts[0],
      items: [{ id: 'i1', inventoryId: 'item', quantityText: '2', unitPriceText: '10' }],
    };
    const result = setPdvPurchaseItemFinalAmount(draft, 'i1', 18);
    expect(result.items[0].unitPriceText).toBe('9');
    expect(pdvPurchaseDraftTotal(result)).toBe(18);
  });

  it('edita o total da compra rateando o custo entre os materiais', () => {
    const draft = {
      ...createPdvPurchaseWorkspace(defaults).drafts[0],
      items: [
        { id: 'i1', inventoryId: 'item-1', quantityText: '2', unitPriceText: '10' },
        { id: 'i2', inventoryId: 'item-2', quantityText: '1', unitPriceText: '20' },
      ],
    };
    const result = setPdvPurchaseDraftFinalAmount(draft, 36);
    expect(pdvPurchaseDraftTotal(result)).toBe(36);
    expect(result.items.map(item => item.unitPriceText)).toEqual(['9', '18']);
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
  it('recupera todos os atendimentos válidos acima do limite sem permitir nova criação', () => {
    const original = createPdvPurchaseWorkspace(defaults);
    const drafts = Array.from({ length: 21 }, (_, i) => ({ ...original.drafts[0], id: `recover-${i}`, sequence: i + 1 }));
    const restored = parsePdvPurchaseWorkspace(JSON.stringify({ drafts, activeId: 'recover-20', nextSequence: 22 }), defaults);
    expect(restored.drafts).toHaveLength(21);
    expect(restored.activeId).toBe('recover-20');
    expect(addPdvPurchaseDraft(restored, defaults)).toBe(restored);
  });

});

it('recupera a intenção do saldo parcial sem reinterpretar a chave da compra antiga', () => {
  const workspace = createPdvPurchaseWorkspace(defaults); const draft = workspace.drafts[0];
  draft.supplierCreditAmount = 40;
  const restored = parsePdvPurchaseWorkspace(JSON.stringify(workspace), defaults).drafts[0];
  expect(restored.supplierCreditAmount).toBe(40); expect(restored.clientRequestId).toBe(draft.clientRequestId);
  delete draft.supplierCreditAmount;
  expect(parsePdvPurchaseWorkspace(JSON.stringify(workspace), defaults).drafts[0].supplierCreditAmount).toBeUndefined();
});

it('arredonda somente a soma das linhas fracionadas como o writer SQL canônico', () => {
  const draft = createPdvPurchaseWorkspace(defaults).drafts[0];
  draft.items = [
    { id: 'one', inventoryId: 'one', quantityText: '3.333', unitPriceText: '1' },
    { id: 'two', inventoryId: 'two', quantityText: '3.333', unitPriceText: '1' },
  ];
  expect(pdvPurchaseDraftTotal(draft)).toBe(6.67);
});
