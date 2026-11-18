import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  range: vi.fn(),
  from: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  fetchAllPaginated: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
  },
}));
vi.mock('@/utils/supabasePagination', () => ({
  fetchAllPaginated: mocks.fetchAllPaginated,
}));

import { fetchScheduleOrders, withScheduleRequestTimeout } from './useScheduleOrders';

describe('fetchScheduleOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const rpcBuilder = {
      abortSignal: mocks.abortSignal,
      range: mocks.range,
    };
    mocks.rpc.mockReturnValue(rpcBuilder);
    mocks.abortSignal.mockReturnValue(rpcBuilder);
    mocks.from.mockReturnValue({});
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'token', user: { id: 'user-1' } } },
      error: null,
    });
  });

  it('usa leitura paginada e recortada quando a consulta principal falha', async () => {
    mocks.range.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Consulta indisponível' },
    });
    mocks.fetchAllPaginated
      .mockResolvedValueOnce([{
        id: 'os-1',
        status: 'pendente',
        scheduled_date: '2026-11-18',
        schedule_plan: [],
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ service_order_id: 'os-1', user_id: 'user-1' }]);

    await expect(fetchScheduleOrders({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, 'user-1')).resolves.toEqual([expect.objectContaining({
      id: 'os-1',
      _assignee_user_ids: ['user-1'],
    })]);

    expect(mocks.rpc).toHaveBeenCalledWith('schedule_visible_entries_v1', {
      p_start_date: '2026-11-01',
      p_end_date: '2026-11-30',
    });
    expect(mocks.fetchAllPaginated).toHaveBeenCalledTimes(4);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
});

describe('withScheduleRequestTimeout', () => {
  it('aborta e encerra uma consulta que nao responde', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;

    const pending = withScheduleRequestTimeout((signal) => {
      capturedSignal = signal;
      return new Promise<never>(() => {});
    }, 50);

    const assertion = expect(pending).rejects.toMatchObject({
      code: 'schedule_request_timeout',
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(capturedSignal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
