import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAccessibleInventoryIds } from './useAccessibleInventoryIds';

const { range, rpc } = vi.hoisted(() => {
  const rangeMock = vi.fn();
  return {
    range: rangeMock,
    rpc: vi.fn(() => ({ range: rangeMock })),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc },
}));

describe('fetchAccessibleInventoryIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca todas as paginas quando a empresa tem mais de mil produtos', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => `item-${index}`);
    range
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: ['item-1000', 'item-1001'], error: null });

    await expect(fetchAccessibleInventoryIds()).resolves.toEqual([
      ...firstPage,
      'item-1000',
      'item-1001',
    ]);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'get_accessible_inventory_ids');
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_accessible_inventory_ids');
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('propaga o erro sem devolver uma lista parcial', async () => {
    const error = new Error('consulta indisponivel');
    range.mockResolvedValueOnce({ data: null, error });

    await expect(fetchAccessibleInventoryIds()).rejects.toBe(error);
  });
});
