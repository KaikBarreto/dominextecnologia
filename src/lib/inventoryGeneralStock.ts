/**
 * Projeções puras da visão "Estoque geral".
 *
 * O chamador deve fornecer somente níveis que passaram pela RLS. Não usamos
 * `inventory.quantity`: esse campo é um espelho legado da empresa inteira e
 * poderia incluir saldo de um local que o usuário não pode consultar.
 */
export interface GeneralStockLevel {
  inventory_id: string;
  quantity: number | null;
  min_quantity: number | null;
  is_present: boolean | null;
}
function visibleLevels(levels: GeneralStockLevel[], inventoryId: string) {
  return levels.filter(
    (level) => level.inventory_id === inventoryId && level.is_present !== false,
  );
}

/** Soma o saldo dos locais visíveis/presentes de um material. */
export function getGeneralStockQuantity(
  levels: GeneralStockLevel[],
  inventoryId: string,
): number {
  return visibleLevels(levels, inventoryId).reduce(
    (total, level) => total + (Number(level.quantity) || 0),
    0,
  );
}

/** Quantos locais visíveis estão abaixo do mínimo configurado. */
export function getGeneralLowStockLevelCount(
  levels: GeneralStockLevel[],
  inventoryId: string,
): number {
  return visibleLevels(levels, inventoryId).filter((level) => {
    if (level.min_quantity == null) return false;
    return (Number(level.quantity) || 0) < Number(level.min_quantity);
  }).length;
}
