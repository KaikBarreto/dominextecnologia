import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown; filters: Array<[string, string, unknown]>; values?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  writeCount: 1 as number | null,
  toast: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const chain: Record<string, unknown> = {};
  const filter = (kind: string) => (column: string, value: unknown) => { call.filters.push([kind, column, value]); return chain; };
  Object.assign(chain, {
    select: () => chain,
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    update: (values: unknown, options?: unknown) => { call.op = 'update'; call.values = values; call.options = options; return chain; },
    eq: filter('eq'), in: filter('in'), order: () => chain,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      state.calls.push(call);
      const response = call.op === 'select' ? { data: [], error: null } : { data: null, error: null, count: state.writeCount };
      return Promise.resolve(response).then(resolve, reject);
    },
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table) } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
import { usePermissionPresets, useUserPermissions } from './usePermissions';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const writes = () => state.calls.filter((call) => call.op !== 'select');
const successToast = (title: string) => expect.objectContaining({ title });

beforeEach(() => { state.calls = []; state.writeCount = 1; state.toast.mockReset(); });

describe('cargos e permissões: escrita barrada pela permissão não vira sucesso', () => {
  it('editar cargo com 0 linhas afetadas lança erro e não mostra "Cargo atualizado"', async () => {
    state.writeCount = 0;
    const { result } = renderHook(() => usePermissionPresets(), { wrapper });
    await expect(result.current.updatePreset.mutateAsync({ id: 'preset-1', name: 'Técnico' })).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()[0]).toMatchObject({ table: 'permission_presets', op: 'update', options: { count: 'exact' } });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(successToast('Cargo atualizado com sucesso!'));
  });

  it('excluir cargo com 0 linhas afetadas lança erro e não mostra "Cargo excluído"', async () => {
    state.writeCount = 0;
    const { result } = renderHook(() => usePermissionPresets(), { wrapper });
    await expect(result.current.deletePreset.mutateAsync('preset-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()[0]).toMatchObject({ table: 'permission_presets', op: 'delete', options: { count: 'exact' } });
    expect(state.toast).not.toHaveBeenCalledWith(successToast('Cargo excluído com sucesso!'));
  });

  it('ativar/desativar acesso do usuário com 0 linhas afetadas lança erro', async () => {
    state.writeCount = 0;
    const { result } = renderHook(() => useUserPermissions(), { wrapper });
    await expect(result.current.toggleActive.mutateAsync({ user_id: 'user-b', is_active: false })).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(writes()[0]).toMatchObject({ table: 'user_permissions', op: 'update', options: { count: 'exact' } });
    expect(state.toast).not.toHaveBeenCalledWith(successToast('Status atualizado!'));
  });

  it('quando grava, mostra o sucesso normalmente', async () => {
    const { result } = renderHook(() => usePermissionPresets(), { wrapper });
    await result.current.deletePreset.mutateAsync('preset-1');
    expect(state.toast).toHaveBeenCalledWith(successToast('Cargo excluído com sucesso!'));
  });
});
