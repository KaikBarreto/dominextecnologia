import { describe, expect, it } from 'vitest';

import { serviceOrderBelongsToEquipment } from './customerPortalEquipmentHistory';

describe('histórico do equipamento no Portal do Cliente', () => {
  it('mantém OS legada vinculada pelo equipamento principal', () => {
    expect(serviceOrderBelongsToEquipment({ equipment_id: 'eq-1' }, 'eq-1')).toBe(true);
  });

  it('encontra OS com vários equipamentos pela lista canônica', () => {
    expect(serviceOrderBelongsToEquipment({
      equipment_id: 'eq-1',
      equipment_ids: ['eq-1', 'eq-2'],
    }, 'eq-2')).toBe(true);
  });

  it('não mistura histórico de outro equipamento', () => {
    expect(serviceOrderBelongsToEquipment({
      equipment_id: 'eq-1',
      equipment_ids: ['eq-1', 'eq-2'],
    }, 'eq-3')).toBe(false);
  });
});
