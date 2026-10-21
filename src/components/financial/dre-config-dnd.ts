import type { DreGroupNature } from '@/hooks/useDreGroups';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';

export type DreConfigCategory = Pick<FinancialCategory, 'id' | 'name' | 'dre_group_id'>
  & Partial<Pick<FinancialCategory, 'color' | 'icon' | 'parent_id' | 'sort_order' | 'type'>>;

export type CategoryTreeRow = {
  category: DreConfigCategory;
  code: string;
  depth: 0 | 1;
  parentName?: string;
};

const byCategoryOrder = (a: DreConfigCategory, b: DreConfigCategory) =>
  (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
  || a.name.localeCompare(b.name, 'pt-BR');

export function categoryIdsForDreMove(
  categoryId: string,
  categories: readonly DreConfigCategory[],
): string[] {
  const category = categories.find((item) => item.id === categoryId);
  if (!category || category.parent_id) return category ? [category.id] : [];
  return [category.id, ...categories.filter((item) => item.parent_id === category.id).map((item) => item.id)];
}

export function canMoveCategoryToDreNature(
  category: DreConfigCategory,
  nature: DreGroupNature,
): boolean {
  return category.type === 'entrada'
    ? nature === 'revenue' || nature === 'excluded'
    : nature !== 'revenue';
}

export function buildCategoryRows(
  groupCode: string,
  groupId: string,
  categories: readonly DreConfigCategory[],
): CategoryTreeRow[] {
  const assigned = categories.filter((category) => category.dre_group_id === groupId);
  const assignedIds = new Set(assigned.map((category) => category.id));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const roots = assigned
    .filter((category) => !category.parent_id || !assignedIds.has(category.parent_id))
    .sort(byCategoryOrder);
  const rows: CategoryTreeRow[] = [];

  roots.forEach((root, rootIndex) => {
    const rootCode = `${groupCode}.${String(rootIndex + 1).padStart(3, '0')}`;
    const isOrphanChild = Boolean(root.parent_id);
    rows.push({
      category: root,
      code: rootCode,
      depth: isOrphanChild ? 1 : 0,
      parentName: root.parent_id ? byId.get(root.parent_id)?.name : undefined,
    });
    if (isOrphanChild) return;

    assigned
      .filter((category) => category.parent_id === root.id)
      .sort(byCategoryOrder)
      .forEach((child, childIndex) => rows.push({
        category: child,
        code: `${rootCode}.${String(childIndex + 1).padStart(3, '0')}`,
        depth: 1,
        parentName: root.name,
      }));
  });

  return rows;
}
