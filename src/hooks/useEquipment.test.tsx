import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateResult, deleteResult, updateEquipmentRow, deleteEquipmentRow, toast } = vi.hoisted(() => ({
  updateResult: { current: { data: { id: 'eq-1', name: 'Split atualizado' }, error: null as unknown } },
  deleteResult: { current: { error: null as unknown } },
  updateEquipmentRow: vi.fn(),
  deleteEquipmentRow: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'equipment') throw new Error(`tabela inesperada: ${table}`);
      return {
        update: (payload: unknown) => {
          updateEquipmentRow(payload);
          return {
            eq: (_column: string, id: string) => ({
              select: () => ({
                single: () => Promise.resolve({ ...updateResult.current, data: { ...updateResult.current.data, id } }),
              }),
            }),
          };
        },
        delete: () => ({
          eq: (_column: string, id: string) => {
            deleteEquipmentRow(id);
            return Promise.resolve(deleteResult.current);
          },
        }),
      };
    },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: true }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

import { useEquipment } from './useEquipment';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, Wrapper };
}

beforeEach(() => {
  updateResult.current = { data: { id: 'eq-1', name: 'Split atualizado' }, error: null };
  deleteResult.current = { error: null };
  updateEquipmentRow.mockClear();
  deleteEquipmentRow.mockClear();
  toast.mockClear();
});

describe('useEquipment mutations', () => {
  it('atualiza o equipamento e invalida toda a raiz de cache', async () => {
    const { invalidate, Wrapper } = setup();
    const { result } = renderHook(() => useEquipment(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateEquipment.mutateAsync({
        id: 'eq-1',
        data: { name: 'Split atualizado' },
      });
    });

    expect(updateEquipmentRow).toHaveBeenCalledWith({ name: 'Split atualizado' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['equipment'] });
  });

  it('exclui o equipamento e invalida toda a raiz de cache', async () => {
    const { invalidate, Wrapper } = setup();
    const { result } = renderHook(() => useEquipment(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.deleteEquipment.mutateAsync('eq-1');
    });

    expect(deleteEquipmentRow).toHaveBeenCalledWith('eq-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['equipment'] });
  });

  it('propaga a recusa do banco sem invalidar o cache', async () => {
    deleteResult.current = { error: { code: '23503', message: 'foreign key violation' } };
    const { invalidate, Wrapper } = setup();
    const { result } = renderHook(() => useEquipment(), { wrapper: Wrapper });

    await expect(result.current.deleteEquipment.mutateAsync('eq-linked')).rejects.toMatchObject({ code: '23503' });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
