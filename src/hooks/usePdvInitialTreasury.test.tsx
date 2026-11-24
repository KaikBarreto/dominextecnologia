import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { user: { id: 'user' }, profile: { company_id: 'company' }, roles: ['admin'], permissions: ['*'], hasPermissionRecord: true, loading: false, profileLoading: false },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { usePdvCashSessionsV2, mapPdvCashV2Error } from './usePdvCashSessionsV2';
const history = { terminalId: null, operatorId: null, page: 0, pageSize: 1 };
function setup(canInitializeTreasury = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => usePdvCashSessionsV2({ enabled: true, userId: state.auth.user.id, cashAccountId: 'account', canManageOthers: true, canInitializeTreasury, history }), { wrapper }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'pdv_can_initialize_treasury_v2' ? true
    : name === 'pdv_list_cash_terminals_v2' ? []
    : name === 'pdv_list_cash_sessions_v2' ? { rows: [], has_more: false }
    : name === 'pdv_cash_snapshot_v2' ? { account_id: 'account', account_name: 'Cofre fictício', account_active: true, balance: 0, custody: 0, available: 0, open_v2_sessions: 0, open_legacy_sessions: 0, reconciliation_required: false }
    : { ok: true, session_id: 'session', terminal_id: 'terminal', opening_amount: 100, opened_at: '2026-11-24T12:00:00Z' } }));
});
describe('registro inicial na fronteira Supabase', () => {
  it.each(['PDV_TREASURY_INITIALIZATION_FORBIDDEN', 'PDV_TREASURY_ALREADY_INITIALIZED', 'PDV_TREASURY_INITIAL_BALANCE_INVALID'])('traduz %s sem expor código interno', (code) => {
    const error = mapPdvCashV2Error({ details: code, message: 'backend private failure' });
    expect(error.message).not.toContain(code);
    expect(error.message).not.toContain('backend');
    expect(error.message).not.toContain('Não foi possível concluir');
  });
  it('consulta elegibilidade no servidor e inicializa junto com a abertura', async () => {
    const { result, client } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await waitFor(() => expect(result.current.canInitializeTreasury).toBe(true));
    await act(() => result.current.openSession.mutateAsync({ terminalId: 'terminal', cashAccountId: 'account', openingAmount: 100, initialBalance: 300, attemptId: 'test-attempt' }));
    expect(state.rpc).toHaveBeenCalledWith('pdv_initialize_and_open_cash_v2', { p_terminal_id: 'terminal', p_cash_account_id: 'account', p_opening_amount: 100, p_initial_balance: 300, p_idempotency_key: 'test-attempt' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['financial-accounts'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account-balances'] });
  });
  it('não consulta elegibilidade nem oferece inicialização sem capacidade bancária', async () => {
    const { result } = setup(false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canInitializeTreasury).toBe(false);
    expect(state.rpc.mock.calls.some(([name]) => name === 'pdv_can_initialize_treasury_v2')).toBe(false);
  });
  it('preserva o contrato original quando não há declaração de saldo inicial', async () => {
    const { result } = setup(false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.openSession.mutateAsync({ terminalId: 'terminal', cashAccountId: 'account', openingAmount: 100, attemptId: 'ordinary-attempt' }));
    expect(state.rpc).toHaveBeenCalledWith('pdv_open_cash_session_v2', { p_terminal_id: 'terminal', p_cash_account_id: 'account', p_opening_amount: 100, p_idempotency_key: 'ordinary-attempt' });
  });
});
