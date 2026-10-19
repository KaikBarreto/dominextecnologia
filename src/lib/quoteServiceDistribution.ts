export interface QuoteEquipmentServiceAssignment {
  equipment_id: string;
  service_type_ids: string[];
}

/** Inverte serviço → equipamentos para o payload compacto aceito pela RPC. */
export function buildEquipmentServiceDistribution(
  assignments: Record<string, string[]>,
): QuoteEquipmentServiceAssignment[] {
  const byEquipment = new Map<string, Set<string>>();

  Object.entries(assignments).forEach(([serviceTypeId, equipmentIds]) => {
    if (!serviceTypeId) return;
    Array.from(new Set(equipmentIds.filter(Boolean))).forEach((equipmentId) => {
      const services = byEquipment.get(equipmentId) ?? new Set<string>();
      services.add(serviceTypeId);
      byEquipment.set(equipmentId, services);
    });
  });

  return Array.from(byEquipment.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([equipment_id, services]) => ({
      equipment_id,
      service_type_ids: Array.from(services).sort(),
    }));
}
