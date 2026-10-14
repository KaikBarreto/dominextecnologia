import { describe, expect, it } from 'vitest';
import { groupScopeItems } from './useServiceOrders';

describe('groupScopeItems — agrupamento do escopo de OS pra RPC sync_service_order_scope', () => {
  it('colapsa todos os checklists avulsos em UM item com equipment_id null', () => {
    const result = groupScopeItems([
      { form_template_id: 'tpl-avulso-1' },
      { form_template_id: 'tpl-avulso-2' },
    ]);
    expect(result).toEqual([
      { equipment_id: null, form_template_ids: ['tpl-avulso-1', 'tpl-avulso-2'] },
    ]);
  });

  it('equipamento sem nenhum template vira form_template_ids vazio', () => {
    const result = groupScopeItems([
      { equipment_id: 'equip-1' },
    ]);
    expect(result).toEqual([
      { equipment_id: 'equip-1', form_template_ids: [] },
    ]);
  });

  it('dedup de form_template_ids dentro do mesmo grupo', () => {
    const result = groupScopeItems([
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: 'equip-1', form_template_id: 'tpl-b' },
    ]);
    expect(result).toEqual([
      { equipment_id: 'equip-1', form_template_ids: ['tpl-a', 'tpl-b'] },
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
      { equipment_id: 'equip-1', form_template_ids: ['tpl-a', 'tpl-b'] },
      { equipment_id: null, form_template_ids: ['tpl-avulso'] },
      { equipment_id: 'equip-2', form_template_ids: [] },
    ]);
  });

  it('array vazio devolve array vazio (limpar o escopo inteiro)', () => {
    expect(groupScopeItems([])).toEqual([]);
  });
});
