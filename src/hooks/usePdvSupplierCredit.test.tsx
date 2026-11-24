import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false },
  rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { usePdvSupplierCredit } from './usePdvSupplierCredit';

function context() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

describe('saldo autorizado do fornecedor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false };
  });
  it.each(['user', 'company', 'permissions'])('não reaproveita crédito ao trocar %s', async change => {
    state.rpc.mockResolvedValueOnce({ data: { available_credit: 150 }, error: null }).mockResolvedValueOnce({ data: { available_credit: 20 }, error: null });
    const { wrapper, client } = context();
    const { result, rerender } = renderHook(() => usePdvSupplierCredit('supplier-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(150));
    if (change === 'user') { state.auth.user = { id: 'user-2' }; state.auth.profile.user_id = 'user-2'; }
    if (change === 'company') state.auth.profile = { company_id: 'company-2', user_id: state.auth.user.id, is_active: true };
    if (change === 'permissions') state.auth.permissions = [];
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBe(20));
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(client.getQueryCache().getAll().every(query => query.queryKey[0] === 'pdv-supplier-credit')).toBe(true);
  });
  it.each(['loading', 'profileLoading'] as const)('não conserva o crédito durante %s com identidade igual', async phase => {
    state.rpc.mockResolvedValue({ data: { available_credit: 150 }, error: null });
    const { wrapper } = context();
    const { result, rerender } = renderHook(() => usePdvSupplierCredit('supplier-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(150));
    state.auth[phase] = true;
    rerender();
    expect(result.current.data).toBeUndefined();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it('não transforma erro em crédito zero nem expõe erro técnico', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied table private' } });
    const { wrapper } = context();
    const { result } = renderHook(() => usePdvSupplierCredit('supplier-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe('Não foi possível consultar o saldo do fornecedor.');
  });
});
