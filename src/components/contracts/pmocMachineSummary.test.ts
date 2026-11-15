import { describe, expect, it } from 'vitest';
import {
  buildPmocPlanFromMachines,
  machineChecklistSummary,
  reconstructMachineConfigs,
  type MachineConfig,
} from './pmocMachineRoutine';
import type { PmocCatalogActivity } from '@/hooks/usePmocActivityCatalog';

const labels = {
  machineNormActivitiesLabel: 'Atividades da norma',
  machineNormChecklistsLabel: 'Checklists da norma',
  machineCustomChecklistsLabel: 'Checklists personalizados',
};
const config: MachineConfig = {
  scope: 'ac', startVisit: 12, activities: [], customized: true,
  customTemplateIds: ['custom-1'], firstOsExcludedQuestions: [],
};
const catalog: PmocCatalogActivity[] = [{
  id: 'norm-activity', section: 'condicionadores', component: null,
  description: 'Inspecionar filtro', guidance: null, default_freq_code: 'M',
  is_measurement: false, unit: null, expected_min: null, expected_max: null,
  sort_order: 1, essential_tier: 'base', activity_group: 'inspecao',
}];

describe('resumo de checklists por máquina', () => {
  it('conta personalizado mesmo quando nenhuma atividade da norma foi selecionada', () => {
    expect(machineChecklistSummary(config, labels)).toBe('Checklists personalizados: 1');
  });

  it('distingue as atividades avulsas dos checklists completos e evita duplicidade', () => {
    expect(machineChecklistSummary({
      ...config,
      activities: [{ description: 'Inspecionar filtro', freq_code: 'M' }],
      customTemplateIds: ['custom-1', 'custom-1', 'custom-2'],
    }, labels)).toBe('Atividades da norma: 1 · Checklists personalizados: 2');
  });

  it('no motor novo resume templates da norma, sem somar atividades legadas ignoradas', () => {
    expect(machineChecklistSummary({
      ...config,
      normTemplateIds: ['norm-1'],
      activities: [{ description: 'Inspecionar filtro', freq_code: 'M' }],
    }, labels)).toBe('Checklists da norma: 1 · Checklists personalizados: 1');
  });

  it('não esconde a ausência de seleção e distingue configuração ainda indisponível', () => {
    expect(machineChecklistSummary({ ...config, customTemplateIds: [] }, labels)).toBe('Atividades da norma: 0');
    expect(machineChecklistSummary(undefined, labels)).toBe('—');
  });

  it('preserva a seleção personalizada de cada equipamento ao salvar e reabrir o ambiente', () => {
    const items = ['equipment-1', 'equipment-2'].map((equipment_id) => ({
      equipment_id, item_name: equipment_id,
    }));
    const machineConfigs = Object.fromEntries(items.map((item) => [item.equipment_id, { ...config }]));
    const plan = buildPmocPlanFromMachines({ items, machineConfigs, catalogActivities: catalog });
    expect(plan).toHaveLength(2);
    expect(plan.every((row) => row.form_template_id === 'custom-1')).toBe(true);

    const restored = reconstructMachineConfigs({
      items: items.map((item) => ({ ...item, id: `item-${item.equipment_id}` })),
      plan: plan.map((row) => ({
        ...row, freq_months: 1, contract_item_id: `item-${row.equipment_ref}`,
      })),
      catalogActivities: catalog,
    });
    for (const item of items) {
      expect(restored[item.equipment_id].activities).toHaveLength(0);
      expect(restored[item.equipment_id].customTemplateIds).toEqual(['custom-1']);
      expect(machineChecklistSummary(restored[item.equipment_id], labels)).toBe('Checklists personalizados: 1');
    }
    const savedAgain = buildPmocPlanFromMachines({ items, machineConfigs: restored, catalogActivities: catalog });
    expect(savedAgain).toHaveLength(2);
    expect(savedAgain.every((row) => row.form_template_id === 'custom-1')).toBe(true);
  });
});
