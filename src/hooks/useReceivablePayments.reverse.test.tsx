import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]> };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  mainDeleteCount: 1,
  toast: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  Object.assign(chain, {
    select: () => chain,
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    eq: filter('eq'), in: filter('in'), order: () => chain,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      state.calls.push(call);
      let response: unknown = { data: [], error: null };
      if (call.op === 'select' && call.filters.some(([, column]) => column === 'parent_transaction_id')) {
        response = { data: [{ id: 'fee-1' }], error: null };
      }
      if (call.op === 'delete') {
        const isMain = call.filters.some(([kind, column]) => kind === 'eq' && column === 'id');
        response = { data: null, error: null, count: isMain ? state.mainDeleteCount : 1 };
      }
      return Promise.resolve(response).then(resolve, reject);
    },
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table) } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
import { useReceivablePayments } from './useReceivablePayments';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const deletes = () => state.calls.filter((call) => call.op === 'delete');

beforeEach(() => { state.calls = []; state.mainDeleteCount = 1; state.toast.mockReset(); });

describe('estornar recebimento parcial', () => {
  it('sem permissão (0 linhas): erro, sem "estornado" e sem apagar a tarifa vinculada', async () => {
    state.mainDeleteCount = 0;
    const { result } = renderHook(() => useReceivablePayments(null), { wrapper });
    await expect(result.current.reverse.mutateAsync('pay-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]).toMatchObject({ options: { count: 'exact' }, filters: [['eq', 'id', 'pay-1']] });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Recebimento estornado' }));
  });

  it('quando estorna, apaga a tarifa vinculada pelos ids lidos antes', async () => {
    const { result } = renderHook(() => useReceivablePayments(null), { wrapper });
    await result.current.reverse.mutateAsync('pay-1');
    expect(deletes().map((call) => call.filters)).toEqual([[['eq', 'id', 'pay-1']], [['in', 'id', ['fee-1']]]]);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recebimento estornado' }));
  });
});
