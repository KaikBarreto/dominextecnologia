import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

const state = vi.hoisted(() => ({
  persist: vi.fn(),
  persistResults: [] as Promise<{ error: unknown; count?: number | null } | undefined>[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const responseQuery = {
    eq: vi.fn(() => responseQuery),
    is: vi.fn(() => responseQuery),
    // A gravação procura a linha mais recente da tripla (`writeFormResponse`).
    order: vi.fn(() => responseQuery),
    limit: vi.fn(async () => ({ data: [{ id: 'response-1' }], error: null })),
  };
  const activityQuery = {
    eq: vi.fn(() => activityQuery),
    order: vi.fn(() => activityQuery),
    range: vi.fn(async () => ({ data: [], error: null })),
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
      },
      from: vi.fn((table: string) => {
        if (table === 'service_order_activities') {
          return { select: vi.fn(() => activityQuery) };
        }
        if (table === 'form_responses') {
          return {
            select: vi.fn(() => responseQuery),
            update: vi.fn((payload: unknown) => ({ eq: vi.fn(() => state.persist(payload)) })),
            insert: vi.fn((payload: unknown) => state.persist(payload)),
          };
        }
        throw new Error(`Tabela inesperada no teste: ${table}`);
      }),
    },
  };
});

import { useOsActivityChecklist } from './useOsActivityChecklist';

function deferredPersist() {
  // `count` é o número de linhas que o UPDATE afetou (`{ count: 'exact' }`):
  // 1 no caminho feliz; 0 quando a permissão barra sem erro do banco.
  let resolve!: (value: { error: unknown; count?: number | null }) => void;
  const promise = new Promise<{ error: unknown; count?: number | null }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useOsActivityChecklist — fila de assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.persistResults = [];
    state.persist.mockImplementation(() =>
      state.persistResults.shift() ?? Promise.resolve({ error: null, count: 1 }),
    );
  });

  it('serializa os snapshots e mantém o último traço como estado otimista', async () => {
    const firstPersist = deferredPersist();
    const secondPersist = deferredPersist();
    state.persistResults.push(firstPersist.promise, secondPersist.promise);
    const { result } = renderHook(() => useOsActivityChecklist('os-A'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;
    act(() => {
      firstSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'traço-1' });
      secondSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'traço-2' });
    });

    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(1));
    expect(result.current.getFormResponse(null, 'question-1')?.response_value).toBe('traço-2');

    await act(async () => {
      firstPersist.resolve({ error: null, count: 1 });
      await firstSave;
    });
    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondPersist.resolve({ error: null, count: 1 });
      await secondSave;
    });

    expect(state.persist.mock.calls.map(([payload]) => payload)).toEqual([
      expect.objectContaining({ response_value: 'traço-1' }),
      expect.objectContaining({ response_value: 'traço-2' }),
    ]);
    expect(result.current.getFormResponse(null, 'question-1')?.response_value).toBe('traço-2');
  });

  it('volta ao último snapshot persistido quando apenas o mais novo falha', async () => {
    const firstPersist = deferredPersist();
    const secondPersist = deferredPersist();
    state.persistResults.push(firstPersist.promise, secondPersist.promise);
    const { result } = renderHook(() => useOsActivityChecklist('os-A'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;
    act(() => {
      firstSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'persistido' });
      secondSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'falhou' });
    });

    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(1));
    await act(async () => {
      firstPersist.resolve({ error: null, count: 1 });
      await firstSave;
    });
    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(2));

    const failure = { code: 'network_error', message: 'offline' };
    await act(async () => {
      secondPersist.resolve({ error: failure });
      await expect(secondSave).rejects.toEqual(failure);
    });
    await waitFor(() =>
      expect(result.current.getFormResponse(null, 'question-1')?.response_value).toBe('persistido'),
    );
  });

  it('UPDATE barrado pela permissão (0 linhas, sem erro) conta como falha e volta ao último snapshot persistido', async () => {
    const firstPersist = deferredPersist();
    const secondPersist = deferredPersist();
    state.persistResults.push(firstPersist.promise, secondPersist.promise);
    const { result } = renderHook(() => useOsActivityChecklist('os-A'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;
    act(() => {
      firstSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'persistido' });
      secondSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'barrado' });
    });

    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(1));
    await act(async () => {
      firstPersist.resolve({ error: null, count: 1 });
      await firstSave;
    });
    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondPersist.resolve({ error: null, count: 0 });
      await expect(secondSave).rejects.toBeInstanceOf(NoRowsAffectedError);
    });
    await waitFor(() =>
      expect(result.current.getFormResponse(null, 'question-1')?.response_value).toBe('persistido'),
    );
  });

  it('ignora a conclusão atrasada de outra OS, inclusive no rollback', async () => {
    const oldPersist = deferredPersist();
    state.persistResults.push(oldPersist.promise);
    const { result, rerender } = renderHook(
      ({ serviceOrderId }) => useOsActivityChecklist(serviceOrderId),
      { initialProps: { serviceOrderId: 'os-A' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let oldSave!: Promise<void>;
    act(() => {
      oldSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'assinatura-os-A' });
    });
    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(1));

    rerender({ serviceOrderId: 'os-B' });
    await waitFor(() => expect(result.current.getFormResponse(null, 'question-1')).toBeUndefined());
    await act(async () => {
      oldPersist.resolve({ error: null, count: 1 });
      await oldSave;
    });

    const currentPersist = deferredPersist();
    state.persistResults.push(currentPersist.promise);
    let currentSave!: Promise<void>;
    act(() => {
      currentSave = result.current.saveFormResponse(null, 'question-1', { response_value: 'assinatura-os-B' });
    });
    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(2));

    const failure = { code: 'network_error', message: 'offline' };
    await act(async () => {
      currentPersist.resolve({ error: failure });
      await expect(currentSave).rejects.toEqual(failure);
    });
    await waitFor(() => expect(result.current.getFormResponse(null, 'question-1')).toBeUndefined());
  });
});
