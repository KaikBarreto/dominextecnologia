import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  queryAbortSignal: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  gt: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  order: vi.fn(),
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

import { fetchScheduleOrders } from './useScheduleOrders';

describe('fetchScheduleOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const rpcBuilder = {
      abortSignal: mocks.abortSignal,
    };
    const queryBuilder = {
      select: mocks.select,
      gt: mocks.gt,
      gte: mocks.gte,
      lte: mocks.lte,
      order: mocks.order,
      abortSignal: mocks.queryAbortSignal,
    };
    mocks.rpc.mockReturnValue(rpcBuilder);
    mocks.from.mockReturnValue(queryBuilder);
    mocks.select.mockReturnValue(queryBuilder);
    mocks.gt.mockReturnValue(queryBuilder);
    mocks.gte.mockReturnValue(queryBuilder);
    mocks.lte.mockReturnValue(queryBuilder);
    mocks.order.mockReturnValue(queryBuilder);
    mocks.queryAbortSignal.mockReturnValue(queryBuilder);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'token', user: { id: 'user-1' } } },
      error: null,
    });
  });

  it('usa leitura paginada e recortada quando a consulta principal falha', async () => {
    mocks.abortSignal.mockResolvedValue({
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

    expect(mocks.rpc).toHaveBeenCalledWith('schedule_visible_entries_v2', {
      p_start_date: '2026-11-01',
      p_end_date: '2026-11-30',
      p_after_scheduled_date: null,
      p_after_scheduled_time: null,
      p_after_scheduled_time_is_null: null,
      p_after_order_number: null,
      p_after_id: null,
      p_page_size: 500,
    });
    expect(mocks.fetchAllPaginated).toHaveBeenCalledTimes(4);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('recorta jornadas múltiplas pela última data do plano sem impor limite histórico', async () => {
    mocks.abortSignal.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Consulta indisponível' },
    });
    mocks.fetchAllPaginated.mockResolvedValue([]);

    await fetchScheduleOrders({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, 'user-1');

    const multiDayFactory = mocks.fetchAllPaginated.mock.calls[1]?.[0];
    expect(multiDayFactory).toBeTypeOf('function');

    multiDayFactory();
    expect(mocks.gte).toHaveBeenCalledWith('schedule_plan->-1->>date', '2026-11-01');
  });

  it('nao troca uma consulta cancelada por uma nova leitura de fallback', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(fetchScheduleOrders({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, 'user-1', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetchAllPaginated).not.toHaveBeenCalled();
  });
});
