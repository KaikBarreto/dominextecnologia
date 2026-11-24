// Conferência de linhas afetadas em UPDATE/DELETE do supabase-js.
//
// Quando a RLS barra um UPDATE ou DELETE, o PostgREST NÃO devolve erro: a
// operação simplesmente afeta zero linhas e o `error` vem null. Sem conferir,
// a tela mostra "excluído com sucesso" e nada mudou no banco (caso real em
// 21/11/2026: usuário sem permissão de excluir no Financeiro via o toast de
// sucesso e o lançamento continuava lá).
//
// Uso, na ação PRINCIPAL do usuário (a que decide o toast de sucesso):
//
//   const result = await supabase.from('x').delete({ count: 'exact' }).eq('id', id);
//   assertRowsAffected(result, 'delete');
//
// `count: 'exact'` faz o PostgREST devolver a contagem sem exigir permissão
// de leitura (não usa RETURNING), então não cria falso negativo para quem
// pode alterar mas não pode ler a linha.
//
// NÃO usar em limpeza em cascata ou best-effort ("apaga os filhos, se
// houver"): ali zero linhas é resultado legítimo.

export type MutationKind = 'delete' | 'update';

export const NO_ROWS_AFFECTED_MESSAGES: Record<MutationKind, string> = {
  delete: 'Não foi possível excluir: você não tem permissão para esta ação ou o registro já não existe. Atualize a tela e tente de novo.',
  update: 'Não foi possível salvar: você não tem permissão para esta ação ou o registro já não existe. Atualize a tela e tente de novo.',
};

export class NoRowsAffectedError extends Error {
  readonly code = 'PDX_NO_ROWS_AFFECTED';
  constructor(readonly kind: MutationKind, message = NO_ROWS_AFFECTED_MESSAGES[kind]) {
    super(message);
    this.name = 'NoRowsAffectedError';
  }
}

export interface CountedMutationResult {
  error: unknown;
  count: number | null;
}

export const PARTIAL_ROWS_AFFECTED_MESSAGES: Record<MutationKind, string> = {
  delete: 'Alguns itens não foram excluídos: você não tem permissão para todos eles ou algum já não existe. Atualize a tela e confira.',
  update: 'Alguns itens não foram salvos: você não tem permissão para todos eles ou algum já não existe. Atualize a tela e confira.',
};

/**
 * Lança o erro do banco se houver; senão, lança NoRowsAffectedError quando a
 * operação não afetou nenhuma linha. `count` nulo significa que a chamada
 * esqueceu `{ count: 'exact' }`: falha fechado em vez de supor sucesso.
 *
 * `expected` (opcional) é para operação em lote com lista conhecida de ids:
 * afetar menos linhas que o pedido também é erro (parte foi barrada).
 */
export function assertRowsAffected(
  result: CountedMutationResult,
  kind: MutationKind,
  message?: string,
  expected?: number,
): number {
  if (result.error) throw result.error;
  if (typeof result.count !== 'number' || !Number.isFinite(result.count)) {
    throw new NoRowsAffectedError(kind, message);
  }
  if (result.count < 1) throw new NoRowsAffectedError(kind, message);
  if (expected !== undefined && result.count < expected) {
    throw new NoRowsAffectedError(kind, message ?? PARTIAL_ROWS_AFFECTED_MESSAGES[kind]);
  }
  return result.count;
}

/**
 * Erro das RPCs de exclusão "tudo ou nada" (delete_*_cascade). Elas recusam com
 * 42501 (sem permissão / não existe) ou 23503 (há registro vinculado) e uma
 * mensagem PT-BR pronta, e nesses casos NADA foi apagado. O tradutor genérico
 * trocaria essa mensagem por um texto vago, então ela é repassada inteira.
 * Qualquer outro erro sobe como veio.
 */
export function allOrNothingDeleteError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (
    e && typeof e === 'object'
    && (e.code === '42501' || e.code === '23503')
    && typeof e.message === 'string'
    && e.message.trim().startsWith('Não foi possível')
  ) {
    return new NoRowsAffectedError('delete', e.message.trim());
  }
  return error;
}
