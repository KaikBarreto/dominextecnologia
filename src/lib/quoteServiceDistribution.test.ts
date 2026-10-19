import { describe, expect, it } from 'vitest';
import { buildEquipmentServiceDistribution } from './quoteServiceDistribution';

describe('buildEquipmentServiceDistribution', () => {
  it('agrupa serviços por equipamento, remove duplicados e ordena o payload', () => {
    expect(buildEquipmentServiceDistribution({
      'service-b': ['equipment-b', 'equipment-a', 'equipment-a'],
      'service-a': ['equipment-a'],
      '': ['equipment-c'],
    })).toEqual([
      { equipment_id: 'equipment-a', service_type_ids: ['service-a', 'service-b'] },
      { equipment_id: 'equipment-b', service_type_ids: ['service-b'] },
    ]);
  });

  it('ignora seleções vazias', () => {
    expect(buildEquipmentServiceDistribution({ 'service-a': [] })).toEqual([]);
  });
});
