import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  range: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
    rpc: mocks.rpc,
  },
}));

import { shouldRetryScheduleRead, useScheduleOrders } from './useScheduleOrders';

describe('useScheduleOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const rpcBuilder = {
      abortSignal: mocks.abortSignal,
      range: mocks.range,
    };
    mocks.rpc.mockReturnValue(rpcBuilder);
    mocks.abortSignal.mockReturnValue(rpcBuilder);
    mocks.range.mockResolvedValue({ data: [], error: null });
  });

  it('nao consulta enquanto perfil e sessao pertencem a usuarios diferentes', async () => {
    mocks.useAuth.mockReturnValue({
      profile: { company_id: 'company-1', user_id: 'user-antigo' },
      session: { user: { id: 'user-novo' }, access_token: 'token' },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const view = renderHook(
      () => useScheduleOrders({ startDate: '2026-11-01', endDate: '2026-11-30' }),
      { wrapper },
    );

    expect(view.result.current.isLoading).toBe(false);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('confirma a sessao antes de consultar a janela da Agenda', async () => {
    const session = { user: { id: 'user-1' }, access_token: 'token' };
    mocks.useAuth.mockReturnValue({
      profile: { company_id: 'company-1', user_id: 'user-1' },
      session,
    });
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const view = renderHook(
      () => useScheduleOrders({ startDate: '2026-11-01', endDate: '2026-11-30' }),
      { wrapper },
    );

    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('schedule_visible_entries_v1', {
      p_start_date: '2026-11-01',
      p_end_date: '2026-11-30',
    });
  });
});

describe('shouldRetryScheduleRead', () => {
  it('repete somente falhas transitorias e limita novas tentativas', () => {
    expect(shouldRetryScheduleRead(0, new Error('Failed to fetch'))).toBe(true);
    expect(shouldRetryScheduleRead(1, { code: 'PGRST000', message: 'temporarily unavailable' })).toBe(true);
    expect(shouldRetryScheduleRead(2, new Error('Failed to fetch'))).toBe(false);
  });

  it('nao repete consulta anonima ou com sessao em restauracao', () => {
    expect(shouldRetryScheduleRead(0, { code: '42501', message: 'permission denied' })).toBe(false);
    expect(
      shouldRetryScheduleRead(0, {
        code: 'schedule_session_unavailable',
        message: 'restabelecendo sessao',
      }),
    ).toBe(false);
  });
});
