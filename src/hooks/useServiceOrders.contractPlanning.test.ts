import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/hooks/useServiceOrders.ts', 'utf8');

describe('useServiceOrders — personalização de visita contratual', () => {
  it('reconhece mudanças operacionais e de escopo como planejamento individual', () => {
    for (const field of [
      'scheduled_date',
      'scheduled_time',
      'duration_minutes',
      'schedule_plan',
      'technician_id',
      'team_id',
      'description',
      'notes',
      'equipment_id',
      'service_type_id',
      'form_template_id',
      'require_tech_signature',
      'require_client_signature',
    ]) {
      expect(source).toContain(`'${field}'`);
    }
    expect(source).toContain('|| equipment_items !== undefined');
    expect(source).toContain('|| service_type_ids !== undefined');
    expect(source).toContain('|| assignee_user_ids !== undefined');
  });

  it('fixa a referência original e não substitui um carimbo já existente', () => {
    expect(source).toContain("if (current.contract_id && current.origin === 'contract')");
    expect(source).toContain('?? current.contract_reference_date');
    expect(source).toContain('?? current.scheduled_date');
    expect(source).toContain('?? current.contract_visit_customized_at');
    expect(source).toContain('?? new Date().toISOString()');
  });

  it('não trata chamado reativo do portal como visita do cronograma', () => {
    expect(source).toContain("current.origin === 'contract'");
    expect(source).toContain('contract_id, origin, contract_reference_date');
  });

  it('não transforma uma alteração apenas de status em planejamento individual', () => {
    const planningFields = source.slice(
      source.indexOf('const touchesContractPlanning'),
      source.indexOf('let currentOrder:'),
    );

    expect(planningFields).not.toContain("'status'");
    expect(planningFields).not.toContain("'diagnosis'");
    expect(planningFields).not.toContain("'solution'");
  });

  it('invalida contrato e OS para refletir imediatamente o selo Planejada', () => {
    expect(source).toContain("queryClient.invalidateQueries({ queryKey: ['service-orders'] })");
    expect(source).toContain("queryClient.invalidateQueries({ queryKey: ['contract-detail'] })");
    expect(source).toContain("queryClient.invalidateQueries({ queryKey: ['contracts'] })");
  });
});
