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
}

interface TestWorkspace {
  drafts: TestDraft[];
  activeId: string;
  nextSequence: number;
}

const first: TestDraft = { id: '00000000-0000-4000-8000-000000000001', sequence: 1, updatedAt: '2026-10-19T10:00:00.000Z', note: 'A' };
const second: TestDraft = { id: '00000000-0000-4000-8000-000000000002', sequence: 2, updatedAt: '2026-10-19T10:00:00.000Z', note: 'B' };

const parseWorkspace = (raw: string) => JSON.parse(raw) as TestWorkspace;

function useHarness(initial: TestWorkspace) {
  const [workspace, setWorkspace] = useState(initial);
  const sync = usePdvServerDraftSync({
    storageKey: 'pdv:user:company',
    hydratedStorageKey: 'pdv:user:company',
    localCacheFound: true,
    draftType: 'sale',
    workspace,
    setWorkspace,
    parseWorkspace: useCallback(parseWorkspace, []),
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

  it('serializa saves por ID, usa a revisão retornada e apaga só o draft removido', async () => {
    const revisions = new Map<string, number>();
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'pdv_list_order_drafts') return { data: [], error: null };
      if (name === 'pdv_save_order_draft') {
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

    const firstSave = rpc.mock.calls.find(([name, args]) => name === 'pdv_save_order_draft' && args.p_draft_id === first.id);
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
    const firstSaves = rpc.mock.calls.filter(([name, args]) => name === 'pdv_save_order_draft' && args.p_draft_id === first.id);
    expect(firstSaves.at(-1)?.[1].p_expected_revision).toBe(1);

    act(() => {
      result.current.markDeleted(first.id);
      result.current.setWorkspace((current) => ({ ...current, drafts: [current.drafts[1]], activeId: second.id }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(rpc).toHaveBeenCalledWith('pdv_delete_order_draft', expect.objectContaining({
      p_draft_id: first.id,
      p_expected_revision: 2,
    }));
    expect(rpc).not.toHaveBeenCalledWith('pdv_delete_order_draft', expect.objectContaining({ p_draft_id: second.id }));
    expect(window.localStorage.getItem('pdv:user:company:server-deletions')).toBeNull();
  });

  it('expõe conflito CAS sem sobrescrever ou fazer retry automático', async () => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts'
      ? { data: [], error: null }
      : { data: null, error: { code: '40001', message: 'revision conflict' } });

    const { result } = renderHook(() => useHarness({ drafts: [first], activeId: first.id, nextSequence: 2 }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });

    expect(result.current.syncIssue).toBe('conflict');
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft')).toHaveLength(1);
  });
});
