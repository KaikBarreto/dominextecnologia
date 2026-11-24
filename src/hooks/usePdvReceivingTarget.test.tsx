import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvCashV2Session } from '@/hooks/usePdvCashSessionsV2';

const ids = {
  company: '11111111-1111-4111-8111-111111111111', companyB: '22222222-2222-4222-8222-222222222222',
  order: '33333333-3333-4333-8333-333333333333', terminal: '44444444-4444-4444-8444-444444444444',
  otherTerminal: '55555555-5555-4555-8555-555555555555', session: '66666666-6666-4666-8666-666666666666', otherSession: '77777777-7777-4777-8777-777777777777',
};
const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: '11111111-1111-4111-8111-111111111111', is_active: true }, permissions: ['screen:pdv'], roles: ['admin'], hasPermissionRecord: true, loading: false, profileLoading: false },
  from: vi.fn(), read: vi.fn(), filters: [] as Array<[string, string]>, selects: [] as string[],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
import { projectPdvReceivingOrder, usePdvReceivingTarget } from './usePdvReceivingTarget';

function session(id = ids.session, terminalId = ids.terminal, companyId = ids.company): PdvCashV2Session {
  return { id, companyId, terminalId, openedBy: 'user-A', openedAt: '2026-11-16T12:00:00Z', openingAmount: 10, cashAccountId: ids.session, cashAccountName: 'Caixa', contractVersion: 2, status: 'aberta', closedAt: null, countedAmount: null, expectedAmount: null, difference: null, notes: null, wasReopened: false };
}
function row(overrides: Record<string, unknown> = {}) {
  return { id: ids.order, company_id: ids.company, target_terminal_id: ids.terminal, terminal_id: null, cash_session_id: null, status: 'aguardando_pagamento', contract_version: 2, operation_mode_snapshot: 'counter', ...overrides };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function props() { return { orderId: ids.order, enabled: true, cashReady: true, sessions: [session(ids.otherSession, ids.otherTerminal), session()], terminals: [{ id: ids.terminal, name: 'Caixa A', stockId: ids.company }, { id: ids.otherTerminal, name: 'Próprio', stockId: ids.company }] }; }

beforeEach(() => {
  vi.clearAllMocks(); state.filters = []; state.selects = [];
  state.auth = { user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: ids.company, is_active: true }, permissions: ['screen:pdv'], roles: ['admin'], hasPermissionRecord: true, loading: false, profileLoading: false };
  state.read.mockResolvedValue({ data: row(), error: null });
  state.from.mockImplementation(() => {
    const chain = {
      select: (fields: string) => { state.selects.push(fields); return chain; },
      eq: (field: string, value: string) => { state.filters.push([field, value]); return chain; },
      abortSignal: (_signal: AbortSignal) => chain,
      maybeSingle: () => state.read(),
    };
    return chain;
  });
});

