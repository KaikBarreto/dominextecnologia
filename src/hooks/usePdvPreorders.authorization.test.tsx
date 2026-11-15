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
import { usePdvPreorder, usePdvPreorderQueue } from './usePdvPreorders';

function context() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

function useList() { return usePdvPreorderQueue(null); }
function useDetail() { return usePdvPreorder('pre-1'); }

describe('cache autorizado de orçamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false };
  });
  for (const reader of ['list', 'detail'] as const) {
    const useRead = reader === 'list' ? useList : useDetail;
    it.each(['user', 'company', 'permissions'])('não reaproveita '+reader+' ao trocar %s', async change => {
      state.rpc.mockResolvedValueOnce({ data: { marker: 'anterior' }, error: null }).mockResolvedValueOnce({ data: { marker: 'atual' }, error: null });
      const { wrapper } = context();
      const { result, rerender } = renderHook(() => useRead(), { wrapper });
      await waitFor(() => expect(result.current.data).toEqual({ marker: 'anterior' }));
      if (change === 'user') { state.auth.user = { id: 'user-2' }; state.auth.profile.user_id = 'user-2'; }
      if (change === 'company') state.auth.profile = { company_id: 'company-2', user_id: state.auth.user.id, is_active: true };
      if (change === 'permissions') state.auth.permissions = [];
      rerender();
      expect(result.current.data).toBeUndefined();
      await waitFor(() => expect(result.current.data).toEqual({ marker: 'atual' }));
      expect(state.rpc).toHaveBeenCalledTimes(2);
    });
    it.each(['loading', 'profileLoading'] as const)('esconde '+reader+' durante %s mesmo mantendo identidade', async phase => {
      state.rpc.mockResolvedValue({ data: { marker: 'anterior' }, error: null });
      const { wrapper } = context();
      const { result, rerender } = renderHook(() => useRead(), { wrapper });
      await waitFor(() => expect(result.current.data).toEqual({ marker: 'anterior' }));
      state.auth[phase] = true;
      rerender();
      expect(result.current.data).toBeUndefined();
      expect(state.rpc).toHaveBeenCalledTimes(1);
    });
  }
});
