import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  range: vi.fn(),
  from: vi.fn(),
  fetchAllPaginated: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock('@/utils/supabasePagination', () => ({
  fetchAllPaginated: mocks.fetchAllPaginated,
}));

import { fetchScheduleOrders } from './useScheduleOrders';

describe('fetchScheduleOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReturnValue({ range: mocks.range });
    mocks.from.mockReturnValue({});
  });

  it('usa leitura paginada e recortada quando a RPC falha', async () => {
    mocks.range.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'RPC indisponível' },
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
    })).resolves.toEqual([expect.objectContaining({
      id: 'os-1',
      _assignee_user_ids: ['user-1'],
    })]);

    expect(mocks.rpc).toHaveBeenCalledWith('schedule_visible_entries_v1', {
      p_start_date: '2026-11-01',
      p_end_date: '2026-11-30',
    });
    expect(mocks.fetchAllPaginated).toHaveBeenCalledTimes(4);
  });
});
