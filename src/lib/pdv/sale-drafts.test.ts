import { describe, expect, it } from 'vitest';
import { addItem, setCartCustomer, setDiscount } from '@/lib/pdv/cart';
import {
  addPdvSaleDraft,
  getAppliedVouchers,
  clampAppliedVouchers,
  createPdvSaleWorkspace,
  deletePdvSaleDraft,
  parsePdvSaleWorkspace,
  selectPdvSaleDraft,
  setPdvSaleDraftCustomer,
  updatePdvSaleDraft,
  pdvSaleDraftStorageKey,
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
  it('restaura a chave versionada e o pedido confirmado sem reinterpretar a tentativa legada', () => {
    const workspace = createPdvSaleWorkspace('2026-11-15');
    const confirmedSale = { orderId: 'paid-order', orderNumber: 12, deliveryId: 'delivery', subtotal: 25, discountAmount: 0, total: 25, idempotent: false };
    workspace.drafts[0].attempt = { signature: 'intent', clientRequestId: 'stable', orderId: 'paid-order', directSaleVersion: 3, idempotencyKey: 'direct-sale-v3-stable', confirmedSale };
    expect(parsePdvSaleWorkspace(JSON.stringify(workspace), '2026-11-15').drafts[0].attempt).toEqual(workspace.drafts[0].attempt);
    workspace.drafts[0].attempt = { signature: 'legacy', clientRequestId: 'legacy-request', orderId: 'open-legacy-order' };
    expect(parsePdvSaleWorkspace(JSON.stringify(workspace), '2026-11-15').drafts[0].attempt).toEqual(workspace.drafts[0].attempt);
  });
  it('separa o cache do mesmo operador entre duas aberturas e dois Caixas', () => {
    const base = { companyId: 'company', userId: 'operator', stockId: 'stock' };
    const keyA = pdvSaleDraftStorageKey({ ...base, cashSessionId: 'opening-a', terminalId: 'cash-a' });
    const keyB = pdvSaleDraftStorageKey({ ...base, cashSessionId: 'opening-b', terminalId: 'cash-b' });
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain(':opening-a:cash-a:stock');
  });
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

  it('restaura a intenção de voucher no rascunho sem consumir saldo', () => {
    const original = createPdvSaleWorkspace('2026-10-19', 'stock-a');
    original.drafts[0].appliedVoucher = {
      voucherId: 'voucher-1',
      code: 'DEV-1042',
      amount: 40,
      balance: 75,
      expiresOn: '2026-12-31',
    };
    const restored = parsePdvSaleWorkspace(JSON.stringify(original), '2026-10-20');
    expect(restored.drafts[0].appliedVoucher).toEqual(original.drafts[0].appliedVoucher);
    // O rascunho guarda só intenção: não há lançamento, pagamento nem mutation aqui.
    expect(restored.drafts[0].attempt).toBeNull();
  });

  it('descarta voucher de cache inválido ou sem valor positivo', () => {
    const original = createPdvSaleWorkspace('2026-10-19');
    const raw = JSON.parse(JSON.stringify(original));
    raw.drafts[0].appliedVoucher = { voucherId: 'v', code: 'V', amount: -1, balance: 50 };
    expect(parsePdvSaleWorkspace(JSON.stringify(raw), '2026-10-20').drafts[0].appliedVoucher).toBeNull();
  });

  it('trocar o cliente limpa o voucher para impedir uso na pessoa errada', () => {
    const workspace = createPdvSaleWorkspace('2026-10-19');
    const draft = workspace.drafts[0];
    draft.cart.customerId = 'cliente-a';
    draft.appliedVoucher = {
      voucherId: 'voucher-a', code: 'A-1', amount: 50, balance: 50, expiresOn: null,
    };
    expect(setPdvSaleDraftCustomer(draft, 'cliente-b').appliedVoucher).toBeNull();
    expect(setPdvSaleDraftCustomer(draft, 'cliente-a').appliedVoucher).toEqual(draft.appliedVoucher);
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
  it('recupera todos os atendimentos válidos acima do limite sem permitir nova criação', () => {
    const original = createPdvSaleWorkspace('2026-10-19');
    const drafts = Array.from({ length: 21 }, (_, i) => ({ ...original.drafts[0], id: `recover-${i}`, sequence: i + 1 }));
    const restored = parsePdvSaleWorkspace(JSON.stringify({ drafts, activeId: 'recover-20', nextSequence: 22 }), '2026-10-19');
    expect(restored.drafts).toHaveLength(21);
    expect(restored.activeId).toBe('recover-20');
    expect(addPdvSaleDraft(restored, '2026-10-19')).toBe(restored);
  });

});

it('recupera array de vouchers, conserva contrato antigo e remove todo o lote ao trocar cliente', () => {
  const workspace = createPdvSaleWorkspace('2026-11-16');
  const first = { voucherId: 'v1', code: 'V1', amount: 30, balance: 50, expiresOn: null };
  const second = { ...first, voucherId: 'v2', code: 'V2', amount: 20 };
  workspace.drafts[0].appliedVoucher = first;
  expect(getAppliedVouchers(parsePdvSaleWorkspace(JSON.stringify(workspace), '2026-11-16').drafts[0])).toEqual([first]);
  workspace.drafts[0].appliedVouchers = [first, second];
  const restored = parsePdvSaleWorkspace(JSON.stringify(workspace), '2026-11-16').drafts[0];
  expect(getAppliedVouchers(restored)).toEqual([first, second]);
  expect(getAppliedVouchers(setPdvSaleDraftCustomer(restored, 'other-customer'))).toEqual([]);
  expect(clampAppliedVouchers([first, second], 40)).toEqual([first, { ...second, amount: 10 }]);
});
