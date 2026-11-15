import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  optOutError: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> & PromiseLike<unknown> = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        in: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        order: () => builder,
        then: (resolve, reject) => {
          db.calls.push({ table, filters: { ...filters } });
          if (table === 'whatsapp_opt_outs' && db.optOutError) {
            return Promise.resolve({ data: null, error: new Error('opt-outs indisponíveis') }).then(resolve, reject);
          }
          const data = table === 'customer_whatsapp_routes'
            ? [{
              id: 'route-1', company_id: 'company-1', customer_id: 'customer-1',
              category: 'service_order', enabled: true, created_by: null,
              created_at: '', updated_at: '',
            }]
            : table === 'customer_whatsapp_route_recipients'
              ? [{
                id: 'recipient-1', route_id: 'route-1', recipient_kind: 'customer_primary',
                customer_contact_id: null, created_at: '',
              }]
              : [{ phone: '5521999990000' }];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc: vi.fn(),
  },
}));

import { useCustomerWhatsappRoutes } from './useCustomerWhatsappRoutes';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  db.calls = [];
  db.optOutError = false;
});

describe('useCustomerWhatsappRoutes — consultas seguras', () => {
  it('filtra rotas e opt-outs explicitamente pela empresa do cliente', async () => {
    const { result } = renderHook(
      () => useCustomerWhatsappRoutes('customer-1', true, 'company-1'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(db.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'customer_whatsapp_routes',
        filters: expect.objectContaining({ company_id: 'company-1', customer_id: 'customer-1' }),
      }),
      expect.objectContaining({
        table: 'whatsapp_opt_outs',
        filters: expect.objectContaining({ company_id: 'company-1' }),
      }),
    ]));
    expect(result.current.routeByCategory('service_order')?.recipients).toHaveLength(1);
    expect(result.current.optedOutPhones).toEqual(['5521999990000']);
  });

  it('o refetch combinado recupera também uma falha da consulta de opt-out', async () => {
    db.optOutError = true;
    const { result } = renderHook(
      () => useCustomerWhatsappRoutes('customer-1', true, 'company-1'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    db.optOutError = false;
    let snapshot: Awaited<ReturnType<typeof result.current.refetch>> | undefined;
    await act(async () => {
      snapshot = await result.current.refetch();
    });

    expect(snapshot?.optedOutPhones).toEqual(['5521999990000']);
    expect(db.calls.filter((call) => call.table === 'whatsapp_opt_outs')).toHaveLength(2);
  });
});
