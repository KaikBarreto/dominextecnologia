import { describe, expect, it } from 'vitest';
import {
  checklistMatchesSelectedServices,
  getAutomaticChecklistTemplateIds,
  mergeServiceTypeIds,
} from './serviceOrderServices';

const templates = [
  { id: 'global', is_active: true, service_type_ids: [], applies_to_all_services: true },
  { id: 'cleaning', is_active: true, service_type_ids: ['cleaning'] },
  { id: 'install', is_active: true, service_type_ids: ['install'] },
  { id: 'inactive', is_active: false, service_type_ids: ['cleaning', 'install'] },
];

describe('serviceOrderServices', () => {
  it('disponibiliza checklists globais e dos vários serviços selecionados', () => {
    expect(
      templates
        .filter(template => checklistMatchesSelectedServices(template, ['cleaning', 'install']))
        .map(template => template.id),
    ).toEqual(['global', 'cleaning', 'install']);
  });

  it('aplica automaticamente somente checklists com vínculo explícito', () => {
    expect(getAutomaticChecklistTemplateIds(templates, ['cleaning', 'install']))
      .toEqual(['cleaning', 'install']);
  });

  it('incorpora serviços presentes nos itens sem duplicar a seleção', () => {
    expect(mergeServiceTypeIds(['cleaning'], ['install', 'cleaning', null]))
      .toEqual(['cleaning', 'install']);
  });
});
