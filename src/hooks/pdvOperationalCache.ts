import type { QueryClient } from '@tanstack/react-query';

/** Projeções atuais do pedido; a raiz legada pdv-orders não alcança estas chaves. */
export async function invalidatePdvOrderProjections(client: QueryClient) {
  await Promise.all([
    ['pdv', 'orders-workspace'],
    ['pdv-sales-flow'],
    ['pdv-customer-history'],
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}

/** Quantidade disponível é projetada dentro dos catálogos, fora da raiz inventory. */
export async function invalidatePdvCatalogCaches(client: QueryClient) {
  await Promise.all([
    ['pdv-direct-sale-v2', 'catalog'],
    ['pdv-preorders', 'catalog'],
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}
