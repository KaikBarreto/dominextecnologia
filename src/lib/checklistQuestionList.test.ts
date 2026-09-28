import { describe, expect, it } from 'vitest';
import { buildChecklistQuestionPage } from './checklistQuestionList';

const questions = Array.from({ length: 45 }, (_, index) => ({
  id: `q-${index + 1}`,
  question: index === 24 ? 'Verificar pressão do compressor' : `Pergunta ${String(index + 1).padStart(2, '0')}`,
  description: index === 24 ? 'Medição em PSI' : null,
  position: index,
  types: index % 2 === 0 ? ['boolean'] : ['number'],
}));

const build = (overrides: Partial<Parameters<typeof buildChecklistQuestionPage<(typeof questions)[number]>>[0]> = {}) => buildChecklistQuestionPage({
  questions,
  query: '',
  typeFilter: 'all',
  sort: 'position',
  direction: 'asc',
  page: 1,
  pageSize: 20,
  getTypes: (question) => question.types,
  getTypeLabel: (type) => type === 'boolean' ? 'Sim/Não' : 'Número',
  ...overrides,
});

describe('buildChecklistQuestionPage', () => {
  it('pagina sem perder perguntas', () => {
    expect(build().items).toHaveLength(20);
    expect(build({ page: 3 }).items).toHaveLength(5);
    expect(build().totalPages).toBe(3);
  });

  it('pesquisa pergunta, descrição e nome do tipo sem diferenciar maiúsculas', () => {
    expect(build({ query: 'COMPRESSOR' }).items.map((item) => item.id)).toEqual(['q-25']);
    expect(build({ query: 'psi' }).items.map((item) => item.id)).toEqual(['q-25']);
    expect(build({ query: 'sim/não' }).filtered).toHaveLength(23);
  });

  it('combina filtro de tipo e ordenação por tipo', () => {
    expect(build({ typeFilter: 'number' }).filtered).toHaveLength(22);
    const sorted = build({ sort: 'type' }).filtered;
    expect(sorted[0].types[0]).toBe('number');
    expect(sorted.at(-1)?.types[0]).toBe('boolean');
  });

  it('corrige página fora do intervalo após um filtro', () => {
    const result = build({ query: 'compressor', page: 99 });
    expect(result.currentPage).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});
