export interface CostCenterLike {
  id: string;
  is_active: boolean;
}

/**
 * Filtra os centros de custo elegíveis pra aparecer no `CostCenterSelect`:
 * só os ativos, mas SEM NUNCA fazer sumir o que já está selecionado — senão,
 * ao editar um lançamento antigo cujo centro de custo foi desativado depois,
 * o `SearchableSelect` não acha o `value` entre as `options` e cai no
 * placeholder (o campo parece VAZIO, mesmo com o dado intacto no banco).
 *
 * Mesma ideia de `filterCategoriesForSelect` (financial-category-filter.ts).
 */
export function filterCostCentersForSelect<T extends CostCenterLike>(
  costCenters: T[] | null | undefined,
  selectedId?: string | null
): T[] {
  const all = costCenters ?? [];
  const active = all.filter((c) => c.is_active);
  if (!selectedId) return active;
  if (active.some((c) => c.id === selectedId)) return active;
  const orphan = all.find((c) => c.id === selectedId);
  return orphan ? [...active, orphan] : active;
}
