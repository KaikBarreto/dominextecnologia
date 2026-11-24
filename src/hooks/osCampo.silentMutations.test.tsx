import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { table: string; op: string; options?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  // contagem devolvida para qualquer escrita (update/delete)
  writeCount: 0 as number,
  toast: vi.fn(),
  rpc: vi.fn(),
}));

// Builder que aceita qualquer encadeamento; leituras devolvem lista vazia.
function builder(table: string) {
  const call: Call = { table, op: 'select' };
  const target: Record<string, unknown> = {
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return proxy; },
    update: (_values: unknown, options?: unknown) => { call.op = 'update'; call.options = options; return proxy; },
    insert: () => { call.op = 'insert'; return proxy; },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      state.calls.push(call);
      const isWrite = call.op === 'update' || call.op === 'delete';
      const result = isWrite
        ? { data: null, error: null, count: state.writeCount }
        : { data: [], error: null, count: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  const proxy: unknown = new Proxy(target, {
    get: (obj, key: string) => (key in obj ? obj[key] : () => proxy),
  });
  return proxy;
}

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user-a' }, profile: { company_id: 'company-a', user_id: 'user-a', is_active: true },
  permissions: [], roles: ['admin'], hasPermissionRecord: true, profileLoading: false, loading: false,
}) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => builder(table), rpc: state.rpc, auth: { getUser: vi.fn() } },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: () => Promise.resolve('company-a') }));

import { useOsStatuses } from './useOsStatuses';
import { useTeams } from './useTeams';
import { useServiceOrders } from './useServiceOrders';
import { useEquipment } from './useEquipment';
import { useFormTemplates } from './useFormTemplates';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const successToasts = () => state.toast.mock.calls.filter(([arg]) => !(arg as { variant?: string }).variant);

beforeEach(() => { state.calls = []; state.writeCount = 0; state.toast.mockReset(); state.rpc.mockReset(); });

describe('Status da OS barrados pela permissão', () => {
  it('excluir status com zero linhas dá erro e não mostra sucesso', async () => {
    const { result } = renderHook(() => useOsStatuses(), { wrapper });
    await expect(result.current.deleteStatus.mutateAsync('st-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    const del = state.calls.find((c) => c.op === 'delete');
    expect(del?.options).toEqual({ count: 'exact' });
    expect(successToasts()).toHaveLength(0);
  });

  it('editar status com zero linhas dá erro; com uma linha segue normal', async () => {
    const { result } = renderHook(() => useOsStatuses(), { wrapper });
    await expect(result.current.updateStatus.mutateAsync({ id: 'st-1', label: 'X' })).rejects.toBeInstanceOf(NoRowsAffectedError);
    state.writeCount = 1;
    await expect(result.current.updateStatus.mutateAsync({ id: 'st-1', label: 'X' })).resolves.toBeUndefined();
  });

  it('reordenar status barrado em algum item dá erro', async () => {
    const { result } = renderHook(() => useOsStatuses(), { wrapper });
    await expect(result.current.reorderStatuses.mutateAsync(['a', 'b'])).rejects.toBeInstanceOf(NoRowsAffectedError);
  });
});

describe('Excluir equipe, OS, equipamento e checklist barrados', () => {
  // Equipe e OS excluem pela RPC tudo-ou-nada: a recusa vem do banco com
  // mensagem PT-BR e nada foi apagado; nenhuma escrita sai direto do navegador.
  const refusal = (what: string) => ({ data: null, error: { code: '42501', message: `Não foi possível excluir ${what}: você não tem permissão para esta ação ou ela já não existe.` } });

  it('excluir equipe sem permissão avisa erro com a mensagem do banco e não escreve nada direto', async () => {
    state.rpc.mockResolvedValueOnce(refusal('a equipe'));
    const { result } = renderHook(() => useTeams(), { wrapper });
    await expect(result.current.deleteTeam.mutateAsync('team-1')).rejects.toThrow('Não foi possível excluir a equipe');
    expect(state.rpc).toHaveBeenCalledWith('delete_team_cascade', { p_team_id: 'team-1' });
    expect(state.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    expect(successToasts()).toHaveLength(0);
  });

  it('excluir OS sem permissão avisa erro com a mensagem do banco e não escreve nada direto', async () => {
    state.rpc.mockResolvedValueOnce(refusal('a OS'));
    const { result } = renderHook(() => useServiceOrders(), { wrapper });
    const failure = result.current.deleteServiceOrder.mutateAsync('os-1');
    await expect(failure).rejects.toBeInstanceOf(NoRowsAffectedError);
    await expect(failure).rejects.toThrow('Não foi possível excluir a OS');
    expect(state.rpc).toHaveBeenCalledWith('delete_service_order_cascade', { p_service_order_id: 'os-1' });
    expect(state.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    expect(successToasts()).toHaveLength(0);
  });

  it('excluir OS com sucesso mostra o toast de sucesso', async () => {
    state.rpc.mockResolvedValueOnce({ data: { service_order_id: 'os-1' }, error: null });
    const { result } = renderHook(() => useServiceOrders(), { wrapper });
    await result.current.deleteServiceOrder.mutateAsync('os-1');
    expect(successToasts().length).toBeGreaterThan(0);
  });

  it('excluir equipamento sem permissão dá erro; com permissão devolve o id', async () => {
    const { result } = renderHook(() => useEquipment(), { wrapper });
    await expect(result.current.deleteEquipment.mutateAsync('eq-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    state.writeCount = 1;
    await expect(result.current.deleteEquipment.mutateAsync('eq-1')).resolves.toBe('eq-1');
  });

  it('remover pergunta de checklist sem permissão dá erro', async () => {
    const { result } = renderHook(() => useFormTemplates(), { wrapper });
    await expect(result.current.deleteQuestion.mutateAsync('q-1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(successToasts()).toHaveLength(0);
  });
});
