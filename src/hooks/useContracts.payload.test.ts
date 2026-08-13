import { describe, it, expect } from 'vitest';
import { buildVisitOrderPayload, type BuiltVisit } from './useContracts';

const baseArgs = {
  companyId: 'co-1',
  contractId: 'ct-1',
  contractName: 'Contrato X',
  useGroupedEngine: false,
  customerId: 'cu-1',
  technicianId: null,
  teamId: null,
  serviceTypeId: null,
  formTemplateId: null,
  equipmentIds: ['eq-1', 'eq-2'],
  itemEquipmentMap: {},
  equipmentTemplateMap: {},
  assigneeUserIds: ['u-1'],
  createdBy: 'u-1',
};

it('expande atividade por equipamento (caminho legado) sem inserir nada', () => {
  const visit: BuiltVisit = {
    date: new Date('2026-03-10T12:00:00'),
    activities: [
      { input: { description: 'Limpeza', applies_per_equipment: true }, planActivityId: 'pa-1', sortOrder: 0 },
    ],
  };
  const order = buildVisitOrderPayload(baseArgs, visit, 0);
  expect(order.os.contract_id).toBe('ct-1');
  expect(order.os.company_id).toBe('co-1');
  expect(order.os.scheduled_date).toBe('2026-03-10');
  expect(order.os.status).toBe('agendada');
  expect(order.os.origin).toBe('contract');
  expect((order.os as any).id).toBeUndefined();
  expect(order.equipment).toHaveLength(2);
  expect(order.equipment.every((e) => (e as any).service_order_id === undefined)).toBe(true);
  expect(order.assignees).toEqual(['u-1']);
  expect(order.activities).toHaveLength(2);
  expect(order.activities.every((a) => (a as any).service_order_id === undefined)).toBe(true);
  expect(order.activities.every((a) => a.company_id === 'co-1')).toBe(true);
});

it('usa emissions quando presentes (motor por máquina)', () => {
  const visit: BuiltVisit = {
    date: new Date('2026-04-10T12:00:00'),
    activities: [],
    emissions: [
      { planActivityId: 'pa-1', equipmentId: 'eq-1', bucket: 0, machineRank: 0, activitySort: 0,
        input: { description: 'Medição', section: 'S1' } } as any,
    ],
  };
  const order = buildVisitOrderPayload(baseArgs, visit, 1);
  expect(order.activities).toHaveLength(1);
  expect(order.activities[0].equipment_id).toBe('eq-1');
  expect(order.activities[0].description).toBe('Medição');
  expect(order.os.description).toContain('Ocorrência 2');
});
