import { describe, expect, it, vi } from 'vitest';
import { readCatalogPages } from './catalogPagination';

describe('paginação do catálogo global', () => {
  it('não trunca depois de mil e mantém a última página', async () => {
    const rows = Array.from({ length: 1243 }, (_, id) => ({ id }));
    const query = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(await readCatalogPages(query)).toEqual(rows);
    expect(query.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });
  it('consulta o término exato e nunca transforma erro em catálogo parcial', async () => {
    let count = 0;
    const failure = new Error('Falha de leitura');
    await expect(readCatalogPages(async () => ++count === 1 ? { data: [1, 2], error: null } : { data: null, error: failure }, 2)).rejects.toBe(failure);
    expect(count).toBe(2);
    const query = vi.fn(async (from: number) => ({ data: from === 0 ? [1, 2] : [], error: null }));
    expect(await readCatalogPages(query, 2)).toEqual([1, 2]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
