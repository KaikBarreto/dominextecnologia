export interface PortalEquipmentScopedOrder {
  equipment_id?: string | null;
  equipment_ids?: string[] | null;
}

/**
 * O campo principal preserva OS antigas e atalhos que ainda trabalham com um
 * único equipamento. A lista canônica cobre o escopo múltiplo persistido na
 * junction service_order_equipment.
 */
export function serviceOrderBelongsToEquipment(
  order: PortalEquipmentScopedOrder,
  equipmentId: string,
): boolean {
  if (!equipmentId) return false;
  if (order.equipment_id === equipmentId) return true;
  return Array.isArray(order.equipment_ids) && order.equipment_ids.includes(equipmentId);
}
