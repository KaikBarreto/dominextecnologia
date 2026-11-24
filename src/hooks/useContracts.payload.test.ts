import { describe, it, expect, vi } from 'vitest';
import {
  buildVisitOrderPayload,
  buildRegenerationPayload,
  regenerateContractVisitsAtomic,
  type BuiltVisit,
} from './useContracts';

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
  expect(order.os.contract_reference_date).toBe('2026-03-10');
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

it('monta payload da RPC com orders e delete_ids, e preserva código por mês', () => {
  const visits: BuiltVisit[] = [
    { date: new Date('2026-03-10T12:00:00'), activities: [] },
    { date: new Date('2026-04-10T12:00:00'), activities: [] },
  ];
  const payload = buildRegenerationPayload({
    args: { ...baseArgs },
    visits,
    baseVisitIndex: 0,
    oldRegenerableIds: ['os-old-1', 'os-old-2'],
    oldRegenerableOss: [
      { scheduled_date: '2026-03-20', public_short_code: 'CODE-MAR' },
    ],
  });

  expect(payload.p_contract_id).toBe('ct-1');
  expect(payload.p_delete_ids).toEqual(['os-old-1', 'os-old-2']);
  expect(payload.p_orders).toHaveLength(2);
  const marOrder = payload.p_orders.find((o) => o.os.scheduled_date === '2026-03-10');
  expect(marOrder?.preserve_code).toBe('CODE-MAR');
  const aprOrder = payload.p_orders.find((o) => o.os.scheduled_date === '2026-04-10');
  expect(aprOrder?.preserve_code == null).toBe(true);
});

it('atribui cada código a um único mês e nega mês já reivindicado', () => {
  const visits: BuiltVisit[] = [
    { date: new Date('2026-03-05T12:00:00'), activities: [] }, // março — reivindica CODE-MAR
    { date: new Date('2026-04-05T12:00:00'), activities: [] }, // abril  — reivindica CODE-ABR
    { date: new Date('2026-03-25T12:00:00'), activities: [] }, // março de novo — deve ficar null
  ];
  const payload = buildRegenerationPayload({
    args: { ...baseArgs },
    visits,
    baseVisitIndex: 0,
    oldRegenerableIds: [],
    oldRegenerableOss: [
      { scheduled_date: '2026-03-10', public_short_code: 'CODE-MAR' },
      { scheduled_date: '2026-04-10', public_short_code: 'CODE-ABR' },
    ],
  });

  const codes = payload.p_orders.map((o) => o.preserve_code);
  // março (1º) leva CODE-MAR, abril leva CODE-ABR, março (2º) fica null
  expect(codes[0]).toBe('CODE-MAR');
  expect(codes[1]).toBe('CODE-ABR');
  expect(codes[2] == null).toBe(true);
  // cada código aparece no máximo uma vez
  expect(codes.filter((c) => c === 'CODE-MAR')).toHaveLength(1);
  expect(codes.filter((c) => c === 'CODE-ABR')).toHaveLength(1);
});

it('mantém uma referência contratual independente para cada visita gerada', () => {
  const visits: BuiltVisit[] = [
    { date: new Date('2026-01-10T12:00:00'), activities: [] },
    { date: new Date('2026-01-11T12:00:00'), activities: [] },
  ];

  const payload = buildRegenerationPayload({
    args: { ...baseArgs },
    visits,
    baseVisitIndex: 0,
    oldRegenerableIds: [],
    oldRegenerableOss: [],
  });

  expect(payload.p_orders.map(order => ({
    scheduled: order.os.scheduled_date,
    reference: order.os.contract_reference_date,
  }))).toEqual([
    { scheduled: '2026-01-10', reference: '2026-01-10' },
    { scheduled: '2026-01-11', reference: '2026-01-11' },
  ]);
});

it('usa a RPC transacional e envia override nulo na tentativa normal', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { created_count: 3, deleted_count: 2 }, error: null });
  const res = await regenerateContractVisitsAtomic({
    payload: { p_contract_id: 'ct-1', p_orders: [], p_delete_ids: [] },
    expectedOsCount: 3,
    rpc,
  });
  expect(rpc).toHaveBeenCalledWith('regenerate_contract_visits_with_override', {
    p_contract_id: 'ct-1',
    p_orders: [],
    p_delete_ids: [],
    p_override_justification: null,
  });
  expect(res).toEqual({ createdCount: 3, deletedCount: 2 });
});

it('envia a justificativa normalizada ao autorizar conflito', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { created_count: 1, deleted_count: 0 }, error: null });
  await regenerateContractVisitsAtomic({
    payload: { p_contract_id: 'ct-1', p_orders: [], p_delete_ids: [] },
    expectedOsCount: 1,
    overrideReason: '  Atendimento urgente aprovado pelo gestor  ',
    rpc,
  });
  expect(rpc).toHaveBeenCalledWith('regenerate_contract_visits_with_override', expect.objectContaining({
    p_override_justification: 'Atendimento urgente aprovado pelo gestor',
  }));
});

it('propaga o erro da RPC sem executar persistência alternativa', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
  await expect(regenerateContractVisitsAtomic({
    payload: { p_contract_id: 'ct-1', p_orders: [], p_delete_ids: [] },
    expectedOsCount: 5,
    rpc,
  })).rejects.toEqual({ message: 'boom' });
});

it('rejeita sucesso com contagem diferente da prévia', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { created_count: 23, deleted_count: 0 }, error: null });
  await expect(regenerateContractVisitsAtomic({
    payload: { p_contract_id: 'ct-1', p_orders: [], p_delete_ids: [] },
    expectedOsCount: 25,
    rpc,
  })).rejects.toThrow('23 de 25');
});

it('valida o mínimo da justificativa antes de chamar o banco', async () => {
  const rpc = vi.fn();
  await expect(regenerateContractVisitsAtomic({
    payload: { p_contract_id: 'ct-1', p_orders: [], p_delete_ids: [] },
    expectedOsCount: 1,
    overrideReason: 'curta',
    rpc,
  })).rejects.toThrow('pelo menos 10 caracteres');
  expect(rpc).not.toHaveBeenCalled();
});
