/**
 * Helper para buscar TODOS os registros de uma query Supabase, contornando
 * o limite padrão de 1000 linhas. Essencial para preservar o histórico completo
 * de OSs, equipamentos, financeiro etc. à medida que o cliente cresce.
 *
 * Uso:
 *   const data = await fetchAllPaginated(() => supabase
 *     .from('financial_transactions')
 *     .select('*')
 *     .order('transaction_date', { ascending: false })
 *   );
 */
export async function fetchAllPaginated<T = any>(
  queryBuilder: () => any,
  pageSize = 1000
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
