import { describe, expect, it } from 'vitest';
import { normalizeCrmChecklistTemplateItems, normalizeCrmLeadChecklists } from './useCrmCardTools';

describe('normalização das ferramentas do card do CRM', () => {
  it('descarta itens inválidos e remove espaços dos modelos', () => {
    const items = normalizeCrmChecklistTemplateItems([
      { id: 'one', text: '  Enviar proposta  ' },
      { id: 'empty', text: '  ' },
      null,
    ]);
    expect(items).toEqual([{ id: 'one', text: 'Enviar proposta' }]);
  });

  it('normaliza checklists antigos sem quebrar o card', () => {
    const result = normalizeCrmLeadChecklists([
      {
        id: 'check-1',
        title: '  Implantação ',
        items: [
          { id: 'item-1', text: 'Contrato', done: true },
          { text: 'Treinamento', done: 'sim' },
          { text: '' },
        ],
      },
      { title: '' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Implantação');
    expect(result[0].name).toBe('Implantação');
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].done).toBe(true);
    expect(result[0].items[1].done).toBe(false);
  });

  it('mantém checklist automático visível e preserva o vínculo com a tarefa', () => {
    const result = normalizeCrmLeadChecklists([{
      id: 'check-auto',
      name: ' Follow-up da proposta ',
      template_id: 'template-1',
      automation_rule_id: 'rule-1',
      automation_action_key: 'action-1',
      linked_task_id: 'task-1',
      items: [{ id: 'item-1', text: 'Ligar para o cliente', done: false }],
    }]);

    expect(result).toEqual([{
      id: 'check-auto',
      name: 'Follow-up da proposta',
      title: 'Follow-up da proposta',
      templateId: 'template-1',
      automation_rule_id: 'rule-1',
      automation_action_key: 'action-1',
      linked_task_id: 'task-1',
      items: [{ id: 'item-1', text: 'Ligar para o cliente', done: false }],
    }]);
  });

  it('preserva nome e metadados ao normalizar o formato manual compatível', () => {
    const result = normalizeCrmLeadChecklists([{
      id: 'check-manual',
      title: 'Documentos',
      name: 'Documentos',
      templateId: 'template-2',
      items: [],
    }]);

    expect(result[0]).toMatchObject({
      id: 'check-manual',
      title: 'Documentos',
      name: 'Documentos',
      templateId: 'template-2',
    });
  });

  it('aceita valores corrompidos como lista vazia', () => {
    expect(normalizeCrmLeadChecklists({})).toEqual([]);
    expect(normalizeCrmChecklistTemplateItems('inválido')).toEqual([]);
  });
});
