import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

// Quando a RLS barra UPDATE/DELETE o PostgREST responde sem erro e com 0
// linhas. Estes testes garantem que as telas do CRM tratam isso como falha.

type Call = { table: string; op: string; options?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  count: 0 as number | null,
  toast: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, op: 'select' };
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    order: () => chain,
    eq: () => chain,
    in: () => chain,
    delete: (options?: unknown) => { call.op = 'delete'; call.options = options; return chain; },
    update: (_values: unknown, options?: unknown) => { call.op = 'update'; call.options = options; return chain; },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      state.calls.push(call);
      const result = call.op === 'select'
        ? { data: [], error: null }
        : { data: null, error: null, count: state.count };
      return Promise.resolve(result).then(resolve, reject);
    },
  });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => builder(table), rpc: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' }, profile: { company_id: 'company-a' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));

import { useQuotes } from './useQuotes';
import { useCrmStages } from './useCrmStages';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { state.calls = []; state.count = 0; state.toast.mockReset(); });

describe('orçamentos: ações barradas pela permissão', () => {
  it('mudar status sem permissão dá erro e não mostra sucesso', async () => {
    const { result } = renderHook(() => useQuotes(), { wrapper });
    await act(async () => {
      await expect(result.current.updateStatus.mutateAsync({ id: 'q1', status: 'enviado' })).rejects.toBeInstanceOf(NoRowsAffectedError);
    });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Status atualizado!' }));
  });

  it('excluir sem permissão dá erro e não mostra sucesso', async () => {
    const { result } = renderHook(() => useQuotes(), { wrapper });
    await act(async () => {
      await expect(result.current.deleteQuote.mutateAsync('q1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    });
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Orçamento excluído!' }));
  });

  it('com permissão, pede a contagem e mostra sucesso', async () => {
    state.count = 1;
    const { result } = renderHook(() => useQuotes(), { wrapper });
    await act(async () => { await result.current.deleteQuote.mutateAsync('q1'); });
    const del = state.calls.find((c) => c.op === 'delete');
    expect(del?.options).toEqual({ count: 'exact' });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Orçamento excluído!' }));
  });
});

describe('etapas do CRM: ações barradas pela permissão', () => {
  it('excluir etapa sem permissão dá erro e não mostra sucesso', async () => {
    const { result } = renderHook(() => useCrmStages(), { wrapper });
    await act(async () => {
      await expect(result.current.deleteStage.mutateAsync('s1')).rejects.toBeInstanceOf(NoRowsAffectedError);
    });
    expect(state.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Estágio removido!' }));
  });

  it('reordenar com alguma etapa barrada dá erro', async () => {
    const { result } = renderHook(() => useCrmStages(), { wrapper });
    await act(async () => {
      await expect(result.current.reorderStages.mutateAsync(['a', 'b'])).rejects.toBeInstanceOf(NoRowsAffectedError);
    });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao reordenar estágios' }));
  });
});
