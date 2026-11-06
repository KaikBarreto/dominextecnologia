import type {
  CrmAutomationAction,
  CrmAutomationActionType,
  CrmAutomationRuleInput,
  CrmAutomationTriggerType,
} from '@/types/crmAutomation';

export const CRM_AUTOMATION_TRIGGER_LABELS: Record<CrmAutomationTriggerType, string> = {
  stage_enter: 'Ao entrar nesta etapa',
  task_completed: 'Ao concluir uma tarefa',
  checklist_completed: 'Ao concluir um checklist',
  all_completed: 'Quando tudo estiver concluído',
};

export const CRM_AUTOMATION_ACTION_LABELS: Record<CrmAutomationActionType, string> = {
  create_task: 'Criar tarefa',
  apply_checklist: 'Aplicar checklist',
  set_due: 'Definir prazo do cartão',
  assign_user: 'Atribuir responsável',
  add_label: 'Adicionar etiqueta',
  move_card: 'Mover cartão',
  copy_card: 'Copiar cartão',
};

export function createDefaultCrmAction(action: CrmAutomationActionType): CrmAutomationAction {
  switch (action) {
    case 'create_task': return { action, config: { title: 'Acompanhar {NOME}', dueDays: 1, dayMode: 'calendar', reentry: 'reuse', showInSchedule: true } };
    case 'apply_checklist': return { action, config: { name: 'Checklist de {NOME}', createTask: false, reentry: 'reuse' } };
    case 'set_due': return { action, config: { dueDays: 1, dayMode: 'calendar' } };
    case 'assign_user': return { action, config: { userId: '' } };
    case 'add_label': return { action, config: { labelId: '' } };
    case 'move_card': return { action, config: { workflowId: '', stageId: '' } };
    case 'copy_card': return { action, config: { workflowId: '', stageId: '', title: '{NOME}' } };
  }
}

const text = (config: Record<string, unknown>, key: string) => typeof config[key] === 'string' ? config[key].trim() : '';

export function validateCrmAutomationRule(rule: CrmAutomationRuleInput): string[] {
  const errors: string[] = [];
  if (!rule.name.trim()) errors.push('Dê um nome para a automação.');
  if (!rule.pipeline_id || !rule.trigger_stage_id) errors.push('A etapa da automação não foi identificada.');
  if (!rule.actions.length) errors.push('Adicione ao menos uma ação.');
  if (rule.actions.length > 20) errors.push('Uma automação aceita no máximo 20 ações.');
  if (rule.trigger_type === 'task_completed' && !text(rule.trigger_config, 'taskName')) errors.push('Informe qual tarefa dispara a automação.');
  if (rule.trigger_type === 'checklist_completed' && !text(rule.trigger_config, 'name')) errors.push('Informe qual checklist dispara a automação.');
  rule.actions.forEach(({ action, config }, index) => {
    const prefix = `Ação ${index + 1}`;
    if (action === 'create_task' && !text(config, 'title')) errors.push(`${prefix}: informe o título da tarefa.`);
    if (action === 'apply_checklist' && !text(config, 'templateId')) errors.push(`${prefix}: escolha um modelo de checklist.`);
    if (action === 'assign_user' && !text(config, 'userId')) errors.push(`${prefix}: escolha um responsável.`);
    if (action === 'add_label' && !text(config, 'labelId')) errors.push(`${prefix}: escolha uma etiqueta.`);
    if ((action === 'move_card' || action === 'copy_card') && (!text(config, 'workflowId') || !text(config, 'stageId'))) errors.push(`${prefix}: escolha o funil e a etapa de destino.`);
    if ((action === 'create_task' || action === 'set_due') && Number(config.dueDays) < 0) errors.push(`${prefix}: o prazo não pode ser negativo.`);
    if (action === 'move_card' && index < rule.actions.length - 1) errors.push(`${prefix}: mover o cartão precisa ser a última ação.`);
  });
  return errors;
}

export function splitRequirementNames(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}
