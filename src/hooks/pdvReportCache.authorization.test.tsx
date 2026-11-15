import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { id: 'user-1' }, profile: { company_id: 'company-1' }, permissions: ['screen:pdv'], roles: ['comercial'], hasPermissionRecord: true, profileLoading: false, loading: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
import { usePdvAuthorizedQueryScope } from './pdvReportCache';

describe('readiness das leituras autorizadas', () => {
  beforeEach(() => { auth.profileLoading = false; auth.loading = false; auth.permissions = ['screen:pdv']; });
  it.each(['profileLoading', 'loading'] as const)('não retorna dado cacheado durante %s com a mesma identidade', async phase => {
    const query = vi.fn().mockResolvedValue({ availableCredit: 150 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(() => {
      const scope = usePdvAuthorizedQueryScope();
      return useQuery({ queryKey: ['pdv-customer-payment-options', ...scope.key, 'customer-1'], queryFn: query, enabled: scope.ready });
    }, { wrapper });
    await waitFor(() => expect(result.current.data?.availableCredit).toBe(150));
    auth[phase] = true;
    rerender();
    expect(result.current.data).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('não reaproveita uma leitura ao revogar a permissão', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: ['pedido-autorizado'] }).mockRejectedValueOnce(new Error('Acesso revogado'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(() => {
      const scope = usePdvAuthorizedQueryScope();
      return useQuery({ queryKey: ['pdv-orders', ...scope.key], queryFn: query, enabled: scope.ready });
    }, { wrapper });
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(1));
    auth.permissions = [];
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
