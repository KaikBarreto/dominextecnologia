import { describe, expect, it } from 'vitest';
import {
  buildCrmChecklistTemplateCopies,
  type CrmChecklistTemplate,
} from './useCrmCardTools';

const source: CrmChecklistTemplate = {
  id: 'template-original',
  name: 'Qualificação',
  items: [
    { id: 'item-1', text: 'Confirmar necessidade' },
    { id: 'item-2', text: 'Validar orçamento' },
  ],
};

describe('buildCrmChecklistTemplateCopies', () => {
  it('preserva o nome exato quando gera uma cópia e renova os ids dos itens', () => {
    const [copy] = buildCrmChecklistTemplateCopies(source, '  Qualificação nova  ', 1);

    expect(copy.name).toBe('Qualificação nova');
    expect(copy.items.map((item) => item.text)).toEqual(source.items.map((item) => item.text));
    expect(copy.items.map((item) => item.id)).not.toEqual(source.items.map((item) => item.id));
  });

  it('numera nomes e não compartilha ids entre várias cópias', () => {
    const copies = buildCrmChecklistTemplateCopies(source, 'Qualificação nova', 3);
    const itemIds = copies.flatMap((copy) => copy.items.map((item) => item.id));

    expect(copies.map((copy) => copy.name)).toEqual([
      'Qualificação nova (1)',
      'Qualificação nova (2)',
      'Qualificação nova (3)',
    ]);
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it('recusa nome vazio e quantidade fora do limite', () => {
    expect(() => buildCrmChecklistTemplateCopies(source, ' ', 1)).toThrow('Informe um nome');
    expect(() => buildCrmChecklistTemplateCopies(source, 'Cópia', 0)).toThrow('entre 1 e 20');
    expect(() => buildCrmChecklistTemplateCopies(source, 'Cópia', 21)).toThrow('entre 1 e 20');
    expect(() => buildCrmChecklistTemplateCopies(source, 'Cópia', 1.5)).toThrow('entre 1 e 20');
  });
});
