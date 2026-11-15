interface CatalogPage<T> { data: T[] | null; error: unknown }

/** Lê tabelas globais sem depender do limite implícito de 1.000 do PostgREST. */
export async function readCatalogPages<T>(query: (from: number, to: number) => PromiseLike<CatalogPage<T>>, pageSize = 500): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('Tamanho de página inválido');
  const result: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}