describe('destino autorizado do recebimento', () => {
  it('consulta apenas pedido e empresa exatos, sem inferir o primeiro caixa ou o próprio', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => usePdvReceivingTarget(props()), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.sessionId).toBe(ids.session);
    expect(state.from).toHaveBeenCalledWith('pdv_orders');
    expect(state.filters).toEqual([['company_id', ids.company], ['id', ids.order]]);
    expect(state.selects[0]).not.toContain('*');
  });

  it('atualiza o destino quando uma mutação canônica invalida os pedidos', async () => {
    const { wrapper, client } = setup();
    const { result } = renderHook(() => usePdvReceivingTarget(props()), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    state.read.mockResolvedValue({ data: row({ status: 'entregue' }), error: null });
    await act(async () => { await client.invalidateQueries({ queryKey: ['pdv-orders'] }); });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.sessionId).toBeNull();
  });

  it('não consulta identificador inválido, link ausente ou usuário sem ação de receber', async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(input => usePdvReceivingTarget(input), { wrapper, initialProps: { ...props(), orderId: null as string | null } });
    expect(result.current.status).toBe('none');
    rerender({ ...props(), orderId: 'outro-id' });
    expect(result.current.status).toBe('unavailable');
    rerender({ ...props(), enabled: false });
    expect(result.current.status).toBe('unavailable');
    expect(state.from).not.toHaveBeenCalled();
    await act(async () => { await result.current.refetch(); });
    expect(state.from).not.toHaveBeenCalled();
  });

  it.each([
    ['pedido oculto pela RLS', null],
    ['outra empresa', row({ company_id: ids.companyB })],
    ['outro pedido', row({ id: ids.companyB })],
    ['pedido já recebido', row({ status: 'entregue' })],
    ['pedido legado', row({ contract_version: 1 })],
    ['venda direta', row({ operation_mode_snapshot: 'direct' })],
    ['destinos divergentes', row({ terminal_id: ids.otherTerminal })],
    ['destino ausente', row({ target_terminal_id: null })],
  ])('falha fechado para %s', async (_name, data) => {
    const { wrapper } = setup(); state.read.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => usePdvReceivingTarget(props()), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.sessionId).toBeNull();
  });

  it('pedido vinculado nunca migra para uma nova abertura do mesmo terminal', async () => {
    const { wrapper } = setup(); state.read.mockResolvedValue({ data: row({ cash_session_id: ids.session }), error: null });
    const { result } = renderHook(() => usePdvReceivingTarget({ ...props(), sessions: [session(ids.otherSession)] }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.sessionId).toBeNull();
  });

  it('aguarda o catálogo autorizado e exige abertura/terminal disponíveis sem ambiguidade', async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(input => usePdvReceivingTarget(input), { wrapper, initialProps: { ...props(), cashReady: false } });
    await waitFor(() => expect(state.read).toHaveBeenCalled());
    expect(result.current.status).toBe('pending');
    rerender({ ...props(), sessions: [session()], terminals: [] });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    rerender(props());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ ...props(), sessions: [session(), session(ids.otherSession)] });
    expect(result.current.status).toBe('unavailable');
  });

  it.each(['company', 'user', 'permissions', 'inactive', 'loading'])('mascara imediatamente ao mudar %s e rejeita resposta atrasada', async change => {
    const { wrapper } = setup(); const pending: Array<(value: unknown) => void> = [];
    const { result, rerender } = renderHook(() => usePdvReceivingTarget(props()), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    state.read.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    if (change === 'company') state.auth.profile.company_id = ids.companyB;
    if (change === 'user') { state.auth.user.id = 'user-B'; state.auth.profile.user_id = 'user-B'; }
    if (change === 'permissions') state.auth.permissions = [];
    if (change === 'inactive') state.auth.profile.is_active = false;
    if (change === 'loading') state.auth.profileLoading = true;
    rerender();
    expect(result.current.sessionId).toBeNull();
    await act(async () => { for (const resolve of pending) resolve({ data: row(), error: null }); });
    expect(result.current.sessionId).toBeNull();
  });

  it('não reaproveita resposta de A antes de uma passagem A→B→A', async () => {
    const { wrapper } = setup(); const pending: Array<(value: unknown) => void> = [];
    state.read.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const { result, rerender } = renderHook(() => usePdvReceivingTarget(props()), { wrapper });
    await waitFor(() => expect(pending).toHaveLength(1));
    state.auth.profile.company_id = ids.companyB; rerender();
    await waitFor(() => expect(pending).toHaveLength(2));
    state.auth.profile.company_id = ids.company; rerender();
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => { pending[0]({ data: row(), error: null }); });
    expect(result.current.sessionId).toBeNull();
    await act(async () => { pending[2]({ data: row(), error: null }); });
    await waitFor(() => expect(result.current.sessionId).toBe(ids.session));
  });

  it('não expõe erro técnico nem usa dados parciais de falha', async () => {
    const { wrapper } = setup(); state.read.mockResolvedValue({ data: row(), error: { code: '42501', message: 'private_table' } });
    const { result } = renderHook(() => usePdvReceivingTarget(props()), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.sessionId).toBeNull();
  });

  it('valida a projeção antes de usar um UUID de destino', () => {
    expect(projectPdvReceivingOrder(row({ cash_session_id: 'corrompido' }), ids.order, ids.company)).toBeNull();
  });
});
