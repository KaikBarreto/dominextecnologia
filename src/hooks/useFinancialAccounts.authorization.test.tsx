import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  scope: { ready: true, key: ['scope', 'company-1', 'user-1', 'explicit', 'fn:manage_bank_accounts', 'operator'] },
  bank: { canUseBankAccounts: true, canManageBankAccounts: true },
  account: { id: 'account-1', initial_balance: 100, type: 'banco', name: 'Banco 1' },
  from: vi.fn(), rpc: vi.fn(), transactions: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useBankPermissions', () => ({ useBankPermissions: () => state.bank }));
vi.mock('@/hooks/pdvReportCache', () => ({ usePdvAuthorizedQueryScope: () => state.scope }));
vi.mock('@/utils/supabasePagination', () => ({ fetchAllPaginated: state.transactions }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, rpc: state.rpc } }));
import { useFinancialAccounts } from './useFinancialAccounts';

function context() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

describe('isolamento de contas e saldos financeiros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.scope = { ready: true, key: ['scope', 'company-1', 'user-1', 'explicit', 'fn:manage_bank_accounts', 'operator'] };
    state.bank = { canUseBankAccounts: true, canManageBankAccounts: true };
    state.account = { id: 'account-1', initial_balance: 100, type: 'banco', name: 'Banco 1' };
    const chain = { select: vi.fn(), order: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [state.account], error: null }).then(resolve) };
    chain.select.mockReturnValue(chain); chain.order.mockReturnValue(chain); state.from.mockReturnValue(chain);
    state.rpc.mockResolvedValue({ data: [{ id: 'usable-1', name: 'Conta operacional', type: 'banco' }], error: null });
    state.transactions.mockResolvedValue([{ account_id: 'account-1', transaction_type: 'entrada', amount: 30, is_paid: true, credit_card_bill_date: null, cancelled_at: null }]);
  });
  it.each(['company', 'user'])('não reutiliza contas ou saldos ao trocar %s', async kind => {
    const { wrapper } = context();
    const { result, rerender } = renderHook(() => useFinancialAccounts(), { wrapper });
    await waitFor(() => expect(result.current.balances['account-1']).toBe(130));
    state.scope = { ready: true, key: ['scope', kind === 'company' ? 'company-2' : 'company-1', 'user-2', 'explicit', 'fn:manage_bank_accounts', 'operator'] };
    state.account = { id: 'account-2', initial_balance: 200, type: 'banco', name: 'Banco 2' };
    state.transactions.mockResolvedValue([]);
    rerender();
    expect(result.current.accounts).toEqual([]);
    expect(result.current.balances).toEqual({});
    await waitFor(() => expect(result.current.accounts[0]?.id).toBe('account-2'));
    await waitFor(() => expect(result.current.balances['account-2']).toBe(200));
    expect(result.current.balances['account-1']).toBeUndefined();
  });
  it('limpa valores imediatamente ao revogar a permissão e bloqueia refetch sem autorização', async () => {
    const { wrapper } = context();
    const { result, rerender } = renderHook(() => useFinancialAccounts(), { wrapper });
    await waitFor(() => expect(result.current.balances['account-1']).toBe(130));
    state.bank = { canUseBankAccounts: false, canManageBankAccounts: false };
    state.scope.key = ['scope', 'company-1', 'user-1', 'explicit', 'screen:pdv', 'operator'];
    rerender();
    expect(result.current.accounts).toEqual([]);
    expect(result.current.balances).toEqual({});
    const calls = state.from.mock.calls.length;
    result.current.refetch();
    expect(state.from).toHaveBeenCalledTimes(calls);
  });
  it('não mantém os dados enquanto a autorização está sendo recarregada', async () => {
    const { wrapper } = context();
    const { result, rerender } = renderHook(() => useFinancialAccounts(), { wrapper });
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    state.scope.ready = false;
    rerender();
    expect(result.current.accounts).toEqual([]);
    expect(result.current.balances).toEqual({});
  });
  it('usuário que só usa contas recebe catálogo operacional sem saldo inicial', async () => {
    state.bank.canManageBankAccounts = false;
    const { wrapper } = context();
    const { result } = renderHook(() => useFinancialAccounts(), { wrapper });
    await waitFor(() => expect(result.current.accounts[0]?.id).toBe('usable-1'));
    expect(result.current.accounts[0].initial_balance).toBe(0);
    expect(result.current.balances).toEqual({});
    expect(state.from).not.toHaveBeenCalled();
    expect(state.transactions).not.toHaveBeenCalled();
  });
});
