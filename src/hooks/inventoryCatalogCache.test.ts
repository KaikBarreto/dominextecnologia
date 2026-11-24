import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateInventoryCatalogCaches } from './useInventory';

describe('cache canônico de preço e presença de materiais', () => {
  it('atualiza estoque, acesso e catálogos do PDV após editar ou remover de um local', async () => {
    const client = new QueryClient();
    const reads = [
      ['inventory'], ['inventory-stock-levels'], ['inventory-movements'], ['accessible-inventory-ids'],
      ['pdv-direct-sale-v2', 'catalog', 'company-fixture'], ['pdv-preorders', 'catalog', 'company-fixture'],
    ];
    for (const queryKey of [...reads, ['customers']]) client.setQueryData(queryKey, []);
    await invalidateInventoryCatalogCaches(client);
    for (const key of reads) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(['customers'])?.isInvalidated).toBe(false);
  });
});
