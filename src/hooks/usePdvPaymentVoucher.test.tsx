import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdvSaleDraft, type PdvAppliedVoucher, type PdvSaleDraft } from '@/lib/pdv/sale-drafts';
import { createDurablePdvDirectSaleAttempt } from '@/lib/pdv/directSaleRecovery';
import { usePdvPaymentVoucher, type PdvPaymentVoucherSnapshot } from './usePdvPaymentVoucher';

const voucher: PdvAppliedVoucher = { voucherId: 'voucher-1', code: 'DEV-1', balance: 40, amount: 40, expiresOn: null };
function draft(id: string, customerId = 'customer-1'): PdvSaleDraft {
  return { ...createPdvSaleDraft(1, '2026-11-15', 'stock-1'), id, cart: { customerId, discount: 0, lines: [{ inventoryId: 'item-1', name: 'Item fictício', imageUrl: null, availableQuantity: 10, quantity: 1, unitPrice: 100, unitCost: 0, discountAmount: 0 }] } };
}
function snapshot(value: PdvSaleDraft): PdvPaymentVoucherSnapshot { return { draftId: value.id, cart: structuredClone(value.cart), stockId: value.stockId, notes: value.notes, transactionDate: value.transactionDate, appliedVoucher: value.appliedVoucher }; }
function setup() {
  const a = draft('draft-a'), b = draft('draft-b', 'customer-2');
  const state = { open: false, scopeKey: 'company-a:user-a:cash-a', enabled: true, drafts: [a, b], conflictingDraftIds: [] as string[], attempt: false, current: true };
  const snapshotRef = { current: snapshot(a) as PdvPaymentVoucherSnapshot | null };
  const updateDraft = vi.fn((id: string, update: (value: PdvSaleDraft) => PdvSaleDraft) => { state.drafts = state.drafts.map(value => value.id === id ? update(value) : value); });
  const hook = renderHook(() => usePdvPaymentVoucher({ ...state, snapshotRef, hasAttempt: () => state.attempt, updateDraft }));
  act(() => { hook.result.current.capture(snapshotRef.current!, () => state.current); state.open = true; }); hook.rerender();
  return { ...hook, state, snapshotRef, updateDraft, a, b };
}

