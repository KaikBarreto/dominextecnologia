import { describe, expect, it } from 'vitest';
import { getLegacyOverrideEquipmentItems, groupScopeItems } from './useServiceOrders';

describe('groupScopeItems — agrupamento do escopo de OS pra RPC sync_service_order_scope', () => {
  it('colapsa todos os checklists avulsos em UM item com equipment_id null', () => {
    const result = groupScopeItems([
      { form_template_id: 'tpl-avulso-1' },
      { form_template_id: 'tpl-avulso-2' },
    ]);
    expect(result).toEqual([
      { equipment_id: null, form_template_ids: ['tpl-avulso-1', 'tpl-avulso-2'], service_type_ids: [] },
    ]);
  });

  it('equipamento sem nenhum template vira form_template_ids vazio', () => {
    const result = groupScopeItems([
      { equipment_id: 'equip-1' },
    ]);
    expect(result).toEqual([
      { equipment_id: 'equip-1', form_template_ids: [], service_type_ids: [] },
    ]);
  });

  it('dedup de form_template_ids dentro do mesmo grupo', () => {
    const result = groupScopeItems([
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: 'equip-1', form_template_id: 'tpl-b' },
    ]);
    expect(result).toEqual([
      { equipment_id: 'equip-1', form_template_ids: ['tpl-a', 'tpl-b'], service_type_ids: [] },
    ]);
  });

  it('mistura equipamentos e avulsos preservando grupos separados', () => {
    const result = groupScopeItems([
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { form_template_id: 'tpl-avulso' },
      { equipment_id: 'equip-2' },
      { equipment_id: 'equip-1', form_template_id: 'tpl-b' },
    ]);
    expect(result).toEqual([
      { equipment_id: 'equip-1', form_template_ids: ['tpl-a', 'tpl-b'], service_type_ids: [] },
      { equipment_id: null, form_template_ids: ['tpl-avulso'], service_type_ids: [] },
      { equipment_id: 'equip-2', form_template_ids: [], service_type_ids: [] },
    ]);
  });

  it('deduplica os serviços do equipamento mesmo quando repetidos por checklist', () => {
    expect(groupScopeItems([
      { equipment_id: 'equip-1', form_template_id: 'tpl-a', service_type_ids: ['cleaning', 'install'] },
      { equipment_id: 'equip-1', form_template_id: 'tpl-b', service_type_ids: ['install'] },
    ])).toEqual([{
      equipment_id: 'equip-1',
      form_template_ids: ['tpl-a', 'tpl-b'],
      service_type_ids: ['cleaning', 'install'],
    }]);
  });

  it('array vazio devolve array vazio (limpar o escopo inteiro)', () => {
    expect(groupScopeItems([])).toEqual([]);
  });
});

describe('getLegacyOverrideEquipmentItems — contrato legado da criação com override', () => {
  it('omite checklist avulso e campos novos que a RPC antiga não aceita', () => {
    expect(getLegacyOverrideEquipmentItems([
      { form_template_id: 'tpl-avulso' },
      {
        equipment_id: 'equip-1',
        form_template_id: 'tpl-a',
        service_type_ids: ['cleaning'],
      },
      {
        equipment_id: 'equip-2',
        service_type_ids: ['install'],
      },
    ])).toEqual([
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: 'equip-2', form_template_id: undefined },
    ]);
  });

  it('aceita escopo ausente na criação', () => {
    expect(getLegacyOverrideEquipmentItems()).toEqual([]);
  });
});
