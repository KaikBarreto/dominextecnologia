import type { FormTemplate } from '@/types/database';

type ChecklistTemplate = Pick<
  FormTemplate,
  'id' | 'is_active' | 'service_type_ids' | 'applies_to_all_services'
>;

export function checklistMatchesSelectedServices(
  template: ChecklistTemplate,
  selectedServiceTypeIds: string[],
): boolean {
  if (!template.is_active) return false;
  if (selectedServiceTypeIds.length === 0) return true;

  const linkedIds = template.service_type_ids ?? [];
  if (template.applies_to_all_services || linkedIds.length === 0) return true;
  return linkedIds.some(id => selectedServiceTypeIds.includes(id));
}

/**
 * Variante para o escopo de UM equipamento. Quando a OS já possui serviços mas
 * nenhum foi atribuído ao equipamento, mantém disponíveis apenas checklists
 * globais; assim um checklist específico não aparece como se servisse para
 * qualquer equipamento.
 */
export function checklistMatchesEquipmentServices(
  template: ChecklistTemplate,
  equipmentServiceTypeIds: string[],
  orderServiceTypeIds: string[],
): boolean {
  if (!template.is_active) return false;

  const linkedIds = template.service_type_ids ?? [];
  const isGlobal = template.applies_to_all_services || linkedIds.length === 0;
  if (orderServiceTypeIds.length === 0) return true;
  if (equipmentServiceTypeIds.length === 0) return isGlobal;

  return isGlobal || linkedIds.some(id => equipmentServiceTypeIds.includes(id));
}

/** Mantém checklists globais e os ligados a pelo menos um serviço do equipamento. */
export function reconcileEquipmentChecklistTemplateIds(
  templates: ChecklistTemplate[],
  currentTemplateIds: string[],
  equipmentServiceTypeIds: string[],
  orderServiceTypeIds: string[],
): string[] {
  const allowedIds = new Set(
    templates
      .filter(template => checklistMatchesEquipmentServices(
        template,
        equipmentServiceTypeIds,
        orderServiceTypeIds,
      ))
      .map(template => template.id),
  );
  const automaticIds = getAutomaticChecklistTemplateIds(templates, equipmentServiceTypeIds);

  return Array.from(new Set([
    ...currentTemplateIds.filter(id => allowedIds.has(id)),
    ...automaticIds,
  ]));
}

/** Checklists globais ficam disponíveis, mas só vínculos explícitos são automáticos. */
export function getAutomaticChecklistTemplateIds(
  templates: ChecklistTemplate[],
  selectedServiceTypeIds: string[],
): string[] {
  return templates
    .filter(template => (
      template.is_active
      && (template.service_type_ids ?? []).some(id => selectedServiceTypeIds.includes(id))
    ))
    .map(template => template.id);
}

export function mergeServiceTypeIds(
  selectedServiceTypeIds: string[],
  itemServiceTypeIds: Array<string | null | undefined>,
): string[] {
  return Array.from(new Set([
    ...selectedServiceTypeIds,
    ...itemServiceTypeIds.filter((id): id is string => !!id),
  ]));
}
