import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({ calls: [] as Call[], writeCount: 0, toast: vi.fn() }));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  const settle = () => {
    state.calls.push(call);
    if (call.op === 'select') return Promise.resolve({ data: { id: 'role-row-1' }, error: null });
    return Promise.resolve({ data: null, error: null, count: state.writeCount });
  };
  Object.assign(chain, {
    select: () => chain,
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    insert: (values: unknown) => { call.op = 'insert'; call.values = values; return chain; },
    eq: filter('eq'), limit: () => chain, order: () => chain,
    maybeSingle: settle, single: settle,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => settle().then(resolve, reject),
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table) } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
import { useUsers } from './useUsers';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { state.calls = []; state.writeCount = 0; state.toast.mockReset(); });

describe('trocar papel do usuário', () => {
  it('papel existente e UPDATE barrado (0 linhas): erro, sem "Role atualizada"', async () => {
    const { result } = renderHook(() => useUsers(), { wrapper });
    await expect(result.current.updateUserRole.mutateAsync({ userId: 'user-b', role: 'gestor' })).rejects.toBeInstanceOf(NoRowsAffectedError);
    const update = state.calls.find((call) => call.op === 'update');
    expect(update).toMatchObject({ table: 'user_roles', options: { count: 'exact' }, filters: [['eq', 'user_id', 'user-b']] });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Role atualizada com sucesso!' }));
  });

  it('quando grava, mostra o sucesso', async () => {
    state.writeCount = 1;
    const { result } = renderHook(() => useUsers(), { wrapper });
    await result.current.updateUserRole.mutateAsync({ userId: 'user-b', role: 'gestor' });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Role atualizada com sucesso!' }));
  });
});
