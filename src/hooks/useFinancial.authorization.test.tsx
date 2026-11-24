import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: vi.fn(), from: vi.fn(),
  auth: { user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true as boolean | undefined },
    permissions: ['screen:finance'], roles: ['comercial'], hasPermissionRecord: true, profileLoading: false, loading: false },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, rpc: vi.fn() } }));
vi.mock('@/utils/supabasePagination', () => ({ fetchAllPaginated: (builder: () => unknown) => { builder(); return state.rows(); } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }) }));
import { useFinancial } from './useFinancial';

const row = (id = 'a', amount = 10) => ({ id, amount, transaction_type: 'entrada', is_paid: true,
  transaction_date: '2026-11-16', transfer_pair_id: null });
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
};
beforeEach(() => {
  state.rows.mockReset().mockResolvedValue([row()]);
  const builder = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis() };
  state.from.mockReset().mockReturnValue(builder);
  Object.assign(state.auth, { user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
    permissions: ['screen:finance'], roles: ['comercial'], hasPermissionRecord: true, profileLoading: false, loading: false });
});

describe('isolamento do financeiro geral (Serviços e Loja)', () => {
  it('continua lendo Serviços sem módulo PDV e sem exigir permissão de totais da loja', async () => {
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useFinancial(), { wrapper });
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));
    expect(result.current.summary.totalEntradas).toBe(10);
    expect(state.from).toHaveBeenCalledTimes(2);
    expect(state.auth.permissions).toEqual(['screen:finance']);
    unmount(); client.clear();
  });
  it.each(['empresa', 'usuário', 'permissões', 'papel'] as const)('não reaproveita lista nem resumo ao mudar %s', async change => {
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(() => useFinancial(), { wrapper });
    await waitFor(() => expect(result.current.summary.totalEntradas).toBe(10));
    state.rows.mockImplementation(() => new Promise(() => {}));
    if (change === 'empresa') state.auth.profile.company_id = 'company-b';
    if (change === 'usuário') { state.auth.user.id = 'user-b'; state.auth.profile.user_id = 'user-b'; }
    if (change === 'permissões') state.auth.permissions = [];
    if (change === 'papel') state.auth.roles = [];
    rerender();
    expect(result.current.transactionsWithChildren).toEqual([]);
    expect(result.current.transactions).toEqual([]);
    expect(result.current.summary.totalEntradas).toBe(0);
    expect(result.current.isLoading).toBe(true);
    unmount(); client.clear();
  });
  it.each(['loading', 'profileLoading', 'inativo', 'perfil antigo', 'desligado'] as const)('mascara cache sem consultas ou refetch com %s', async change => {
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(({ loadData }) => useFinancial({ loadData }), { wrapper, initialProps: { loadData: true } });
    await waitFor(() => expect(result.current.summary.totalEntradas).toBe(10));
    if (change === 'loading' || change === 'profileLoading') state.auth[change] = true;
    if (change === 'inativo') state.auth.profile.is_active = false;
    if (change === 'perfil antigo') state.auth.profile.user_id = 'user-b';
    rerender({ loadData: change !== 'desligado' });
    await act(async () => { await result.current.refetch(); });
    expect(result.current.transactionsWithChildren).toEqual([]);
    expect(result.current.summary.totalEntradas).toBe(0);
    expect(state.from).toHaveBeenCalledTimes(2);
    unmount(); client.clear();
  });
  it('não publica resposta da empresa anterior depois da troca', async () => {
    const resolvers: Array<(rows: unknown[]) => void> = [];
    state.rows.mockImplementationOnce(() => new Promise(resolve => { resolvers.push(resolve); }))
      .mockImplementationOnce(() => new Promise(resolve => { resolvers.push(resolve); }));
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(() => useFinancial(), { wrapper });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    state.auth.profile.company_id = 'company-b'; state.rows.mockResolvedValue([row('b', 20)]); rerender();
    await waitFor(() => expect(result.current.summary.totalEntradas).toBe(20));
    await act(async () => { resolvers.forEach(resolve => resolve([row('a', 999)])); });
    expect(result.current.transactions.map(item => item.id)).toEqual(['b']);
    expect(result.current.summary.totalEntradas).toBe(20);
    unmount(); client.clear();
  });
  it('mantém invalidação por entidade alcançando lista e resumo com escopo', async () => {
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => useFinancial(), { wrapper });
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));
    await act(async () => { await client.invalidateQueries({ queryKey: ['financial-transactions'] }); await client.invalidateQueries({ queryKey: ['financial-summary'] }); });
    expect(state.from.mock.calls.length).toBeGreaterThanOrEqual(4);
    unmount(); client.clear();
  });
  it('um consumidor só de mutations não assume a consulta de quem está lendo o financeiro', async () => {
    const { wrapper, client } = setup();
    const { result, unmount } = renderHook(() => ({ reader: useFinancial(), writer: useFinancial({ loadData: false }) }), { wrapper });
    await waitFor(() => expect(result.current.reader.summary.totalEntradas).toBe(10));
    state.rows.mockResolvedValue([row('atualizado', 25)]);
    await act(async () => { await client.invalidateQueries({ queryKey: ['financial-transactions'] }); await client.invalidateQueries({ queryKey: ['financial-summary'] }); });
    await waitFor(() => expect(result.current.reader.summary.totalEntradas).toBe(25));
    expect(result.current.reader.transactions[0].id).toBe('atualizado');
    expect(result.current.writer.transactions).toEqual([]);
    expect(result.current.writer.isLoading).toBe(false);
    unmount(); client.clear();
  });
});
