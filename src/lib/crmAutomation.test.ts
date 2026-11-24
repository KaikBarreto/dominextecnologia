import { describe, expect, it } from 'vitest';
import { countCrmStageRequirements, createDefaultCrmAction, splitRequirementNames, validateCrmAutomationRule } from './crmAutomation';
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
  it('exige um evento de negócio conhecido no gatilho agnóstico', () => {
    const input = rule(); input.trigger_type = 'business_event';
    expect(validateCrmAutomationRule(input)).toContain('Informe qual evento dispara a automação.');
    input.trigger_config = { event: 'quote.created' };
    expect(validateCrmAutomationRule(input)).toEqual([]);
  });
  it('cria identidade estável por ação', () => {
    const first = createDefaultCrmAction('create_task');
    const second = createDefaultCrmAction('create_task');
    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
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

  it('conta as exigências de saída ligadas na etapa', () => {
    expect(countCrmStageRequirements(null)).toBe(0);
    expect(countCrmStageRequirements({})).toBe(0);
    expect(countCrmStageRequirements({ tasks: true, customer: false, dueDate: true })).toBe(2);
    expect(countCrmStageRequirements({
      assignee: true,
      taskNames: ['Enviar proposta', 'Ligar'],
      checklistNames: ['Documentos'],
      fieldRules: [{ key: 'site', operator: 'url' }],
    })).toBe(5);
  });
});
