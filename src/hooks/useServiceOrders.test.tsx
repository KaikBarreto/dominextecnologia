import { createElement, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, serviceOrderRange } = vi.hoisted(() => ({
  from: vi.fn(),
  serviceOrderRange: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      from(table);

      if (table === 'service_orders') {
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          range: serviceOrderRange,
        };
        return query;
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'usuario-1' } }),
}));

import { useServiceOrders } from './useServiceOrders';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function queryWrapper(client: QueryClient) {
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
}

describe('useServiceOrders', () => {
  beforeEach(() => {
    from.mockClear();
    serviceOrderRange.mockReset();
  });

  it('pagina todo o histórico e aproveita responsáveis embutidos sem fan-out', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `os-${index}`,
      created_by: null,
      assignees: index === 0 ? [{ user_id: 'tecnico-1' }, { user_id: 'tecnico-2' }] : [],
      snapshot_data: null,
    }));
    const secondPage = [{
      id: 'os-1000',
      created_by: null,
      assignees: [{ user_id: 'tecnico-3' }],
      snapshot_data: null,
    }];

    serviceOrderRange
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: secondPage, error: null });

    const client = createQueryClient();
    const { result, unmount } = renderHook(() => useServiceOrders(), {
      wrapper: queryWrapper(client),
    });

    await waitFor(() => expect(result.current.serviceOrders).toHaveLength(1001));

    expect(result.current.serviceOrders[0]._assignee_user_ids).toEqual([
      'tecnico-1',
      'tecnico-2',
    ]);
    expect(result.current.serviceOrders[1000]._assignee_user_ids).toEqual(['tecnico-3']);
    expect(result.current.serviceOrders[0]).not.toHaveProperty('assignees');
    expect(serviceOrderRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(serviceOrderRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(from).not.toHaveBeenCalledWith('service_order_assignees');

    unmount();

    const cached = renderHook(() => useServiceOrders(), {
      wrapper: queryWrapper(client),
    });

    expect(cached.result.current.serviceOrders).toHaveLength(1001);
    expect(serviceOrderRange).toHaveBeenCalledTimes(2);
  });

  it('não busca o histórico quando o consumidor usa apenas mutations', () => {
    const client = createQueryClient();
    const { result } = renderHook(
      () => useServiceOrders({ loadServiceOrders: false }),
      { wrapper: queryWrapper(client) },
    );

    expect(result.current.serviceOrders).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
