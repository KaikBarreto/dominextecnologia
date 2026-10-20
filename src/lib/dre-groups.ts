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

export type ConfigurableDreNature =
  | 'revenue'
  | 'deduction'
  | 'cost'
  | 'operating_expense'
  | 'non_operating'
  | 'excluded';

export interface ConfigurableDreGroupLike {
  id: string;
  name: string;
  nature: ConfigurableDreNature;
  sort_order: number;
  is_active: boolean;
}

export interface ConfiguredDreGroup<T> {
  key: string;
  label: string;
  nature: ConfigurableDreNature;
  items: T[];
}

const LEGACY_NATURE: Record<DreGroupKey, ConfigurableDreNature> = {
  impostos: 'deduction',
  cmv: 'cost',
  opex: 'operating_expense',
  outros: 'excluded',
};

export function legacyDreGroupForNature(nature: ConfigurableDreNature): string {
  if (nature === 'deduction') return 'impostos';
  if (nature === 'cost') return 'cmv';
  if (nature === 'excluded') return 'outros';
  if (nature === 'non_operating') return 'nao_operacional';
  // Receita historicamente usa `opex`: o lado `entrada` é que a distingue.
  return 'opex';
}

export function resolveCategoryDreNature(
  category: Pick<FinancialCategory, 'type' | 'dre_group'> & { dre_group_id?: string | null },
  groups: ConfigurableDreGroupLike[],
): ConfigurableDreNature {
  const configured = category.dre_group_id
    ? groups.find((group) => group.id === category.dre_group_id)
    : undefined;
  if (configured) return configured.nature;
  if (category.dre_group === 'outros') return 'excluded';
  if (category.type === 'entrada') return 'revenue';
  if (category.dre_group === 'impostos') return 'deduction';
  if (category.dre_group === 'cmv') return 'cost';
  if (category.dre_group === 'nao_operacional') return 'non_operating';
  return 'operating_expense';
}

/**
 * Agrupa pela configuração da empresa sem abandonar categorias legadas.
 *
 * Durante rollout (ou para uma linha antiga sem `dre_group_id`) a categoria
 * continua caindo no bucket semântico derivado de `dre_group`; assim migration
 * parcial ou dado histórico nunca faz uma categoria sumir do seletor.
 */
export function groupByConfiguredDre<
  T extends Pick<FinancialCategory, 'dre_group'> & { dre_group_id?: string | null },
>(
  items: T[],
  groups: ConfigurableDreGroupLike[],
  fallbackLabels: Record<DreGroupKey, string>,
): ConfiguredDreGroup<T>[] {
  const active = groups
    .filter((group) => group.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'));
  const byId = new Map(active.map((group) => [group.id, group]));
  const buckets = new Map<string, ConfiguredDreGroup<T>>(
    active.map((group) => [group.id, {
      key: group.id,
      label: group.name,
      nature: group.nature,
      items: [],
    }]),
  );

  items.forEach((item) => {
    const configured = item.dre_group_id ? byId.get(item.dre_group_id) : undefined;
    if (configured) {
      buckets.get(configured.id)!.items.push(item);
      return;
    }
    const legacyKey = getDreGroupKey(item);
    const fallbackKey = `legacy:${legacyKey}`;
    const bucket = buckets.get(fallbackKey) ?? {
      key: fallbackKey,
      label: fallbackLabels[legacyKey],
      nature: 'type' in item
        ? resolveCategoryDreNature(item as T & Pick<FinancialCategory, 'type'>, groups)
        : LEGACY_NATURE[legacyKey],
      items: [],
    };
    bucket.items.push(item);
    buckets.set(fallbackKey, bucket);
  });

  return Array.from(buckets.values()).filter((group) => group.items.length > 0);
}

export function getConfiguredDreGroup<T extends Pick<FinancialCategory, 'dre_group'> & { dre_group_id?: string | null }>(
  item: T,
  groups: ConfigurableDreGroupLike[],
  fallbackLabels: Record<DreGroupKey, string>,
): ConfiguredDreGroup<T> {
  return groupByConfiguredDre([item], groups, fallbackLabels)[0];
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
