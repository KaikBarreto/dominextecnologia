import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useStocks', () => ({
  useStockManagement: () => ({ scope: [], ready: false, companyId: null }),
}));
vi.mock('@/integrations/supabase/client', async () => {
  const { SupabaseClient } = await import('@supabase/supabase-js');
  return {
    supabase: {
      from: mocks.from,
      // Usa o método real do SDK: um vi.fn direto em rpc mascara a perda de this.
      rpc: SupabaseClient.prototype.rpc,
      rest: { rpc: (name: string, args: Record<string, unknown>) => mocks.rpc(name, args) },
    },
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({ data: [], isLoading: false, isSuccess: true, error: null }),
  useMutation: (options: unknown) => ({ __options: options, isPending: false, mutateAsync: vi.fn() }),
}));

import { useInventory } from './useInventory';

function runMutation<T>(mutation: unknown, variables: T): Promise<unknown> {
  return (mutation as { __options: { mutationFn: (value: T) => Promise<unknown> } })
    .__options.mutationFn(variables);
}

type MutationOptions = { onError: (error: unknown) => Promise<void> | void };

function useUpdateMutationOptions(): MutationOptions {
  const inventory = useInventory();
  return (inventory.updateItem as unknown as { __options: MutationOptions }).__options;
}

describe('useInventory — falha ambígua ao atualizar material', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('reconcilia apenas leituras e não repete update nem movimento no erro reset', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = useUpdateMutationOptions();

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

  it('mantém erro conhecido do Supabase no fluxo normal, sem reconciliação extra', async () => {
    const options = useUpdateMutationOptions();
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

  it('o erro de receiver corresponde ao aviso do print e reconcilia somente leituras', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await useUpdateMutationOptions().onError(new TypeError("Cannot read properties of undefined (reading 'rest')"));
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Não foi possível confirmar a atualização',
      description: 'Atualizamos os dados exibidos. Confira o material e o saldo antes de tentar novamente.',
      variant: 'destructive',
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('useInventory — chamadas de estoque com o cliente real do SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.from.mockReset();
  });

  it('cadastra o material e envia a entrada inicial uma única vez no local escolhido', async () => {
    const created = { id: 'material-1', name: 'Material fictício', quantity: 0 };
    const single = vi.fn().mockResolvedValue({ data: created, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    mocks.from.mockReturnValue({ insert });

    await expect(runMutation(useInventory().createItem, {
      name: 'Material fictício', initialQuantity: 8, activeStockId: 'stock-2',
    })).resolves.toEqual(created);

    expect(insert).toHaveBeenCalledExactlyOnceWith({ name: 'Material fictício', quantity: 0 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('inventory_register_manual_movement_v3', {
      p_inventory_id: 'material-1', p_movement_type: 'entrada', p_quantity: 8,
      p_notes: 'Cadastro inicial', p_stock_id: 'stock-2',
    });
  });

  it('não envia movimento quando o cadastro começa sem saldo', async () => {
    mocks.from.mockReturnValue({ insert: () => ({ select: () => ({
      single: async () => ({ data: { id: 'material-1' }, error: null }),
    }) }) });
    await runMutation(useInventory().createItem, { name: 'Material fictício', initialQuantity: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([8, 3])('salva o cadastro e ajusta de 6 para %s somente no local ativo', async (quantity) => {
    const eq = vi.fn().mockResolvedValue({ count: 1, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ update });

    await expect(runMutation(useInventory().updateItem, {
      id: 'material-1', sale_price: 12, quantity, previousQuantity: 6, activeStockId: 'stock-2',
    })).resolves.toEqual({ id: 'material-1' });

    expect(update).toHaveBeenCalledExactlyOnceWith({ sale_price: 12 }, { count: 'exact' });
    expect(eq).toHaveBeenCalledWith('id', 'material-1');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('inventory_register_manual_movement_v3', {
      p_inventory_id: 'material-1', p_movement_type: 'ajuste', p_quantity: quantity - 6,
      p_notes: 'Ajuste manual', p_stock_id: 'stock-2',
    });
  });

  it('não movimenta saldo ao salvar somente preço', async () => {
    mocks.from.mockReturnValue({ update: () => ({
      eq: async () => ({ count: 1, error: null }),
    }) });
    await runMutation(useInventory().updateItem, { id: 'material-1', sale_price: 12 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['entrada', 5], ['saida', -5], ['ajuste', 5],
  ] as const)('envia movimento %s com sinal e local corretos', async (movementType, signedQuantity) => {
    await runMutation(useInventory().registerInlineMovement, {
      inventoryId: 'material-1', stockId: 'stock-2', movementType, quantity: 5,
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('inventory_register_manual_movement_v3', {
      p_inventory_id: 'material-1', p_stock_id: 'stock-2', p_movement_type: movementType,
      p_quantity: signedQuantity, p_notes: null,
    });
  });

  it.each([true, false])('envia arquivamento %s pela função protegida', async (archived) => {
    await expect(runMutation(useInventory().setArchived, { id: 'material-1', archived }))
      .resolves.toBe(archived);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('inventory_set_archived_v3', {
      p_inventory_id: 'material-1', p_archived: archived,
    });
  });

  it('remove do local pela função protegida', async () => {
    await runMutation(useInventory().removeFromStock, { inventoryId: 'material-1', stockId: 'stock-2' });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('inventory_remove_from_stock_v4', {
      p_inventory_id: 'material-1', p_stock_id: 'stock-2',
    });
  });

  it('propaga recusa do servidor sem repetir o ajuste nem escrever saldo direto', async () => {
    const error = { code: '42501', message: 'Operação não permitida' };
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(runMutation(useInventory().updateItem, {
      id: 'material-1', quantity: 8, previousQuantity: 6, activeStockId: 'stock-2',
    })).rejects.toBe(error);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
