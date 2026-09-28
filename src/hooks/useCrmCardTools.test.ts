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
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].done).toBe(true);
    expect(result[0].items[1].done).toBe(false);
  });

  it('aceita valores corrompidos como lista vazia', () => {
    expect(normalizeCrmLeadChecklists({})).toEqual([]);
    expect(normalizeCrmChecklistTemplateItems('inválido')).toEqual([]);
  });
});
