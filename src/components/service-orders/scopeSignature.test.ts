import { describe, expect, it } from 'vitest';
import { scopeSignature } from './ServiceOrderFormDialog';

/**
 * `scopeSignature` decide se o save manda `equipment_items` — ou seja, se a RPC
 * `sync_service_order_scope` (que APAGA respostas de checklist fora do escopo)
 * roda. Falso positivo aqui = RPC destrutiva disparada num save que não mexeu em
 * escopo; falso negativo = remoção de checklist que o usuário fez não é gravada.
 */
describe('scopeSignature — detecta mudança real no escopo da OS', () => {
  it('mesmo conjunto em ordem diferente tem a mesma assinatura', () => {
    const doBanco = [
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: null, form_template_id: 'tpl-avulso' },
    ];
    const daTela = [
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: undefined, form_template_id: 'tpl-avulso' },
    ];
    expect(scopeSignature(daTela)).toBe(scopeSignature(doBanco));
  });

  it('null do banco e undefined da tela são o mesmo avulso', () => {
    expect(scopeSignature([{ form_template_id: 'tpl-a' }])).toBe(
      scopeSignature([{ equipment_id: null, form_template_id: 'tpl-a' }]),
    );
  });

  it('equipamento sem template (null) casa com o undefined da tela', () => {
    expect(scopeSignature([{ equipment_id: 'equip-1', form_template_id: null }])).toBe(
      scopeSignature([{ equipment_id: 'equip-1' }]),
    );
  });

  it('remover o checklist avulso muda a assinatura', () => {
    const antes = [
      { equipment_id: 'equip-1', form_template_id: 'tpl-a' },
      { equipment_id: null, form_template_id: 'tpl-a' },
    ];
    const depois = [{ equipment_id: 'equip-1', form_template_id: 'tpl-a' }];
    expect(scopeSignature(depois)).not.toBe(scopeSignature(antes));
  });

  it('esvaziar tudo muda a assinatura (e não vira no-op)', () => {
    expect(scopeSignature([])).not.toBe(
      scopeSignature([{ equipment_id: 'equip-1', form_template_id: 'tpl-a' }]),
    );
  });

  it('trocar o template do mesmo equipamento muda a assinatura', () => {
    expect(scopeSignature([{ equipment_id: 'equip-1', form_template_id: 'tpl-b' }])).not.toBe(
      scopeSignature([{ equipment_id: 'equip-1', form_template_id: 'tpl-a' }]),
    );
  });

  it('trocar os serviços do equipamento muda a assinatura', () => {
    expect(scopeSignature([{
      equipment_id: 'equip-1',
      form_template_id: 'tpl-a',
      service_type_ids: ['cleaning'],
    }])).not.toBe(scopeSignature([{
      equipment_id: 'equip-1',
      form_template_id: 'tpl-a',
      service_type_ids: ['install'],
    }]));
  });

  it('a ordem dos serviços do equipamento não muda a assinatura', () => {
    expect(scopeSignature([{
      equipment_id: 'equip-1',
      form_template_id: 'tpl-a',
      service_type_ids: ['install', 'cleaning'],
    }])).toBe(scopeSignature([{
      equipment_id: 'equip-1',
      form_template_id: 'tpl-a',
      service_type_ids: ['cleaning', 'install'],
    }]));
  });
});