describe('voucher do snapshot congelado do pagamento', () => {
  beforeEach(() => vi.clearAllMocks());
  it('atualiza somente o draft capturado e torna a ref observável sem trocar cliente/carrinho/total', () => {
    const { result, state, snapshotRef, updateDraft, rerender } = setup();
    const cart = snapshotRef.current!.cart;
    state.drafts.reverse(); rerender(); // Equivale a outra aba/pedido ativo.
    act(() => result.current.onChange(voucher)); rerender();
    expect(snapshotRef.current!.appliedVoucher).toEqual(voucher); expect(snapshotRef.current!.cart).toBe(cart);
    expect(updateDraft).toHaveBeenCalledWith('draft-a', expect.any(Function));
    expect(state.drafts.find(value => value.id === 'draft-a')?.appliedVoucher).toEqual(voucher);
    expect(state.drafts.find(value => value.id === 'draft-b')?.appliedVoucher).toBeNull();
    expect(result.current.canEdit).toBe(true);
    act(() => result.current.onChange(null)); rerender(); expect(snapshotRef.current!.appliedVoucher).toBeNull();
  });
  it.each(['cliente', 'carrinho', 'conflito', 'excluído', 'tentativa persistida', 'tentativa em memória'])('preserva intenção e não sobrescreve draft depois de %s', change => {
    const { result, state, snapshotRef, rerender, updateDraft } = setup(); const old = result.current;
    if (change === 'cliente') state.drafts[0] = { ...state.drafts[0], cart: { ...state.drafts[0].cart, customerId: 'other-customer' } };
    if (change === 'carrinho') state.drafts[0] = { ...state.drafts[0], cart: { ...state.drafts[0].cart, discount: 10 } };
    if (change === 'conflito') state.conflictingDraftIds = ['draft-a'];
    if (change === 'excluído') state.drafts = [state.drafts[1]];
    if (change === 'tentativa persistida') state.drafts[0] = { ...state.drafts[0], attempt: createDurablePdvDirectSaleAttempt('payload-original', 'original-key') };
    if (change === 'tentativa em memória') state.attempt = true;
    rerender(); expect(result.current.canEdit).toBe(false);
    act(() => old.onChange(voucher)); expect(updateDraft).not.toHaveBeenCalled(); expect(snapshotRef.current!.appliedVoucher).toBeNull();
    expect(state.drafts[0]?.attempt?.idempotencyKey).toBe(change === 'tentativa persistida' ? 'direct-sale-v3-original-key' : undefined);
  });
  it('não muda voucher se a tentativa entrar em memória entre o render e o clique', () => {
    const { result, state, snapshotRef, updateDraft } = setup();
    const old = result.current; state.attempt = true;
    act(() => old.onChange(voucher));
    expect(snapshotRef.current!.appliedVoucher).toBeNull(); expect(updateDraft).not.toHaveBeenCalled();
  });
  it('bloqueia callback antigo em A→B→A mesmo com o mesmo draftId', () => {
    const { result, state, rerender, snapshotRef, updateDraft } = setup(); const old = result.current;
    state.scopeKey = 'company-b:user-b:cash-b'; rerender(); expect(result.current.inScope).toBe(false);
    state.scopeKey = 'company-a:user-a:cash-a'; rerender(); expect(result.current.inScope).toBe(false);
    act(() => old.onChange(voucher)); expect(updateDraft).not.toHaveBeenCalled(); expect(snapshotRef.current!.appliedVoucher).toBeNull();
  });
  it('descarta escolha de diálogo fechado/reaberto no mesmo pedido', () => {
    const { result, state, rerender, snapshotRef, updateDraft } = setup(); const old = result.current;
    act(() => result.current.reset()); state.open = false; rerender();
    snapshotRef.current = snapshot(state.drafts[0]); act(() => result.current.capture(snapshotRef.current!, () => true)); state.open = true; rerender();
    act(() => old.onChange(voucher)); expect(updateDraft).not.toHaveBeenCalled(); expect(result.current.canEdit).toBe(true);
  });
  it('mantém o reducer puro e preserva versão divergente recebida antes de aplicar updateDraft', () => {
    const { result, updateDraft, state } = setup(); let pending!: (draft: PdvSaleDraft) => PdvSaleDraft;
    updateDraft.mockImplementation((_id, update) => { pending = update; }); act(() => result.current.onChange(voucher));
    const remote = { ...state.drafts[0], cart: { ...state.drafts[0].cart, customerId: 'remote-customer' } };
    expect(pending(remote)).toBe(remote);
    expect(pending(state.drafts[0])).toEqual(pending(state.drafts[0])); // StrictMode pode invocar novamente.
  });
  it('fecha o editor e impede callback após revogação ou desmontagem', () => {
    const { result, state, rerender, unmount, updateDraft } = setup();
    act(() => result.current.onPickerOpenChange(true)); expect(result.current.pickerOpen).toBe(true);
    const old = result.current; state.current = false; rerender(); expect(result.current.inScope).toBe(false); expect(result.current.pickerOpen).toBe(false);
    unmount(); act(() => old.onChange(voucher)); expect(updateDraft).not.toHaveBeenCalled();
  });
});


it('preserva o lote de vouchers no snapshot e não transfere escolha após mudar o escopo', () => {
  const { result, state, snapshotRef, rerender, updateDraft } = setup();
  const second = { ...voucher, voucherId: 'voucher-2', code: 'DEV-2', amount: 20 };
  act(() => result.current.onChanges([voucher, second])); rerender();
  expect(snapshotRef.current?.appliedVouchers).toEqual([voucher, second]);
  expect(state.drafts.find(value => value.id === 'draft-a')?.appliedVouchers).toEqual([voucher, second]);
  expect(state.drafts.find(value => value.id === 'draft-b')?.appliedVouchers).toBeUndefined();
  const old = result.current; updateDraft.mockClear(); state.scopeKey = 'company-b:user-b:cash-b'; rerender();
  act(() => old.onChanges([])); expect(updateDraft).not.toHaveBeenCalled();
});
