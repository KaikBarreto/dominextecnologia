import { describe, expect, it } from 'vitest';
import { createDefaultCrmAction, splitRequirementNames, validateCrmAutomationRule } from './crmAutomation';
import type { CrmAutomationActionType, CrmAutomationRuleInput, CrmAutomationTriggerType } from '@/types/crmAutomation';

const rule = (): CrmAutomationRuleInput => ({
  pipeline_id: 'pipeline-1', trigger_stage_id: 'stage-1', name: 'Preparar oportunidade',
  trigger_type: 'stage_enter', trigger_config: {}, actions: [createDefaultCrmAction('create_task')], enabled: false,
});

describe('crmAutomation', () => {
  it('cria os sete tipos de ação', () => {
    const types: CrmAutomationActionType[] = ['create_task', 'apply_checklist', 'set_due', 'assign_user', 'add_label', 'move_card', 'copy_card'];
    expect(types.map((type) => createDefaultCrmAction(type).action)).toEqual(types);
  });
  it.each<CrmAutomationTriggerType>(['stage_enter', 'all_completed'])('aceita %s sem filtro nominal', (trigger) => {
    const input = rule(); input.trigger_type = trigger;
    expect(validateCrmAutomationRule(input)).toEqual([]);
  });
  it.each([['task_completed', 'taskName'], ['checklist_completed', 'name']] as const)('exige filtro no gatilho %s', (trigger, key) => {
    const input = rule(); input.trigger_type = trigger;
    expect(validateCrmAutomationRule(input)[0]).toMatch(/Informe qual/);
    input.trigger_config = { [key]: 'Documento aprovado' };
    expect(validateCrmAutomationRule(input)).toEqual([]);
  });
  it('valida campos das ações e posiciona mover por último', () => {
    const input = rule();
    input.actions = [createDefaultCrmAction('apply_checklist'), createDefaultCrmAction('assign_user'), createDefaultCrmAction('add_label'), { action: 'move_card', config: { workflowId: 'p2', stageId: 's2' } }, createDefaultCrmAction('create_task')];
    expect(validateCrmAutomationRule(input)).toEqual([
      'Ação 1: escolha um modelo de checklist.', 'Ação 2: escolha um responsável.',
      'Ação 3: escolha uma etiqueta.', 'Ação 4: mover o cartão precisa ser a última ação.',
    ]);
  });
  it('normaliza nomes separados por linha ou vírgula', () => {
    expect(splitRequirementNames('Proposta\nContrato, Proposta')).toEqual(['Proposta', 'Contrato']);
  });
});
