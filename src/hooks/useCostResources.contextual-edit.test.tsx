import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCostResources, type CostResource } from './useCostResources';

const state = vi.hoisted(() => ({ rows: [] as CostResource[], deleteError: null as Error | null, filters: [] as Array<[string, string]>, insert: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'company-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => {
    if (table === 'cost_resources_with_rate') {
      const view = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        then(resolve: (value: { data: CostResource[]; error: null }) => unknown) { return Promise.resolve({ data: state.rows, error: null }).then(resolve); },
      };
      return view;
    }
    if (table === 'cost_resources') return { update: (updates: Record<string, unknown>) => ({
      eq(column: string, value: string) { state.filters.push([column, value]); return this; },
      then(resolve: (value: { error: null }) => unknown) {
        state.rows = state.rows.map(row => ({ ...row, name: String(updates.name ?? row.name), hourly_rate: 80 }));
        return Promise.resolve({ error: null }).then(resolve);
      },
    }) };
    if (table === 'cost_resource_items') return {
      delete: () => ({ eq: () => Promise.resolve({ error: state.deleteError }) }),
      insert: (rows: unknown) => { state.insert(rows); return Promise.resolve({ error: null }); },
    };
    throw new Error(`Leitura inesperada no teste: ${table}`);
  } },
}));

beforeEach(() => {
  state.rows = [{ id: 'resource-1', company_id: 'company-1', name: 'Bomba original', category: 'tool', is_active: true, hourly_rate: 20 } as CostResource];
  state.deleteError = null; state.filters = []; state.insert.mockReset(); state.toast.mockReset();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => ({
    catalog: useCostResources(),
    active: useQuery({ queryKey: ['cost-resources-active', 'company-1'], queryFn: async () => state.rows }),
  }), { wrapper });
  return { ...hook, invalidate };
}

describe('useCostResources — salvar cadastro no contexto do serviço', () => {
  it('atualiza as duas leituras visíveis e invalida todas as composições afetadas na mutation canônica', async () => {
    const { result, invalidate } = setup();
    await waitFor(() => expect(result.current.catalog.resources[0]?.name).toBe('Bomba original'));
    await act(async () => { await result.current.catalog.updateResource.mutateAsync({ id: 'resource-1', name: 'Bomba revisada', items: [{ name: 'Depreciação', value: 14080, is_monthly: true }] }); });
    await waitFor(() => {
      expect(result.current.catalog.resources[0]?.name).toBe('Bomba revisada');
      expect(result.current.active.data?.[0]?.hourly_rate).toBe(80);
    });
    expect(state.filters).toContainEqual(['id', 'resource-1']);
    expect(state.filters).toContainEqual(['company_id', 'company-1']);
    for (const root of ['cost-resources', 'cost-resources-active', 'cost-resource-items', 'service-cost-resources', 'service-gifts', 'service-cost-breakdown']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [root] });
    }
    expect(state.insert).toHaveBeenCalledWith([expect.objectContaining({ resource_id: 'resource-1', name: 'Depreciação', value: 14080 })]);
  });

  it('não insere uma nova composição quando a exclusão da anterior falha e atualiza o que já foi salvo', async () => {
    state.deleteError = new Error('Não foi possível atualizar os itens');
    const { result, invalidate } = setup();
    await act(async () => {
      await expect(result.current.catalog.updateResource.mutateAsync({ id: 'resource-1', name: 'Nome salvo antes da falha', items: [{ name: 'Novo custo', value: 50, is_monthly: true }] })).rejects.toThrow('itens');
    });
    expect(state.insert).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cost-resources-active'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['service-cost-breakdown'] });
    await waitFor(() => expect(result.current.catalog.resources[0]?.name).toBe('Nome salvo antes da falha'));
  });
});
