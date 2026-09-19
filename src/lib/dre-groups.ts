import type { FinancialCategory } from '@/hooks/useFinancialCategories';

/**
 * Grupos do DRE, na ordem em que aparecem na demonstração de resultado.
 *
 * `dre_group` é `text` livre no banco (sem enum/check): qualquer valor fora dos
 * 3 conhecidos — ou NULL — cai no bucket final "outros".
 *
 * Régua única, usada tanto pela tela de configuração de categorias quanto pelo
 * select de categoria do lançamento. Antes vivia só dentro de
 * `FinanceCategorias.tsx`, e por isso o select do formulário mostrava as
 * despesas numa lista alfabética plana enquanto a configuração já mostrava
 * agrupado.
 */
export type DreGroupKey = 'impostos' | 'cmv' | 'opex' | 'outros';

export const DRE_GROUP_ORDER: DreGroupKey[] = ['impostos', 'cmv', 'opex', 'outros'];

export function getDreGroupKey(cat: Pick<FinancialCategory, 'dre_group'>): DreGroupKey {
  return cat.dre_group === 'impostos' || cat.dre_group === 'cmv' || cat.dre_group === 'opex'
    ? cat.dre_group
    : 'outros';
}

export interface DreGroup<T> {
  key: DreGroupKey;
  label: string;
  items: T[];
}

/**
 * Distribui as categorias nos grupos do DRE, na ordem da demonstração, e
 * descarta grupo vazio — senão sobra divisória fantasma.
 */
export function groupByDre<T extends Pick<FinancialCategory, 'dre_group'>>(
  items: T[],
  labels: Record<DreGroupKey, string>,
): DreGroup<T>[] {
  const buckets: Record<DreGroupKey, T[]> = { impostos: [], cmv: [], opex: [], outros: [] };
  items.forEach((item) => buckets[getDreGroupKey(item)].push(item));
  return DRE_GROUP_ORDER.map((key) => ({ key, label: labels[key], items: buckets[key] })).filter(
    (g) => g.items.length > 0,
  );
}

/**
 * Só vale desenhar divisória quando há 2+ grupos com item: empresa que nunca
 * classificou (quase tudo em 'opex') continua vendo lista plana, sem um título
 * de seção solitário em cima de tudo.
 */
export function shouldGroupByDre(groups: DreGroup<unknown>[]): boolean {
  return groups.length >= 2;
}
