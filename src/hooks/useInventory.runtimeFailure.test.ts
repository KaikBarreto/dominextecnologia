import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({ data: [], isLoading: false, isSuccess: true, error: null }),
  useMutation: (options: unknown) => ({
    __options: options,
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

import { useInventory } from './useInventory';

type MutationOptions = {
  onError: (error: unknown) => Promise<void> | void;
};

function updateMutationOptions(): MutationOptions {
  const { result } = renderHook(() => useInventory());
  return (result.current.updateItem as unknown as { __options: MutationOptions }).__options;
}

describe('useInventory — falha ambígua ao atualizar material', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidateQueries.mockResolvedValue(undefined);
  });

  it('reconcilia apenas leituras e não repete update nem movimento no erro reset', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = updateMutationOptions();

    await options.onError(new TypeError("Cannot read properties of undefined (reading 'reset')"));

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(3);
    expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ['inventory'] });
    expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ['inventory-stock-levels'] });
    expect(mocks.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: ['inventory-movements'] });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Não foi possível confirmar a atualização',
      description: expect.stringContaining('Atualize a versão do Dominex'),
      variant: 'destructive',
    }));
    expect(mocks.toast.mock.calls[0][0].description).not.toContain('reset');
    consoleError.mockRestore();
  });

  it('mantém o erro conhecido do Supabase no fluxo normal, sem reconciliação extra', async () => {
    const options = updateMutationOptions();

    await options.onError({ code: '23505', message: 'duplicate key value' });

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Erro ao atualizar item',
      description: 'Já existe um registro com esses dados.',
      variant: 'destructive',
    });
  });
});
