import { act, renderHook } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { usePdvServerDraftSync } from '@/hooks/usePdvServerDraftSync';

interface TestDraft {
  id: string;
  sequence: number;
  updatedAt: string;
  note: string;
  items?: { inventoryId: string; quantity: number }[];
  attempt?: { directSaleVersion: 3; idempotencyKey: string; orderId: string | null };
}

interface TestWorkspace {
  drafts: TestDraft[];
  activeId: string;
  nextSequence: number;
}

const first: TestDraft = { id: '00000000-0000-4000-8000-000000000001', sequence: 1, updatedAt: '2026-10-19T10:00:00.000Z', note: 'A' };
const second: TestDraft = { id: '00000000-0000-4000-8000-000000000002', sequence: 2, updatedAt: '2026-10-19T10:00:00.000Z', note: 'B' };

const parseWorkspace = (raw: string) => JSON.parse(raw) as TestWorkspace;
const createConflictCopy = (draft: TestDraft, id: string, sequence: number) => ({ ...draft, id, sequence });

function useHarness(initial: TestWorkspace, localCacheFound = true) {
  const [workspace, setWorkspace] = useState(initial);
  const sync = usePdvServerDraftSync({
    storageKey: 'pdv:user:company',
    hydratedStorageKey: 'pdv:user:company',
    localCacheFound,
    draftType: 'sale',
    context: { cashSessionId: 'cash-a', terminalId: 'terminal-a', stockId: 'stock-a' },
    workspace,
    setWorkspace,
    parseWorkspace: useCallback(parseWorkspace, []),
    createConflictCopy,
  });
  return { workspace, setWorkspace, ...sync };
}

