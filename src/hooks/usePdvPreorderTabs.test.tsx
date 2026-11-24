import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvPreorderTabs } from './usePdvPreorderTabs';
import { preorderTabStorageKey } from '@/lib/pdv/preorder-workspace';

const owner = { companyId: 'company-a', userId: 'user-a', cashSessionId: 'cash-a' };
describe('usePdvPreorderTabs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('troca e reordena abas preservando conteúdo, cliente, total e revisão sem criar documento comercial', async () => {
    const { result, unmount } = renderHook(() => usePdvPreorderTabs<{ notes: string; sourceRevision: number }>(owner));
    let first = '', second = '';
    act(() => { first = result.current.create()!.id; result.current.update(first, { editorState: { notes: 'primeiro', sourceRevision: 3 }, total: 25, hasContent: true }); second = result.current.create()!.id; result.current.update(second, { editorState: { notes: 'segundo', sourceRevision: 8 }, total: 81, hasContent: true }); });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(preorderTabStorageKey(owner))!).tabs).toHaveLength(2));
    act(() => { result.current.reorder([second, first]); result.current.select(first); });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(preorderTabStorageKey(owner))!).activeId).toBe(first));
    expect(result.current.active).toMatchObject({ id: first, total: 25, editorState: { notes: 'primeiro', sourceRevision: 3 }, preorderId: null });
    expect(result.current.tabs.map(tab => tab.id)).toEqual([second, first]);
    unmount();
    const restored = renderHook(() => usePdvPreorderTabs<{ notes: string; sourceRevision: number }>(owner));
    expect(restored.result.current.active?.editorState?.notes).toBe('primeiro');
    expect(restored.result.current.tabs[0].total).toBe(81);
  });

  it('atualizações enfileiradas da mesma janela não criam cópias falsas nem perdem a última edição', async () => {
    const { result } = renderHook(() => usePdvPreorderTabs<{ text: string }>(owner));
    let id = '';
    act(() => { id = result.current.create()!.id; for (let i = 0; i < 12; i++) result.current.update(id, { editorState: { text: `edição ${i}` }, hasContent: true }); });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(preorderTabStorageKey(owner))!).tabs[0].editorState.text).toBe('edição 11'));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].recovered).not.toBe(true);
  });

  it('mascara imediatamente a troca de empresa, usuário ou caixa', () => {
    const { result, rerender } = renderHook(({ current }) => usePdvPreorderTabs<{ text: string }>(current), { initialProps: { current: owner } });
    act(() => { const tab = result.current.create()!; result.current.update(tab.id, { editorState: { text: 'privado A' } }); });
    for (const current of [{ ...owner, companyId: 'b' }, { ...owner, userId: 'b' }, { ...owner, cashSessionId: 'b' }]) {
      rerender({ current }); expect(result.current.tabs).toEqual([]); expect(result.current.active).toBeNull();
    }
  });

  it('callbacks antigos não alteram o contexto após A→B→A', async () => {
    const { result, rerender } = renderHook(({ current }) => usePdvPreorderTabs<{ text: string }>(current), { initialProps: { current: owner } });
    const oldCreate = result.current.create;
    rerender({ current: { ...owner, userId: 'b' } }); rerender({ current: owner });
    act(() => expect(oldCreate()).toBeNull());
    expect(result.current.tabs).toEqual([]);
  });

  it('backup corrompido não é apagado ou sobrescrito silenciosamente', async () => {
    const key = preorderTabStorageKey(owner); localStorage.setItem(key, '{invalid');
    const { result } = renderHook(() => usePdvPreorderTabs<{ text: string }>(owner));
    act(() => { const tab = result.current.create()!; result.current.update(tab.id, { editorState: { text: 'continua na memória' } }); });
    expect(result.current.persistence).toBe('memory'); expect(result.current.error).toBeTruthy();
    expect(result.current.tabs[0].editorState?.text).toBe('continua na memória'); expect(localStorage.getItem(key)).toBe('{invalid');
  });

  it('falha de armazenamento mantém o conteúdo em memória e não anuncia salvo', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => usePdvPreorderTabs<{ text: string }>(owner));
    act(() => { const tab = result.current.create()!; result.current.update(tab.id, { editorState: { text: 'não perder' } }); });
    await waitFor(() => expect(result.current.persistence).toBe('memory'));
    expect(result.current.tabs[0].editorState?.text).toBe('não perder'); expect(result.current.error).toMatch(/guardar as abas/);
  });

  it('fechar uma aba persiste intenção explícita e preserva as outras', async () => {
    const { result } = renderHook(() => usePdvPreorderTabs<{ text: string }>(owner)); let first = '', second = '';
    act(() => { first = result.current.create()!.id; second = result.current.create()!.id; result.current.close(first); });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(preorderTabStorageKey(owner))!).tabs).toHaveLength(1));
    expect(result.current.activeId).toBe(second); expect(result.current.tabs.map(tab => tab.id)).toEqual([second]);
  });
});
