import { useCallback, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { usePdvServerDraftSync } from '@/hooks/usePdvServerDraftSync';
import { usePdvPurchaseDraftWorkspace } from '@/hooks/usePdvPurchaseDraftWorkspace';
import { usePdvSaleDraftWorkspace } from '@/hooks/usePdvSaleDraftWorkspace';
import { createPdvPurchaseDraft, pdvPurchaseDraftStorageKey } from '@/lib/pdv/purchase-drafts';
import { createPdvSaleDraft, pdvSaleDraftStorageKey } from '@/lib/pdv/sale-drafts';
interface Draft { id: string; sequence: number; updatedAt: string; note: string }
interface Workspace { drafts: Draft[]; activeId: string; nextSequence: number }
type Row = { id: string; revision: number; payload: Draft; deleted_at: string | null };
const key = 'review:company:user:session:terminal:stock';
const parse = (raw: string) => JSON.parse(raw) as Workspace;
const createConflictCopy = (draft: Draft, id: string, sequence: number) => ({ ...draft, id, sequence });
const draft = (id: string, sequence = 1, note = 'Servidor', updatedAt = '2026-11-14T10:00:00Z'): Draft => ({ id, sequence, note, updatedAt });
const ws = (...drafts: Draft[]): Workspace => ({ drafts, activeId: drafts.at(-1)!.id, nextSequence: Math.max(...drafts.map(d => d.sequence)) + 1 });
function useHarness(initial: Workspace, cacheFound: boolean) {
  const [workspace, setWorkspace] = useState(initial);
  const sync = usePdvServerDraftSync({ storageKey: key, hydratedStorageKey: key, localCacheFound: cacheFound,
    draftType: 'sale', context: { cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' },
    workspace, setWorkspace, parseWorkspace: useCallback(parse, []), createConflictCopy });
  return { workspace, setWorkspace, ...sync };
}
function server(rows: Row[], cap = 20) {
  const state = new Map(rows.map(row => [row.id, structuredClone(row)]));
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'pdv_list_order_drafts_v2') return { data: [...state.values()].filter(row => !row.deleted_at).map(row => structuredClone(row)), error: null };
    const id = String(args.p_draft_id), row = state.get(id);
    if (name === 'pdv_save_order_draft_v2') {
      if ((row?.revision ?? 0) !== args.p_expected_revision) return { data: null, error: { code: '40001' } };
      if (!row && [...state.values()].filter(row => !row.deleted_at).length >= cap) return { data: null, error: { code: '54000' } };
      const saved = { id, revision: (row?.revision ?? 0) + 1, payload: structuredClone(args.p_payload) as Draft, deleted_at: null };
      state.set(id, saved); return { data: structuredClone(saved), error: null };
    }
    if (!row || row.revision !== args.p_expected_revision) return { data: null, error: { code: '40001' } };
    row.deleted_at = '2026-11-14T12:00:00Z'; row.revision += 1;
    return { data: structuredClone(row), error: null };
  });
  return state;
}
const resolveChoice = async (resolve: () => Promise<string>) => {
  let promise!: Promise<string>;
  await act(async () => { promise = resolve(); await Promise.resolve(); });
  let outcome!: string;
  await act(async () => { outcome = await promise; });
  return outcome;
};
const flush = async () => { await act(async () => { await Promise.resolve(); }); await act(async () => { await vi.advanceTimersByTimeAsync(650); }); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-11-14T12:00:00Z'); vi.clearAllMocks(); window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Proteção de rascunhos entre abas/dispositivos', () => {
  it('browser novo sem cache não regrava payload remoto idêntico', async () => {
    server([{ id: 'remote', revision: 5, payload: draft('remote'), deleted_at: null }]);
    const { result } = renderHook(() => useHarness(ws(draft('placeholder')), false));
    await flush();
    expect(result.current.workspace.drafts.map(d => d.id)).toEqual(['remote']);
    expect(rpc.mock.calls.filter(([name]) => name !== 'pdv_list_order_drafts_v2')).toHaveLength(0);
  });

  it('cache divergente não sobrescreve rascunho não ativo sem base conhecida', async () => {
    const remote = draft('old-id', 1, 'Edição nova no servidor');
    const unchanged = draft('active-id', 2, 'Atendimento ativo');
    const state = server([{ id: remote.id, revision: 5, payload: remote, deleted_at: null }, { id: unchanged.id, revision: 2, payload: unchanged, deleted_at: null }]);
    const cached = { ...remote, note: 'Cópia local antiga', updatedAt: '2099-01-01T00:00:00Z' };
    const { result } = renderHook(() => useHarness(ws(cached, unchanged), true));
    await flush();
    expect(result.current.workspace.activeId).toBe(unchanged.id);
    expect(state.get(remote.id)?.payload.note).toBe('Edição nova no servidor');
    expect(result.current.workspace.drafts.find(d => d.id === remote.id)?.note).toBe('Cópia local antiga');
    expect(rpc).not.toHaveBeenCalledWith('pdv_save_order_draft_v2', expect.objectContaining({ p_draft_id: remote.id }));
    expect(result.current.syncIssue).toBe('conflict');
    expect(window.localStorage.getItem(`${key}:server-conflicts`)).toContain('Edição nova no servidor');
  });

  it('CAS preserva servidor e cópia local quando outra gravação chega após a leitura', async () => {
    const remote = draft('b1111111-1111-4111-8111-111111111111');
    const state = server([{ id: remote.id, revision: 5, payload: remote, deleted_at: null }]);
    const { result } = renderHook(() => useHarness(ws(draft('placeholder')), false));
    await flush();
    state.set(remote.id, { id: remote.id, revision: 6, payload: { ...remote, note: 'Outro navegador' }, deleted_at: null });
    act(() => result.current.setWorkspace(ws({ ...remote, note: 'Minha edição pendente', updatedAt: '2026-11-14T12:01:00Z' })));
    await flush();
    expect(result.current.syncIssue).toBe('conflict');
    expect(result.current.workspace.drafts[0].note).toBe('Minha edição pendente');
    expect(state.get(remote.id)?.payload.note).toBe('Outro navegador');
  });

  it('união acima de20 preserva local/remotos sem exclusão implícita', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `remote-${i + 2}`, revision: 5, payload: draft(`remote-${i + 2}`, i + 2), deleted_at: null }));
    const state = server(rows);
    const { result } = renderHook(() => useHarness(ws(draft('offline-local', 1, 'Cache antigo')), true));
    await flush();
    expect(result.current.workspace.drafts).toHaveLength(21);
    expect(result.current.workspace.drafts.some(d => d.id === 'remote-21')).toBe(true);
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_delete_order_draft_v2')).toHaveLength(0);
    expect(state.get('remote-21')?.deleted_at).toBeNull();
    expect(result.current.syncIssue).toBe('conflict');
  });

  it.each(['22023', '42501', '54000'])('aviso unavailable também representa erro de domínio %s', async code => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : { data: null, error: { code } });
    const { result } = renderHook(() => useHarness(ws(draft('local')), true));
    await flush(); expect(result.current.syncIssue).toBe('unavailable');
    expect(result.current.workspace.drafts[0].note).toBe('Servidor');
  });

  it('storage event preserva edição pendente e a versão alternativa com conflito', async () => {
    const owner = { companyId: 'company', userId: 'user', cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' };
    const remote = { ...createPdvSaleDraft(1, '2026-11-14', 'stock', 'b1111111-1111-4111-8111-111111111111'), notes: 'Servidor', updatedAt: '2026-11-14T10:00:00Z' };
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [{ id: remote.id, revision: 5, payload: remote }], error: null }
      : { data: { revision: 6 }, error: null });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-14', defaultStockId: 'stock' }));
    await flush();
    act(() => result.current.updateDraft(remote.id, current => ({ ...current, notes: 'Minha edição ainda não enviada' })));
    expect(result.current.activeDraft.notes).toBe('Minha edição ainda não enviada');
    const foreign = { drafts: [{ ...remote, notes: 'Cópia recebida de outra aba' }], activeId: remote.id, nextSequence: 2 };
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: pdvSaleDraftStorageKey(owner), newValue: JSON.stringify(foreign) })));
    expect(result.current.activeDraft.notes).toBe('Minha edição ainda não enviada');
    expect(result.current.syncIssue).toBe('conflict');
    expect(window.localStorage.getItem(`${pdvSaleDraftStorageKey(owner)}:server-conflicts`)).toContain('Cópia recebida de outra aba');
  });

  it('permite edição offline quando a base confirmada ainda coincide com o servidor', async () => {
    const remote = draft('known');
    window.localStorage.setItem(`${key}:server-bases`, JSON.stringify([[remote.id, { revision: 5, serialized: JSON.stringify(remote) }]]));
    const state = server([{ id: remote.id, revision: 5, payload: remote, deleted_at: null }]);
    const local = { ...remote, note: 'Editado offline', updatedAt: '2026-11-14T11:00:00Z' };
    const { result } = renderHook(() => useHarness(ws(local), true));
    await flush();
    expect(state.get(remote.id)?.payload.note).toBe('Editado offline');
    expect(result.current.syncIssue).toBeNull();
    expect(rpc).toHaveBeenCalledWith('pdv_save_order_draft_v2', expect.objectContaining({ p_expected_revision: 5 }));
  });

  it('atualiza cache limpo a partir do remoto sem gravar uma versão antiga', async () => {
    const cached = draft('known');
    window.localStorage.setItem(`${key}:server-bases`, JSON.stringify([[cached.id, { revision: 5, serialized: JSON.stringify(cached) }]]));
    const remote = { ...cached, note: 'Atualizado remotamente' };
    server([{ id: remote.id, revision: 6, payload: remote, deleted_at: null }]);
    const { result } = renderHook(() => useHarness(ws(cached), true));
    await flush();
    expect(result.current.workspace.drafts[0].note).toBe('Atualizado remotamente');
    expect(rpc.mock.calls.filter(([name]) => name !== 'pdv_list_order_drafts_v2')).toHaveLength(0);
    expect(result.current.syncIssue).toBeNull();
  });

  it('remover apenas do snapshot nunca exclui remoto sem markDeleted', async () => {
    const a = draft('a'), b = draft('b', 2);
    const state = server([a, b].map(payload => ({ id: payload.id, revision: 5, payload, deleted_at: null })));
    const { result } = renderHook(() => useHarness(ws(a, b), true));
    await flush();
    act(() => result.current.setWorkspace(ws(b)));
    await flush();
    expect(state.get('a')?.deleted_at).toBeNull();
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_delete_order_draft_v2')).toHaveLength(0);
  });

  it('leitura indisponível nunca autoriza saves/deletes sem contexto confirmado', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    const { result } = renderHook(() => useHarness(ws(draft('local')), true));
    await flush();
    expect(result.current.workspace.drafts[0].id).toBe('local');
    expect(result.current.serverReady).toBe(false);
    expect(result.current.syncIssue).toBe('unavailable');
    expect(rpc.mock.calls.filter(([name]) => name !== 'pdv_list_order_drafts_v2')).toHaveLength(0);
  });

  it('retry após falha de transporte reaproveita a chave e revisão da mesma intenção', async () => {
    let attempt = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'pdv_list_order_drafts_v2') return { data: [], error: null };
      if (++attempt === 1) throw new Error('offline');
      return { data: { revision: 1 }, error: null };
    });
    const { result } = renderHook(() => useHarness(ws(draft('local')), true));
    await flush();
    expect(result.current.syncIssue).toBe('unavailable');
    act(() => result.current.setWorkspace(current => ({ ...current })));
    await flush();
    const calls = rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft_v2');
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toEqual(calls[0][1]);
    expect(result.current.syncIssue).toBeNull();
  });

  it.each(['cash', 'user', 'company'])('troca de %s não grava conteúdo anterior na chave nova', async dimension => {
    const owner = { companyId: 'company', userId: 'user', cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' };
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : { data: { revision: 1 }, error: null });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result, rerender } = renderHook(({ owner: currentOwner }) => usePdvSaleDraftWorkspace({ owner: currentOwner, transactionDate: '2026-11-14', defaultStockId: 'stock' }), { initialProps: { owner } });
    await flush();
    act(() => result.current.updateActiveDraft(current => ({ ...current, notes: 'EXCLUSIVO DO CONTEXTO A' })));
    await flush();
    const other = { ...owner, ...(dimension === 'cash' ? { cashSessionId: 'other-cash', terminalId: 'other-terminal' } : dimension === 'user' ? { userId: 'other-user' } : { companyId: 'other-company' }) };
    rerender({ owner: other });
    expect(result.current.activeDraft.notes).toBe('');
    await flush();
    expect(result.current.activeDraft.notes).toBe('');
    const newKey = pdvSaleDraftStorageKey(other);
    expect(setItem.mock.calls.filter(([writtenKey]) => writtenKey === newKey).every(([, value]) => !value.includes('EXCLUSIVO DO CONTEXTO A'))).toBe(true);
  });

  it('falha de quota mantém edição em memória e informa persistência local indisponível', async () => {
    const owner = { companyId: 'company', userId: 'user', cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' };
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : { data: null, error: { code: 'NETWORK_UNAVAILABLE' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-14', defaultStockId: 'stock' }));
    await flush();
    act(() => result.current.updateActiveDraft(current => ({ ...current, notes: 'Continua em memória' })));
    await flush();
    expect(result.current.activeDraft.notes).toBe('Continua em memória');
    expect(result.current.localPersistenceIssue).toBe(true);
  });

  it('compra também preserva edição pendente contra storage e ignora chave de outro usuário', async () => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [], error: null } : { data: { revision: 1 }, error: null });
    const owner = { companyId: 'company', userId: 'user', stockId: 'stock' };
    const { result } = renderHook(() => usePdvPurchaseDraftWorkspace({ owner, defaults: { purchaseDate: '2026-11-14', stockId: 'stock' } }));
    await flush();
    act(() => result.current.updateDraft(result.current.activeDraft.id, current => ({ ...current, notes: 'Minha compra' })));
    const incoming = { ...result.current.workspace, drafts: result.current.workspace.drafts.map(d => ({ ...d, notes: 'Outra compra' })) };
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'pdv_purchase_drafts:company:other-user:stock', newValue: JSON.stringify(incoming) })));
    expect(result.current.syncIssue).toBeNull();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'pdv_purchase_drafts:company:user:stock', newValue: JSON.stringify(incoming) })));
    expect(result.current.activeDraft.notes).toBe('Minha compra');
    expect(result.current.syncIssue).toBe('conflict');
  });


  it('resolução explícita mantém escolhido e alternativas como cópias, sem duplicar doubleclick', async () => {
    const remote = draft('conflicting', 1, 'Online');
    const state = server([{ id: remote.id, revision: 5, payload: remote, deleted_at: null }]);
    const local = { ...remote, note: 'Desta aba' };
    const { result } = renderHook(() => useHarness(ws(local), true));
    await flush();
    expect(result.current.draftConflicts[0]).toMatchObject({ id: remote.id, local, server: remote });
    let firstChoice!: Promise<string>;
    await act(async () => {
      firstChoice = result.current.resolveDraftConflict(remote.id, 'server');
      const duplicateClick = result.current.resolveDraftConflict(remote.id, 'server');
      expect(duplicateClick).toBe(firstChoice);
      await Promise.resolve();
    });
    await act(async () => { expect(await firstChoice).toBe('resolved'); });
    expect(result.current.workspace.drafts).toHaveLength(2);
    expect(result.current.workspace.drafts.find(d => d.id === remote.id)?.note).toBe('Online');
    expect(result.current.workspace.drafts.find(d => d.id !== remote.id)?.note).toBe('Desta aba');
    expect(result.current.draftConflicts).toHaveLength(0);
    expect(await resolveChoice(() => result.current.resolveDraftConflict(remote.id, 'server'))).toBe('not_found');
    await flush();
    expect(state.get(remote.id)?.payload.note).toBe('Online');
    expect([...state.values()]).toHaveLength(2);
  });

  it('mudança remota após comparar versões exige nova escolha e não grava CAS silencioso', async () => {
    const remote = draft('conflicting', 1, 'Online inicial');
    const state = server([{ id: remote.id, revision: 5, payload: remote, deleted_at: null }]);
    const local = { ...remote, note: 'Local' };
    const { result } = renderHook(() => useHarness(ws(local), true));
    await flush();
    state.set(remote.id, { id: remote.id, revision: 6, payload: { ...remote, note: 'Online mudou' }, deleted_at: null });
    expect(await resolveChoice(() => result.current.resolveDraftConflict(remote.id, 'local'))).toBe('refresh_required');
    expect(result.current.workspace.drafts).toHaveLength(1);
    expect(result.current.draftConflicts[0].server?.note).toBe('Online mudou');
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_save_order_draft_v2')).toHaveLength(0);
    expect(await resolveChoice(() => result.current.resolveDraftConflict(remote.id, 'local'))).toBe('resolved');
    await flush();
    expect(state.get(remote.id)?.payload.note).toBe('Local');
    expect(rpc).toHaveBeenCalledWith('pdv_save_order_draft_v2', expect.objectContaining({ p_draft_id: remote.id, p_expected_revision: 6 }));
    expect(result.current.workspace.drafts.some(d => d.note === 'Online mudou' && d.id !== remote.id)).toBe(true);
  });

  it('venda recuperada recebe outra tentativa e pedido já criado exige revisão sem reprocessar', async () => {
    const owner = { companyId: 'company', userId: 'user', cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' };
    const remote = { ...createPdvSaleDraft(1, '2026-11-14', 'stock', 'b1111111-1111-4111-8111-111111111111'), notes: 'Online' };
    const local = { ...remote, notes: 'Local', attempt: { signature: 'cart', clientRequestId: 'old-request', orderId: null } };
    window.localStorage.setItem(pdvSaleDraftStorageKey(owner), JSON.stringify({ drafts: [local], activeId: local.id, nextSequence: 2 }));
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [{ id: remote.id, revision: 5, payload: remote }], error: null } : { data: { revision: 6 }, error: null });
    const { result } = renderHook(() => usePdvSaleDraftWorkspace({ owner, transactionDate: '2026-11-14', defaultStockId: 'stock' }));
    await flush();
    expect(await resolveChoice(() => result.current.resolveDraftConflict(remote.id, 'server'))).toBe('resolved');
    const copy = result.current.workspace.drafts.find(d => d.id !== remote.id)!;
    expect(copy.notes).toBe('Local');
    expect(result.current.lastResolution).toEqual({ id: remote.id, choice: 'server', localCopyId: copy.id });
    expect(copy.attempt).toBeNull();
    expect(copy.id).not.toBe(local.id);
    act(() => result.current.updateDraft(remote.id, current => ({ ...current, notes: 'Alterada', attempt: { signature: 'cart', clientRequestId: 'committed-request', orderId: 'existing-order' } })));
    const incoming = { ...result.current.workspace, drafts: result.current.workspace.drafts.map(d => d.id === remote.id ? remote : d) };
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: pdvSaleDraftStorageKey(owner), newValue: JSON.stringify(incoming) })));
    expect(result.current.draftConflicts[0]).toMatchObject({ requiresOrderReview: true, orderId: 'existing-order' });
    const before = JSON.stringify(result.current.workspace);
    expect(await resolveChoice(() => result.current.resolveDraftConflict(remote.id, 'server'))).toBe('review_order');
    expect(JSON.stringify(result.current.workspace)).toBe(before);
    expect(rpc.mock.calls.every(([name]) => ['pdv_list_order_drafts_v2', 'pdv_save_order_draft_v2', 'pdv_delete_order_draft_v2'].includes(name))).toBe(true);
  });

  it('cópia de compra gera UUID e clientRequestId novos', async () => {
    const owner = { companyId: 'company', userId: 'user', stockId: 'stock' };
    const defaults = { purchaseDate: '2026-11-14', stockId: 'stock' };
    const remote = { ...createPdvPurchaseDraft(1, defaults, 'b2222222-2222-4222-8222-222222222222', 'b4444444-4444-4444-8444-444444444444'), notes: 'Online' };
    const local = { ...remote, notes: 'Local' };
    window.localStorage.setItem(pdvPurchaseDraftStorageKey(owner), JSON.stringify({ drafts: [local], activeId: local.id, nextSequence: 2 }));
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? { data: [{ id: remote.id, revision: 5, payload: remote }], error: null } : { data: { revision: 6 }, error: null });
    const { result } = renderHook(() => usePdvPurchaseDraftWorkspace({ owner, defaults }));
    await flush();
    expect(await resolveChoice(() => result.current.resolveDraftConflict(remote.id, 'server'))).toBe('resolved');
    const copy = result.current.workspace.drafts.find(d => d.id !== remote.id)!;
    expect(copy.notes).toBe('Local');
    expect(copy.clientRequestId).not.toBe(local.clientRequestId);
    expect(copy.id).not.toBe(local.id);
  });

  it('retry explícito após leitura offline recupera sem excluir nem perder edição', async () => {
    let reads = 0;
    rpc.mockImplementation(async (name: string) => name === 'pdv_list_order_drafts_v2'
      ? (++reads === 1 ? { data: null, error: { code: 'NETWORK_UNAVAILABLE' } } : { data: [], error: null })
      : { data: { revision: 1 }, error: null });
    const { result } = renderHook(() => useHarness(ws(draft('local', 1, 'Pendente')), true));
    await flush();
    expect(result.current.serverReady).toBe(false);
    act(() => result.current.retrySync());
    await flush();
    expect(result.current.serverReady).toBe(true);
    expect(result.current.workspace.drafts[0].note).toBe('Pendente');
    expect(result.current.syncIssue).toBeNull();
    expect(rpc.mock.calls.filter(([name]) => name === 'pdv_delete_order_draft_v2')).toHaveLength(0);
  });


  it('conflito de storage continua revisável após recarregar e não reaparece depois de resolvido', async () => {
    const remote = draft('conflicting', 1, 'Online');
    server([{ id: remote.id, revision: 5, payload: remote, deleted_at: null }]);
    const mounted = renderHook(() => useHarness(ws(remote), true));
    await flush();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(ws({ ...remote, note: 'Outra aba pendente' })) })));
    expect(mounted.result.current.draftConflicts).toHaveLength(1);
    mounted.unmount();
    const again = renderHook(() => useHarness(ws(remote), true));
    await flush();
    expect(again.result.current.draftConflicts[0].alternatives.some(d => d.note === 'Outra aba pendente')).toBe(true);
    expect(await resolveChoice(() => again.result.current.resolveDraftConflict(remote.id, 'server'))).toBe('resolved');
    const resolved = again.result.current.workspace;
    await flush();
    again.unmount();
    const final = renderHook(() => useHarness(resolved, true));
    await flush();
    expect(final.result.current.draftConflicts).toHaveLength(0);
    expect(final.result.current.workspace.drafts.some(d => d.note === 'Outra aba pendente')).toBe(true);
  });

  it('resposta de leitura atrasada não hidrata outro caixa/empresa', async () => {
    const owner = { companyId: 'company', userId: 'user', cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' };
    const other = { ...owner, companyId: 'other-company', cashSessionId: 'other-session', terminalId: 'other-terminal' };
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => name === 'pdv_list_order_drafts_v2'
      ? args.p_cash_session_id === owner.cashSessionId ? pending : Promise.resolve({ data: [], error: null })
      : Promise.resolve({ data: { revision: 1 }, error: null }));
    const { result, rerender } = renderHook(({ current }) => usePdvSaleDraftWorkspace({ owner: current, transactionDate: '2026-11-14', defaultStockId: 'stock' }), { initialProps: { current: owner } });
    rerender({ current: other });
    await flush();
    const before = JSON.stringify(result.current.workspace);
    const remote = { ...createPdvSaleDraft(1, '2026-11-14', 'stock', 'b3333333-3333-4333-8333-333333333333'), notes: 'PRIVADO A' };
    await act(async () => { finish({ data: [{ id: remote.id, revision: 9, payload: remote }], error: null }); await pending; });
    expect(JSON.stringify(result.current.workspace)).toBe(before);
    expect(JSON.stringify(result.current.workspace)).not.toContain('PRIVADO A');
    expect(result.current.draftConflicts).toHaveLength(0);
    expect(result.current.lastResolution).toBeNull();
  });

  it('troca de owner durante resolução mascara metadados no primeiro render e descarta resposta', async () => {
    const owner = { companyId: 'company', userId: 'user', cashSessionId: 'session', terminalId: 'terminal', stockId: 'stock' };
    const other = { ...owner, cashSessionId: 'other-session', terminalId: 'other-terminal' };
    const remote = { ...createPdvSaleDraft(1, '2026-11-14', 'stock', 'b3333333-3333-4333-8333-333333333333'), notes: 'Online A' };
    const local = { ...remote, notes: 'Local A' };
    window.localStorage.setItem(pdvSaleDraftStorageKey(owner), JSON.stringify({ drafts: [local], activeId: local.id, nextSequence: 2 }));
    let reads = 0;
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => name === 'pdv_list_order_drafts_v2'
      ? args.p_cash_session_id !== owner.cashSessionId ? Promise.resolve({ data: [], error: null })
        : ++reads === 1 ? Promise.resolve({ data: [{ id: remote.id, revision: 5, payload: remote }], error: null }) : pending
      : Promise.resolve({ data: { revision: 1 }, error: null }));
    const observed: { owner: string; conflicts: number; resolving: string | null; metadata: unknown; notes: string }[] = [];
    const { result, rerender } = renderHook(({ current }) => {
      const value = usePdvSaleDraftWorkspace({ owner: current, transactionDate: '2026-11-14', defaultStockId: 'stock' });
      observed.push({ owner: current.cashSessionId, conflicts: value.draftConflicts.length, resolving: value.resolvingDraftId,
        metadata: value.lastResolution, notes: value.activeDraft.notes });
      return value;
    }, { initialProps: { current: owner } });
    await flush();
    let resolving!: Promise<string>;
    act(() => { resolving = result.current.resolveDraftConflict(remote.id, 'local'); });
    expect(result.current.resolvingDraftId).toBe(remote.id);
    rerender({ current: other });
    expect(observed.filter(item => item.owner === other.cashSessionId).every(item => item.conflicts === 0 && item.resolving === null && item.metadata === null && !item.notes.includes('A'))).toBe(true);
    await act(async () => { finish({ data: [{ id: remote.id, revision: 5, payload: remote }], error: null }); expect(await resolving).toBe('not_found'); });
    expect(result.current.lastResolution).toBeNull();
    expect(result.current.workspace.drafts.some(d => d.notes === 'Local A')).toBe(false);
  });

});
