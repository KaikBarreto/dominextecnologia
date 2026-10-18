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
