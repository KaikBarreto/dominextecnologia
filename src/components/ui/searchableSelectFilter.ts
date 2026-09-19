import { fuzzyIncludes } from '@/lib/utils';

/** Prefixo sentinela do item "criar na hora" do `SearchableSelect`. */
export const CREATE_ITEM_PREFIX = '__create__';

/**
 * Filtro do cmdk usado pelo `SearchableSelect`, extraído pra poder ser testado
 * sem montar Radix Popover + cmdk em jsdom.
 *
 * Usa a mesma régua de busca do resto do sistema (`fuzzyIncludes`): ignora
 * acento, aceita palavras fora de ordem e, quando o digitado é só número,
 * compara dígito a dígito (telefone/CPF com ou sem máscara).
 *
 * Retorna 1 (mostra) ou 0 (esconde) — o cmdk trata como score.
 */
export function searchableSelectFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  // O item de criar tem value sentinela e NUNCA pode ser filtrado: sem ele o
  // usuário perde a ação "Criar <texto>" justamente quando nada casou.
  if (value.startsWith(CREATE_ITEM_PREFIX)) return 1;
  if (!search.trim()) return 1;
  const haystacks = [value, ...(keywords ?? [])];
  return haystacks.some((h) => fuzzyIncludes(h, search)) ? 1 : 0;
}
