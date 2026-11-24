import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvSaleDraftWorkspace } from './usePdvSaleDraftWorkspace';
import { createDurablePdvDirectSaleAttempt } from '@/lib/pdv/directSaleRecovery';
import { createPdvSaleWorkspace, pdvSaleDraftStorageKey } from '@/lib/pdv/sale-drafts';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
const owner = { companyId: 'company-a', userId: 'operator-a', cashSessionId: 'opening-a', terminalId: 'terminal-a', stockId: 'stock-a' };

describe('persistência explícita da tentativa antes do writer financeiro', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it('grava backup local imediatamente, mas só confirma conta após receber a revisão do servidor', async () => {
    let confirm!: (value: unknown) => void;
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : new Promise(resolve => { confirm = resolve; }));
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-15', defaultStockId: owner.stockId, directSaleV2: true }));
    await waitFor(() => expect(result.current.serverReady).toBe(true));
    const attempt = createDurablePdvDirectSaleAttempt('intent', 'stable');
    const draftId = result.current.activeDraft.id;
    let response: unknown; let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt })).then(value => { response = value; });
      await Promise.resolve();
    });
    expect(response).toBeUndefined();
    const backup = JSON.parse(localStorage.getItem(pdvSaleDraftStorageKey(owner))!);
    expect(backup.drafts.find((draft: { id: string }) => draft.id === draftId).attempt).toEqual(attempt);
    expect(rpc.mock.calls.find(([name]) => name === 'pdv_save_order_draft_v2')?.[1].p_payload.attempt).toEqual(attempt);
    await act(async () => { confirm({ data: { revision: 1 }, error: null }); await pending; });
    expect(response).toEqual({ server: 'saved', localSaved: true });
  });

  it('troca de empresa durante o save mascara o resultado e não grava o pedido anterior no novo escopo', async () => {
    let confirm!: (value: unknown) => void;
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : new Promise(resolve => { confirm = resolve; }));
    const { result, rerender } = renderHook(({ current }) => usePdvSaleDraftWorkspace({ owner: current, transactionDate: '2026-11-15', defaultStockId: current.stockId, directSaleV2: true }), { initialProps: { current: owner } });
    await waitFor(() => expect(result.current.serverReady).toBe(true));
    let pending!: ReturnType<typeof result.current.persistDraftNow>;
    await act(async () => {
      pending = result.current.persistDraftNow(result.current.activeDraft.id, draft => ({ ...draft, attempt: createDurablePdvDirectSaleAttempt('private-a', 'stable-a') }));
      await Promise.resolve();
    });
    const other = { ...owner, companyId: 'company-b', userId: 'operator-b', cashSessionId: 'opening-b' };
    rerender({ current: other });
    expect(result.current.activeDraft.attempt).toBeNull();
    await act(async () => { confirm({ data: { revision: 1 }, error: null }); expect((await pending).server).toBe('scope_changed'); });
    expect(result.current.activeDraft.attempt).toBeNull();
    expect(localStorage.getItem(pdvSaleDraftStorageKey(other)) ?? '').not.toContain('private-a');
  });

  it('não anuncia backup local quando storage falha, mesmo com confirmação válida do servidor', async () => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : { data: { revision: 1 }, error: null });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-15', defaultStockId: owner.stockId, directSaleV2: true }));
    await waitFor(() => expect(result.current.serverReady).toBe(true));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage indisponível'); });
    await act(async () => {
      const saved = await result.current.persistDraftNow(result.current.activeDraft.id, draft => ({ ...draft, attempt: createDurablePdvDirectSaleAttempt('intent', 'stable') }));
      expect(saved).toEqual({ server: 'saved', localSaved: false });
    });
  });

  it('conflito com identidade financeira preparada exige conferência mesmo antes de conhecer o número do pedido', async () => {
    const local = createPdvSaleWorkspace('2026-11-15', owner.stockId);
    local.drafts[0].notes = 'Versão local';
    local.drafts[0].attempt = createDurablePdvDirectSaleAttempt('intent', 'local-attempt');
    localStorage.setItem(pdvSaleDraftStorageKey(owner), JSON.stringify(local));
    const remote = { ...local.drafts[0], notes: 'Versão remota', attempt: createDurablePdvDirectSaleAttempt('intent', 'remote-attempt') };
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [{ id: remote.id, revision: 5, payload: remote }], error: null } : { data: { revision: 6 }, error: null });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-15', defaultStockId: owner.stockId, directSaleV2: true }));
    await waitFor(() => expect(result.current.draftConflicts).toHaveLength(1));
    expect(result.current.draftConflicts[0]).toMatchObject({ requiresOrderReview: true, orderId: null });
    const contentBefore = JSON.stringify(result.current.workspace);
    await act(async () => { expect(await result.current.resolveDraftConflict(remote.id, 'server')).toBe('review_order'); });
    expect(JSON.stringify(result.current.workspace)).toBe(contentBefore);
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft_v2')).toHaveLength(0);
  });
  it('resposta perdida do save antes da venda conserva snapshot e request CAS no retry', async () => {
    let firstSave: Record<string, unknown> | null = null;
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'pdv_list_order_drafts_v2') return { data: [], error: null };
      if (!firstSave) { firstSave = args; throw new Error('resposta perdida depois de salvar'); }
      if (args.p_client_request_id !== firstSave.p_client_request_id || JSON.stringify(args.p_payload) !== JSON.stringify(firstSave.p_payload)) return { data: null, error: { code: '40001' } };
      return { data: { revision: 1 }, error: null };
    });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-15', defaultStockId: owner.stockId, directSaleV2: true }));
    await waitFor(() => expect(result.current.serverReady).toBe(true));
    const attempt = createDurablePdvDirectSaleAttempt('intent', 'stable');
    const draftId = result.current.activeDraft.id;
    await act(async () => {
      expect((await result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt }))).server).toBe('unavailable');
    });
    await act(async () => {
      expect((await result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt }))).server).toBe('saved');
    });
    const writes = rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft_v2');
    expect(writes).toHaveLength(2);
    expect(writes[1][1]).toEqual(writes[0][1]);
  });
  it('a barreira de um atendimento não apaga edição ou seleção enfileirada em outro rascunho', async () => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : { data: { revision: 1 }, error: null });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-15', defaultStockId: owner.stockId, directSaleV2: true }));
    await waitFor(() => expect(result.current.serverReady).toBe(true));
    const firstId = result.current.activeDraft.id;
    act(() => result.current.createDraft());
    const secondId = result.current.activeDraft.id;
    expect(secondId).not.toBe(firstId);
    await act(async () => {
      result.current.updateDraft(secondId, draft => ({ ...draft, notes: 'Edição recente do segundo atendimento' }));
      expect((await result.current.persistDraftNow(firstId, draft => ({ ...draft, attempt: createDurablePdvDirectSaleAttempt('intent', 'stable') }))).server).toBe('saved');
    });
    expect(result.current.activeDraft.id).toBe(secondId);
    expect(result.current.workspace.drafts.find(draft => draft.id === secondId)?.notes).toBe('Edição recente do segundo atendimento');
    expect(result.current.workspace.drafts.find(draft => draft.id === firstId)?.attempt?.idempotencyKey).toBe('direct-sale-v3-stable');
  });
});
