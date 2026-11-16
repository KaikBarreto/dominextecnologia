import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { catalogActivityKey, toggleCatalogFavorite } from '@/lib/catalogActivity';
import { subscribeCatalogFavoriteJournal } from '@/lib/catalogFavoriteSync';
import { useCatalogActivity } from './useCatalogActivity';

const backend = vi.hoisted(() => ({
  identity: { user: null as { id: string } | null,
    profile: null as { user_id: string; company_id: string | null; is_active?: boolean } | null, loading: false, profileLoading: false },
  read: vi.fn(), rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => backend.identity }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const filters: Record<string, string> = {};
    let offset = 0;
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => { filters[column] = value; return builder; },
      order: () => builder,
      range: (start: number) => { offset = start; return builder; },
      abortSignal: () => backend.read(filters, offset),
    };
    return builder;
  },
  rpc: (...args: unknown[]) => backend.rpc(...args),
} }));

interface Row { user_id: string; company_id: string; model_id: string; is_favorite: boolean; revision: number; last_operation_id: string; updated_at: string }
let server: Map<string, Row>;
let number = 0;
const clients: QueryClient[] = [];
const identity = backend.identity;
const rowKey = (user: string, company: string, model: string) => `${user}:${company}:${model}`;
const remoteOp = '02000000-0000-4000-8000-000000000001';

function seed(model: string, favorite = true, revision = 1, company = identity.profile!.company_id!, user = identity.user!.id) {
  const row = { user_id: user, company_id: company, model_id: model, is_favorite: favorite,
    revision, last_operation_id: remoteOp, updated_at: '2026-11-16T00:00:00Z' };
  server.set(rowKey(user, company, model), row);
  return row;
}

