import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['admin'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false },
  enabled: true,
  marker: 'first',
  deny: false,
  rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { invalidatePdvCashV2Caches, usePdvCashHistoryV2, usePdvCashSessionsV2, usePdvCashV2Capability, usePdvCashV2MaintenancePresence } from './usePdvCashSessionsV2';
import { usePdvCashSessionDetailV2 } from './usePdvCashSessionDetailV2';

const filters = { terminalId: null, operatorId: null, page: 0, pageSize: 20 };
function useWorkspace() {
  return {
    capability: usePdvCashV2Capability(state.enabled),
    presence: usePdvCashV2MaintenancePresence({ enabled: state.enabled, userId: state.auth.user.id }),
    cash: usePdvCashSessionsV2({ enabled: state.enabled, userId: state.auth.user.id, cashAccountId: 'account-shared', canManageOthers: true, history: filters }),
    history: usePdvCashHistoryV2({ enabled: state.enabled, userId: state.auth.user.id, history: filters }),
    detail: usePdvCashSessionDetailV2('session-shared'),
  };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function reply(name: string, args?: Record<string, unknown>) {
  if (state.deny) return { data: null, error: { code: '42501', message: 'permission denied private cash table' } };
  const terminal = { id: 'terminal-shared', name: state.marker, stock_id: 'stock-shared' };
  const row = { id: 'session-shared', company_id: state.auth.profile.company_id, terminal_id: terminal.id, terminal_name: terminal.name,
    opened_by: state.auth.user.id, operator_name: state.marker, opened_at: '2026-11-07T08:00:00Z', opening_amount: 100,
    cash_account_id: 'account-shared', cash_account_name_snapshot: state.marker, contract_version: 2, status: args?.p_status ?? 'fechada',
    closed_at: null, counted_amount: null, expected_amount: null, difference: null, notes: null };
  const amount = state.marker === 'first' ? 100 : 20;
  const responses: Record<string, unknown> = {
    pdv_get_direct_sale_capability_v2: { enabled: true, contract_version: 2 },
    pdv_has_open_cash_session_v2: state.marker === 'first',
    pdv_list_cash_terminals_v2: [terminal],
    pdv_list_cash_sessions_v2: { rows: [row], has_more: false },
    pdv_cash_history_v2: { terminals: [terminal], rows: [row], has_more: false, can_manage_others: true },
    pdv_cash_snapshot_v2: { account_id: 'account-shared', account_name: state.marker, account_active: true, balance: amount, custody: 0, available: amount, open_v2_sessions: 1, open_legacy_sessions: 0, reconciliation_required: false },
    pdv_cash_session_detail_v2: { session_id: 'session-shared', position: amount, opening_amount: amount, cash_receipts: 0, cash_payments: 0, supplies: 0, withdrawals: 0, refunds: 0, entries: [] },
  };
  return { data: responses[name], error: null };
}
function expectNoPreviousData(result: ReturnType<typeof useWorkspace>) {
  expect(result.capability.data).toBeUndefined();
  expect(result.presence.data).toBeUndefined();
  expect(result.cash.terminals).toEqual([]);
  expect(result.cash.openSessions).toEqual([]);
  expect(result.cash.history).toEqual([]);
  expect(result.cash.operators).toEqual({});
  expect(result.cash.snapshot).toBeNull();
  expect(result.history.history).toEqual([]);
  expect(result.history.terminals).toEqual([]);
  expect(result.history.operators).toEqual({});
  expect(result.detail.detail).toBeNull();
  expect(result.detail.entries).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks(); state.enabled = true; state.marker = 'first'; state.deny = false;
  state.auth = { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['admin'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false };
  state.rpc.mockImplementation(async (name, args) => reply(name, args));
});

describe('caixas v2 — cache autorizado de todas as leituras', () => {
  it.each(['user', 'company', 'permissions', 'roles', 'permission-record'])('descarta imediatamente a projeção anterior ao mudar %s, inclusive o mesmo id de caixa', async change => {
    const { wrapper, client } = setup();
    const { result, rerender } = renderHook(useWorkspace, { wrapper });
    await waitFor(() => expect(result.current.detail.detail?.position).toBe(100));
    await waitFor(() => expect(result.current.cash.snapshot?.balance).toBe(100));
    expect(result.current.cash.terminals[0]?.name).toBe('first');
    expect(result.current.history.history).toHaveLength(1);
    const previousScope = result.current.cash.authorizationScopeKey;
    state.marker = 'second';
    if (change === 'user') { state.auth.user = { id: 'user-2' }; state.auth.profile.user_id = 'user-2'; }
    if (change === 'company') state.auth.profile = { company_id: 'company-2', user_id: state.auth.user.id, is_active: true };
    if (change === 'permissions') state.auth.permissions = [];
    if (change === 'roles') state.auth.roles = ['comercial'];
    if (change === 'permission-record') state.auth.hasPermissionRecord = false;
    rerender();
    expect(result.current.cash.authorizationScopeKey).not.toBe(previousScope);
    expectNoPreviousData(result.current);
    await waitFor(() => expect(result.current.detail.detail?.position).toBe(20));
    await waitFor(() => expect(result.current.cash.snapshot?.balance).toBe(20));
    expect(result.current.cash.terminals[0]?.name).toBe('second');
    expect(result.current.presence.data).toBe(false);
    expect(client.getQueryCache().getAll().every(query => query.queryKey[0] === 'pdv-cash-sessions-v2' && query.options.gcTime === 0)).toBe(true);
  });

  it('invalida também o detalhe e a página do histórico no ponto canônico da mutation', async () => {
    const { wrapper, client } = setup(); const { result } = renderHook(useWorkspace, { wrapper });
    await waitFor(() => expect(result.current.detail.detail?.position).toBe(100));
    await waitFor(() => expect(result.current.history.history[0]?.cashAccountName).toBe('first'));
    state.marker = 'second';
    await invalidatePdvCashV2Caches(client);
    await waitFor(() => expect(result.current.detail.detail?.position).toBe(20));
    await waitFor(() => expect(result.current.history.history[0]?.cashAccountName).toBe('second'));
    expect(result.current.cash.snapshot?.balance).toBe(20);
  });

  it.each(['loading', 'profileLoading'] as const)('aguarda %s sem mostrar dados, mesmo com identidade e caixa iguais', async phase => {
    const { wrapper } = setup(); const { result, rerender } = renderHook(useWorkspace, { wrapper });
    await waitFor(() => expect(result.current.cash.snapshot?.balance).toBe(100));
    await waitFor(() => expect(result.current.detail.detail?.position).toBe(100));
    const calls = state.rpc.mock.calls.length;
    state.auth[phase] = true; rerender();
    expectNoPreviousData(result.current);
    expect(result.current.cash.isLoading).toBe(true);
    expect(result.current.history.isLoading).toBe(true);
    expect(result.current.detail.isLoading).toBe(true);
    expect(result.current.capability.gate).toBe('loading');
    expect(result.current.presence.isLoading).toBe(true);
    expect(result.current.cash.authorizationReady).toBe(false);
    expect(state.rpc).toHaveBeenCalledTimes(calls);
  });

  it('não conserva o detalhe ou a lista após revogar permissão e o servidor negar o novo escopo', async () => {
    const { wrapper } = setup(); const { result, rerender } = renderHook(useWorkspace, { wrapper });
    await waitFor(() => expect(result.current.cash.openSessions).toHaveLength(1));
    await waitFor(() => expect(result.current.detail.detail?.position).toBe(100));
    state.auth.permissions = []; state.deny = true; rerender();
    expectNoPreviousData(result.current);
    await waitFor(() => expect(result.current.detail.isError).toBe(true));
    await waitFor(() => expect(result.current.cash.isError).toBe(true));
    expectNoPreviousData(result.current);
    expect(result.current.capability.gate).toBe('error');
    expect(result.current.detail.error?.message).not.toContain('private cash');
  });
});
