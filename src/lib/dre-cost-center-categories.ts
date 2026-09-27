import { buildCategoryTree, type CategoryNodeLike } from '@/lib/category-tree';

export interface DreCostCenterCategoryTransaction {
  transaction_type: string;
  amount: number | string;
  cost_center_id?: string | null;
  category?: string | null;
}

export interface DreCostCenterCategoryAmount {
  revenue: number;
  expense: number;
  result: number;
}

export interface DreCostCenterCategoryChild extends DreCostCenterCategoryAmount {
  key: string;
  name: string;
}

export interface DreCostCenterCategoryRow extends DreCostCenterCategoryAmount {
  key: string;
  name: string;
  /** Valor lançado diretamente na categoria mãe, sem contar as filhas. */
  own: DreCostCenterCategoryAmount | null;
  children: DreCostCenterCategoryChild[];
}

type Cents = { revenue: number; expense: number };

function normalizeCenterId(value: string | null | undefined): string | null {
  return value && String(value).trim() ? String(value) : null;
}

function toCents(value: number | string): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function toMoney(value: Cents): DreCostCenterCategoryAmount {
  return {
    revenue: value.revenue / 100,
    expense: value.expense / 100,
    result: (value.revenue - value.expense) / 100,
  };
}

function compareAmounts(
  a: DreCostCenterCategoryAmount & { name: string },
  b: DreCostCenterCategoryAmount & { name: string },
): number {
  return b.expense - a.expense || b.revenue - a.revenue || a.name.localeCompare(b.name, 'pt-BR');
}

/**
 * Abre UM centro de custo em categoria → subcategoria.
 *
 * O chamador passa o mesmo conjunto já cortado pelo regime e período da DRE.
 * Este helper só agrupa; não decide Caixa/Competência e soma em centavos para
 * que os níveis filhos fechem exatamente com o total do centro.
 */
export function buildDreCostCenterCategoryRows<TCategory extends CategoryNodeLike>(
  transactions: readonly DreCostCenterCategoryTransaction[],
  categories: readonly TCategory[],
  centerId: string | null,
  fallbackCategory: string,
): DreCostCenterCategoryRow[] {
  const totalsByName = new Map<string, Cents>();

  for (const transaction of transactions) {
    if (normalizeCenterId(transaction.cost_center_id) !== centerId) continue;
    const name = transaction.category?.trim() || fallbackCategory;
    const current = totalsByName.get(name) ?? { revenue: 0, expense: 0 };
    const cents = toCents(transaction.amount);
    if (transaction.transaction_type === 'entrada') current.revenue += cents;
    else current.expense += cents;
    totalsByName.set(name, current);
  }

  const tree = buildCategoryTree(categories);
  const childrenByParent = new Map<string, string[]>();
  const rootNames = new Set<string>();

  for (const name of totalsByName.keys()) {
    const category = tree.byName.get(name);
    const parent = category ? tree.parentOf(category) : null;
    if (parent) {
      const children = childrenByParent.get(parent.name) ?? [];
      children.push(name);
      childrenByParent.set(parent.name, children);
      rootNames.add(parent.name);
    } else {
      rootNames.add(name);
    }
  }

  const rows = Array.from(rootNames).map((name): DreCostCenterCategoryRow => {
    const ownCents = totalsByName.get(name) ?? null;
    const children = (childrenByParent.get(name) ?? []).map((childName) => {
      const amount = toMoney(totalsByName.get(childName) ?? { revenue: 0, expense: 0 });
      return { key: `${centerId ?? '__none__'}:${name}:${childName}`, name: childName, ...amount };
    }).sort(compareAmounts);

    const totalCents = children.reduce<Cents>(
      (sum, child) => ({
        revenue: sum.revenue + Math.round(child.revenue * 100),
        expense: sum.expense + Math.round(child.expense * 100),
      }),
      ownCents ? { ...ownCents } : { revenue: 0, expense: 0 },
    );

    return {
      key: `${centerId ?? '__none__'}:${name}`,
      name,
      ...toMoney(totalCents),
      own: ownCents ? toMoney(ownCents) : null,
      children,
    };
  });

  return rows.sort(compareAmounts);
}
