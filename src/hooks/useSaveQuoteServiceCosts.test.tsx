import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveQuoteServiceCosts, type CatalogCostSnapshot } from './useSaveQuoteServiceCosts';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const snapshots = ['service-1', 'service-2'].map(serviceId => ({
  serviceId,
  composition: {
    labor: { hourlyRate: 45, hours: 3 },
    resources: [],
    supplies: [],
  },
})) as CatalogCostSnapshot[];

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

beforeEach(() => rpc.mockReset());

describe('salvamento da composição no catálogo', () => {
  it.each([false, true])('atualiza todas as leituras do catálogo, inclusive após falha parcial: %s', async failSecond => {
    rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({
      error: failSecond ? new Error('Falha ao salvar o segundo serviço') : null,
    });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveQuoteServiceCosts(), { wrapper });

    await act(async () => {
      const saving = result.current.mutateAsync(snapshots);
      if (failSecond) await expect(saving).rejects.toThrow('segundo serviço');
      else await saving;
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'save_service_cost_composition_from_quote', {
      _service_id: 'service-1', _hourly_rate: 45, _hours: 3, _resources: [], _supplies: [],
    });
    for (const root of ['service-costs', 'service-materials', 'service-cost-resources', 'service-gifts', 'service-cost-breakdown']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [root] });
    }
  });
});