describe('usePdvServerDraftSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('a barreira explícita espera a confirmação do servidor sem depender do debounce do autosave', async () => {
    let confirm!: (value: unknown) => void;
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : new Promise(resolve => { confirm = resolve; }));
    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }));
    await act(async () => { await Promise.resolve(); });
    const next = { ...first, attempt: { directSaleVersion: 3 as const, idempotencyKey: 'direct-sale-v3-stable', orderId: null } };
    let saved: string | undefined;
    let pending!: Promise<unknown>;
    await act(async () => {
      result.current.setWorkspace({ drafts: [next], activeId: first.id, nextSequence: 2 });
      pending = result.current.saveDraftNow(next).then(value => { saved = value; });
      await Promise.resolve();
    });
    expect(saved).toBeUndefined();
    expect(rpc.mock.calls.find(([name]) => name === 'pdv_save_order_draft_v2')?.[1].p_payload.attempt).toEqual(next.attempt);
    await act(async () => { confirm({ data: { revision: 1 }, error: null }); await pending; });
    expect(saved).toBe('saved');
  });

  it('serializa a barreira após save em voo e nunca reenvia snapshot antigo sobre a tentativa nova', async () => {
    let finishOld!: (value: unknown) => void;
    let inFlight = 0; let maximum = 0;
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'pdv_list_order_drafts_v2') return { data: [], error: null };
      inFlight++; maximum = Math.max(maximum, inFlight);
      if (!(args.p_payload as TestDraft).attempt) {
        await new Promise(resolve => { finishOld = resolve; });
        inFlight--; return { data: { revision: 1 }, error: null };
      }
      inFlight--; return { data: { revision: 2 }, error: null };
    });
    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    const next = { ...first, note: 'Tentativa nova', attempt: { directSaleVersion: 3 as const, idempotencyKey: 'direct-sale-v3-stable', orderId: null } };
    let pending!: Promise<string>;
    act(() => {
      result.current.setWorkspace({ drafts: [next], activeId: first.id, nextSequence: 2 });
      pending = result.current.saveDraftNow(next);
    });
    await act(async () => { finishOld(undefined); expect(await pending).toBe('saved'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    const saves = rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft_v2');
    expect(maximum).toBe(1);
    expect(saves).toHaveLength(2);
    expect(saves[1][1].p_expected_revision).toBe(1);
    expect(saves[1][1].p_payload).toEqual(next);
  });

  it('serializa saves por ID, usa a revisão retornada e apaga só o draft removido', async () => {
    const revisions = new Map<string, number>();
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'pdv_list_order_drafts_v2') return { data: [], error: null };
      if (name === 'pdv_save_order_draft_v2') {
        const id = String(args.p_draft_id);
        const revision = (revisions.get(id) ?? 0) + 1;
        revisions.set(id, revision);
        return { data: { id, revision, deleted_at: null }, error: null };
      }
      const id = String(args.p_draft_id);
      return { data: { id, revision: Number(args.p_expected_revision) + 1, deleted_at: '2026-10-19T11:00:00.000Z' }, error: null };
    });

    const { result } = renderHook(() => useHarness({ drafts: [first, second], activeId: first.id, nextSequence: 3 }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });

    const firstSave = rpc.mock.calls.find(([name, args]) => name === 'pdv_save_order_draft_v2' && args.p_draft_id === first.id);
    expect(firstSave?.[1].p_expected_revision).toBe(0);

    act(() => {
      result.current.setWorkspace((current) => ({
        ...current,
        drafts: current.drafts.map((draft) => draft.id === first.id
          ? { ...draft, note: 'A2', updatedAt: '2026-10-19T12:00:00.000Z' }
          : draft),
      }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    const firstSaves = rpc.mock.calls.filter(([name, args]) => name === 'pdv_save_order_draft_v2' && args.p_draft_id === first.id);
    expect(firstSaves.at(-1)?.[1].p_expected_revision).toBe(1);

    act(() => {
      result.current.markDeleted(first.id);
      result.current.setWorkspace((current) => ({ ...current, drafts: [current.drafts[1]], activeId: second.id }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(rpc).toHaveBeenCalledWith('pdv_delete_order_draft_v2', expect.objectContaining({
      p_draft_id: first.id,
      p_expected_revision: 2,
    }));
    expect(rpc).not.toHaveBeenCalledWith('pdv_delete_order_draft_v2', expect.objectContaining({ p_draft_id: second.id }));
    expect(window.localStorage.getItem('pdv:user:company:server-deletions')).toBeNull();
  });

  it('preserva material e quantidade incluídos durante restauração sem cache local', async () => {
    let resolveList!: (value: unknown) => void;
    const list = new Promise(resolve => { resolveList = resolve; });
    rpc.mockImplementation((name: string) => name === 'pdv_list_order_drafts_v2' ? list : Promise.resolve({ data: { revision: 8 }, error: null }));
    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }, false));
    expect(rpc).toHaveBeenCalledWith('pdv_list_order_drafts_v2', {
      p_draft_type: 'sale', p_cash_session_id: 'cash-a', p_terminal_id: 'terminal-a', p_stock_id: 'stock-a', p_include_deleted: false,
    });
    act(() => { result.current.setWorkspace(current => ({ ...current, drafts: current.drafts.map(draft => ({ ...draft, items: [{ inventoryId: 'material-local', quantity: 3 }] })) })); });
    await act(async () => { resolveList({ data: [{ id: second.id, revision: 7, payload: second }], error: null }); await list; });
    expect(result.current.workspace.drafts.find(draft => draft.id === first.id)?.items).toEqual([{ inventoryId: 'material-local', quantity: 3 }]);
    expect(result.current.workspace.drafts.find(draft => draft.id === second.id)).toEqual(second);
    expect(result.current.workspace.activeId).toBe(first.id);
    expect(result.current.syncIssue).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(rpc).toHaveBeenCalledWith('pdv_save_order_draft_v2', expect.objectContaining({
      p_draft_id: first.id, p_expected_revision: 0, p_cash_session_id: 'cash-a', p_terminal_id: 'terminal-a', p_stock_id: 'stock-a',
      p_payload: expect.objectContaining({ items: [{ inventoryId: 'material-local', quantity: 3 }] }),
    }));
  });

  it('preserva edição pelo ID e bloqueia versão remota divergente mesmo com relógio mais recente', async () => {
    let resolveList!: (value: unknown) => void;
    const list = new Promise(resolve => { resolveList = resolve; });
    rpc.mockImplementation((name: string) => name === 'pdv_list_order_drafts_v2' ? list : Promise.resolve({ data: { revision: 8 }, error: null }));
    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }, false));
    act(() => { result.current.setWorkspace(current => ({ ...current, drafts: current.drafts.map(draft => ({ ...draft, items: [{ inventoryId: 'material-local', quantity: 5 }] })) })); });
    const remote = { ...first, updatedAt: '2026-10-20T10:00:00.000Z', items: [{ inventoryId: 'material-remoto', quantity: 1 }] };
    await act(async () => { resolveList({ data: [{ id: first.id, revision: 7, payload: remote }], error: null }); await list; });
    expect(result.current.workspace.drafts).toHaveLength(1);
    expect(result.current.workspace.drafts[0].items).toEqual([{ inventoryId: 'material-local', quantity: 5 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(rpc).not.toHaveBeenCalledWith('pdv_save_order_draft_v2', expect.objectContaining({ p_draft_id: first.id }));
    expect(result.current.syncIssue).toBe('conflict');
  });

  it('restaura só os rascunhos remotos quando não houve edição durante a consulta sem cache', async () => {
    let resolveList!: (value: unknown) => void;
    const list = new Promise(resolve => { resolveList = resolve; });
    rpc.mockImplementation((name: string) => name === 'pdv_list_order_drafts_v2' ? list : Promise.resolve({ data: { revision: 8 }, error: null }));
    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }, false));
    await act(async () => { resolveList({ data: [{ id: second.id, revision: 7, payload: second }], error: null }); await list; });
    expect(result.current.workspace.drafts).toEqual([second]);
  });

  it('expõe conflito CAS sem sobrescrever ou fazer retry automático', async () => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null }
      : { data: null, error: { code: '40001', message: 'revision conflict' } });

    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });

    expect(result.current.syncIssue).toBe('conflict');
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft_v2')).toHaveLength(1);
  });
});