async function mutate(_name: string, args: { p_company_id: string; p_model_id: string; p_is_favorite: boolean; p_expected_revision: number; p_operation_id: string }) {
  const user = identity.user!.id;
  const key = rowKey(user, args.p_company_id, args.p_model_id);
  const previous = server.get(key);
  if (previous?.last_operation_id === args.p_operation_id) return { data: [{ applied: true, ...previous }], error: null };
  if ((previous?.revision ?? 0) !== args.p_expected_revision) {
    return { data: [{ applied: false, ...previous }], error: null };
  }
  const row = { user_id: user, company_id: args.p_company_id, model_id: args.p_model_id,
    is_favorite: args.p_is_favorite, revision: (previous?.revision ?? 0) + 1,
    last_operation_id: args.p_operation_id, updated_at: '2026-11-16T00:00:01Z' };
  server.set(key, row);
  return { data: [{ applied: true, ...row }], error: null };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe('useCatalogActivity com favoritos da conta', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
    localStorage.clear();
    server = new Map();
    const userId = `hook-sync-user-${++number}`;
    identity.user = { id: userId };
    identity.profile = { user_id: userId, company_id: 'company-a' };
    identity.loading = identity.profileLoading = false;
    backend.read.mockReset().mockImplementation(async (filters: Record<string, string>, offset: number) => ({
      data: [...server.values()].filter(row => row.user_id === filters.user_id && row.company_id === filters.company_id)
        .sort((a, b) => a.model_id.localeCompare(b.model_id)).slice(offset, offset + 1000), error: null,
    }));
    backend.rpc.mockReset().mockImplementation(mutate);
  });
  afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); onlineManager.setOnline(true); });

  it('compartilha confirmação da conta entre instâncias, mantém recentes locais e callbacks estáveis', async () => {
    const { wrapper } = setup();
    const first = renderHook(() => useCatalogActivity(), { wrapper });
    const second = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(first.result.current.favoritesSyncStatus).toBe('synced'));
    const original = first.result.current;
    act(() => original.recordView('model-a'));
    act(() => original.toggleFavorite('model-a'));
    expect(second.result.current.recentIds).toEqual(['model-a']);
    expect(second.result.current.isFavorite('model-a')).toBe(true);
    await waitFor(() => expect(first.result.current.favoritesSyncStatus).toBe('synced'));
    expect(backend.rpc).toHaveBeenCalledTimes(1);
    expect(first.result.current.recordView).toBe(original.recordView);
    expect(first.result.current.toggleFavorite).toBe(original.toggleFavorite);
    expect(server.values().next().value).toMatchObject({ model_id: 'model-a', is_favorite: true, revision: 1 });
    const stable = first.result.current;
    first.rerender();
    expect(first.result.current).toBe(stable);
  });

  it('não mostra outro usuário/empresa em nenhum render ao trocar sessão ou fazer logout', async () => {
    seed('private');
    const userId = identity.user!.id;
    const { wrapper } = setup();
    const observed: (readonly string[])[] = [];
    const hook = renderHook(() => { const result = useCatalogActivity(); observed.push(result.favoriteIds); return result; }, { wrapper });
    await waitFor(() => expect(hook.result.current.favoriteIds).toEqual(['private']));
    const checkEmpty = () => {
      observed.length = 0; hook.rerender();
      expect(observed.length).toBeGreaterThan(0);
      expect(observed.every(ids => ids.length === 0)).toBe(true);
    };
    identity.user = { id: 'another-user' };
    checkEmpty();
    expect(hook.result.current.isReady).toBe(false);
    identity.profile = { user_id: 'another-user', company_id: 'company-a' };
    checkEmpty();
    identity.user = { id: userId }; identity.profile = { user_id: userId, company_id: 'company-b' };
    checkEmpty();
    identity.user = null; identity.profile = null;
    checkEmpty();
    act(() => hook.result.current.toggleFavorite('forbidden'));
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it('fecha enquanto auth/perfil carregam ou falta empresa e não faz RPC', () => {
    identity.loading = true;
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    expect(hook.result.current.isReady).toBe(false);
    act(() => hook.result.current.toggleFavorite('forbidden'));
    identity.loading = false; identity.profileLoading = true; hook.rerender();
    expect(hook.result.current.isReady).toBe(false);
    identity.profileLoading = false; identity.profile!.company_id = null; hook.rerender();
    expect(hook.result.current.isReady).toBe(false);
    identity.profile!.company_id = 'company-a'; identity.profile!.is_active = false; hook.rerender();
    expect(hook.result.current.isReady).toBe(false);
    expect(backend.read).not.toHaveBeenCalled();
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it('recebe inclusões/remoções de outro aparelho em nova consulta sem restaurar cache antigo', async () => {
    seed('remote');
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoriteIds).toEqual(['remote']));
    seed('remote', false, 2); seed('another');
    await act(async () => { await hook.result.current.retryFavoritesSync(); });
    expect(hook.result.current.favoriteIds).toEqual(['another']);
    expect(hook.result.current.favoritesSyncStatus).toBe('synced');
  });

  it('preserva a fila e o mesmo operationId após erro de rede, e só anuncia salvo após confirmação', async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    backend.rpc.mockRejectedValueOnce(new Error('internal_table SQLSTATE 42501'));
    act(() => hook.result.current.toggleFavorite('pending'));
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('error'));
    expect(hook.result.current.favoriteIds).toEqual(['pending']);
    expect(hook.result.current.favoritesPendingCount).toBe(1);
    expect(hook.result.current.favoritesLocalBackup).toBe('saved');
    expect(hook.result.current.favoritesSyncError).not.toMatch(/internal_table|42501/);
    const operationId = backend.rpc.mock.calls[0][1].p_operation_id;
    await act(async () => { await hook.result.current.retryFavoritesSync(); });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    expect(backend.rpc.mock.calls[1][1].p_operation_id).toBe(operationId);
    expect(hook.result.current.favoritesPendingCount).toBe(0);
  });

  it('retry de resposta perdida não ressuscita item removido em outro aparelho', async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    backend.rpc.mockImplementationOnce(async (...args: Parameters<typeof mutate>) => { await mutate(...args); throw new Error('response lost'); });
    act(() => hook.result.current.toggleFavorite('model'));
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('error'));
    seed('model', false, 2);
    await act(async () => { await hook.result.current.retryFavoritesSync(); });
    expect(hook.result.current.favoriteIds).toEqual([]);
    expect(hook.result.current.favoritesPendingCount).toBe(0);
    expect(hook.result.current.favoritesSyncError).toContain('outro aparelho');
    expect(server.get(rowKey(identity.user!.id, 'company-a', 'model'))?.is_favorite).toBe(false);
  });

  it('guarda intenção offline e sincroniza na reconexão, sem anunciar sincronizado antes', async () => {
    onlineManager.setOnline(false);
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    act(() => hook.result.current.toggleFavorite('offline'));
    expect(hook.result.current.favoritesOffline).toBe(true);
    expect(hook.result.current.favoritesSyncStatus).toBe('local');
    expect(hook.result.current.favoritesPendingCount).toBe(1);
    expect(backend.rpc).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    expect(hook.result.current.favoriteIds).toEqual(['offline']);
    expect(hook.result.current.favoritesPendingCount).toBe(0);
  });

  it('importa apenas favoritos locais com dono, por ação explícita, respeitando tombstones', async () => {
    const key = catalogActivityKey(identity.user!.id, 'company-a')!;
    toggleCatalogFavorite(key, 'owned'); toggleCatalogFavorite(key, 'removed');
    localStorage.setItem('tt:favoritos:modelos', JSON.stringify([{ modelId: 'ownerless' }]));
    seed('removed', false, 2); seed('server');
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.localFavoritesToImport).toEqual(['owned']));
    expect(hook.result.current.favoritesSyncStatus).toBe('local');
    expect(backend.rpc).not.toHaveBeenCalled();
    act(() => hook.result.current.importLocalFavorites());
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    expect(new Set(hook.result.current.favoriteIds)).toEqual(new Set(['owned', 'server']));
    expect(backend.rpc).toHaveBeenCalledTimes(1);
    expect(backend.rpc.mock.calls[0][1]).toMatchObject({ p_model_id: 'owned', p_expected_revision: 0 });
  });

  it('erro em uma nova consulta não apaga favoritos já confirmados', async () => {
    seed('saved');
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoriteIds).toEqual(['saved']));
    backend.read.mockRejectedValue(new Error('network down'));
    await act(async () => { await hook.result.current.retryFavoritesSync(); });
    expect(hook.result.current.favoritesSyncStatus).toBe('error');
    expect(hook.result.current.favoriteIds).toEqual(['saved']);
  });

  it('resposta atrasada não hidrata o tenant novo e não inicia novas escritas do antigo', async () => {
    const { wrapper, client } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    let resolve!: (result: unknown) => void;
    backend.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => hook.result.current.toggleFavorite('old-company'));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(1));
    const args = backend.rpc.mock.calls[0][1];
    identity.profile!.company_id = 'company-b'; hook.rerender();
    expect(hook.result.current.favoriteIds).toEqual([]);
    await act(async () => { resolve({ data: [{ applied: true, model_id: 'old-company', is_favorite: true,
      revision: 1, last_operation_id: args.p_operation_id, updated_at: '2026-11-16T00:00:00Z' }], error: null }); });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    expect(hook.result.current.favoriteIds).toEqual([]);
    expect(client.getQueryData(['catalog-favorites', identity.user!.id, 'company-b'])).toEqual([]);
    expect(backend.rpc).toHaveBeenCalledTimes(1);
  });

  it('serializa dois cliques rápidos e baseia a remoção na confirmação da inclusão anterior', async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    backend.rpc.mockImplementationOnce(async (...args: Parameters<typeof mutate>) => {
      const response = await mutate(...args); await gate; return response;
    });
    act(() => hook.result.current.toggleFavorite('quick'));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(1));
    expect(hook.result.current.favoritesSyncStatus).toBe('saving');
    act(() => hook.result.current.toggleFavorite('quick'));
    expect(hook.result.current.favoriteIds).toEqual([]);
    await act(async () => { release(); });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    expect(backend.rpc).toHaveBeenCalledTimes(2);
    expect(backend.rpc.mock.calls[1][1]).toMatchObject({ p_is_favorite: false, p_expected_revision: 1 });
    expect(server.get(rowKey(identity.user!.id, 'company-a', 'quick'))).toMatchObject({ is_favorite: false, revision: 2 });
  });

  it('informa backup apenas na sessão se o navegador negar persistência da fila', async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    backend.rpc.mockRejectedValueOnce(new Error('network error'));
    act(() => hook.result.current.toggleFavorite('memory'));
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('error'));
    expect(hook.result.current.favoritesLocalBackup).toBe('memory');
    expect(hook.result.current.favoritesPendingCount).toBe(1);
    expect(hook.result.current.favoriteIds).toEqual(['memory']);
  });

  it('valida o escopo de cada resposta antes de apresentar os favoritos', async () => {
    backend.read.mockResolvedValue({ data: [{ ...seed('private'), user_id: 'another-user' }], error: null });
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('error'));
    expect(hook.result.current.favoriteIds).toEqual([]);
    expect(hook.result.current.favoritesSyncError).not.toContain('another-user');
  });

  it('pagina a leitura do servidor e preserva mais de mil favoritos sem limite oculto', async () => {
    for (let index = 0; index < 1005; index++) seed(`model-${index}`);
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    expect(hook.result.current.favoriteIds).toHaveLength(1005);
    expect(backend.read).toHaveBeenCalledTimes(2);
    expect(backend.read.mock.calls[1][1]).toBe(1000);
  });

  it('preserva off após resposta perdida de on e recarregamento com replay idempotente da âncora', async () => {
    const { wrapper } = setup();
    const first = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(first.result.current.favoritesSyncStatus).toBe('synced'));
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    backend.rpc.mockImplementationOnce(async (...args: Parameters<typeof mutate>) => {
      await mutate(...args); await gate; throw new Error('response lost');
    });
    act(() => first.result.current.toggleFavorite('lost'));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(1));
    act(() => first.result.current.toggleFavorite('lost'));
    expect(first.result.current.favoriteIds).toEqual([]);
    await act(async () => { release(); });
    await waitFor(() => expect(first.result.current.favoritesSyncStatus).toBe('error'));
    const anchorId = backend.rpc.mock.calls[0][1].p_operation_id;
    first.unmount();
    const key = catalogActivityKey(identity.user!.id, identity.profile!.company_id)!;
    const unsubscribe = subscribeCatalogFavoriteJournal(key, () => {});
    window.dispatchEvent(new StorageEvent('storage', { key: `${key}:account-sync:v1` }));
    unsubscribe();
    const restored = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(restored.result.current.favoritesSyncStatus).toBe('synced'));
    expect(restored.result.current.favoriteIds).toEqual([]);
    expect(backend.rpc).toHaveBeenCalledTimes(3);
    expect(backend.rpc.mock.calls[1][1].p_operation_id).toBe(anchorId);
    expect(backend.rpc.mock.calls[2][1]).toMatchObject({ p_is_favorite: false, p_expected_revision: 1 });
    expect(server.get(rowKey(identity.user!.id, 'company-a', 'lost'))).toMatchObject({ is_favorite: false, revision: 2 });
  });

  it('on/off/on termina on mesmo se a resposta da primeira gravação se perder', async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    backend.rpc.mockImplementationOnce(async (...args: Parameters<typeof mutate>) => {
      await mutate(...args); await gate; throw new Error('response lost');
    });
    act(() => hook.result.current.toggleFavorite('triple'));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(1));
    act(() => { hook.result.current.toggleFavorite('triple'); hook.result.current.toggleFavorite('triple'); });
    expect(hook.result.current.favoriteIds).toEqual(['triple']);
    await act(async () => { release(); });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('error'));
    await act(async () => { await hook.result.current.retryFavoritesSync(); });
    expect(hook.result.current.favoritesSyncStatus).toBe('synced');
    expect(hook.result.current.favoriteIds).toEqual(['triple']);
    expect(backend.rpc).toHaveBeenCalledTimes(2);
    expect(server.get(rowKey(identity.user!.id, 'company-a', 'triple'))).toMatchObject({ is_favorite: true, revision: 1 });
  });

  it('não rebasa a última intenção contra uma operação desconhecida de outro aparelho', async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useCatalogActivity(), { wrapper });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('synced'));
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    backend.rpc.mockImplementationOnce(async (...args: Parameters<typeof mutate>) => {
      await mutate(...args); await gate; throw new Error('response lost');
    });
    act(() => hook.result.current.toggleFavorite('cross-device'));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledTimes(1));
    act(() => hook.result.current.toggleFavorite('cross-device'));
    await act(async () => { release(); });
    await waitFor(() => expect(hook.result.current.favoritesSyncStatus).toBe('error'));
    seed('cross-device', true, 3);
    await act(async () => { await hook.result.current.retryFavoritesSync(); });
    expect(hook.result.current.favoritesSyncStatus).toBe('error');
    expect(hook.result.current.favoritesSyncError).toContain('outro aparelho');
    expect(hook.result.current.favoriteIds).toEqual(['cross-device']);
    expect(hook.result.current.favoritesPendingCount).toBe(0);
    expect(backend.rpc).toHaveBeenCalledTimes(2);
    expect(server.get(rowKey(identity.user!.id, 'company-a', 'cross-device'))?.revision).toBe(3);
  });
});
