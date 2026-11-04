import { describe, expect, it } from 'vitest';
import {
  buildEditOsScopeItems,
  hasAnsweredScopeRemoval,
  hydrateEditOsScopeState,
  moveScopeChecklist,
  reorderScopeEquipment,
  removeScopeChecklist,
} from './editOsScopeState';

const seed = [
  {
    id: 'scope-standalone',
    equipment_id: null,
    form_template_id: 'check-a',
    equipment: null,
    form_template: { id: 'check-a', name: 'Higienização' },
  },
  {
    id: 'scope-equipment',
    equipment_id: 'equipment-1',
    form_template_id: null,
    equipment: { id: 'equipment-1', name: 'Split quarto' },
    form_template: null,
  },
];

describe('estado da edição de escopo da OS', () => {
  it('move checklist respondido para equipamento sem tratar como remoção', () => {
    const initial = hydrateEditOsScopeState(seed, [{ equipmentId: null, templateId: 'check-a' }]);
    const result = moveScopeChecklist(initial, 'scope-standalone', 'equipment-1');

    expect(result.moved).toBe(true);
    expect(hasAnsweredScopeRemoval(initial, result.state)).toBe(false);
    expect(buildEditOsScopeItems(result.state)).toEqual([
      {
        equipment_id: 'equipment-1',
        form_template_ids: ['check-a'],
        moves: [{ form_template_id: 'check-a', from_equipment_id: null }],
      },
    ]);
  });

  it('continua exigindo confirmação ao apagar checklist respondido', () => {
    const initial = hydrateEditOsScopeState(seed, [{ equipmentId: null, templateId: 'check-a' }]);
    const current = removeScopeChecklist(initial, 'scope-standalone');
    expect(hasAnsweredScopeRemoval(initial, current)).toBe(true);
  });

  it('impede duplicar o mesmo checklist no equipamento de destino', () => {
    const duplicatedSeed = [
      ...seed,
      {
        id: 'scope-equipment-check',
        equipment_id: 'equipment-1',
        form_template_id: 'check-a',
        equipment: { id: 'equipment-1', name: 'Split quarto' },
        form_template: { id: 'check-a', name: 'Higienização' },
      },
    ];
    const initial = hydrateEditOsScopeState(duplicatedSeed, []);
    const result = moveScopeChecklist(initial, 'scope-standalone', 'equipment-1');
    expect(result.moved).toBe(false);
    expect(result.reason).toBe('duplicate');
  });

  it('persiste a ordem dos equipamentos pela ordem do payload', () => {
    const initial = hydrateEditOsScopeState([
      {
        id: 'eq-1-row',
        equipment_id: 'equipment-1',
        form_template_id: null,
        equipment: { id: 'equipment-1', name: 'Primeiro' },
        form_template: null,
      },
      {
        id: 'eq-2-row',
        equipment_id: 'equipment-2',
        form_template_id: null,
        equipment: { id: 'equipment-2', name: 'Segundo' },
        form_template: null,
      },
    ], []);
    const reordered = reorderScopeEquipment(initial, 'equipment-2', 'equipment-1');
    expect(buildEditOsScopeItems(reordered).map((item) => item.equipment_id)).toEqual([
      'equipment-2',
      'equipment-1',
    ]);
  });

  it('não inventa movimento ao arrastar um checklist novo antes do primeiro save', () => {
    const initial = hydrateEditOsScopeState(seed, []);
    const withNewChecklist = {
      ...initial,
      standaloneChecklists: [{
        instanceId: 'new-check',
        templateId: 'check-new',
        templateName: 'Novo checklist',
        originalEquipmentId: undefined,
        answered: false,
      }],
    };
    const moved = moveScopeChecklist(withNewChecklist, 'new-check', 'equipment-1').state;
    expect(buildEditOsScopeItems(moved)[0]).toEqual({
      equipment_id: 'equipment-1',
      form_template_ids: ['check-new'],
      moves: [],
    });
  });
});
