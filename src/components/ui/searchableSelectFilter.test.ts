// O `SearchableSelect` é o combobox de ~40 telas (cliente, material, categoria,
// tipo de serviço...). Trocamos o filtro nativo do cmdk pela régua de busca do
// sistema, então o comportamento dele precisa estar preso por teste.
import { describe, it, expect } from 'vitest';
import { searchableSelectFilter, CREATE_ITEM_PREFIX } from './searchableSelectFilter';

const SHOW = 1;
const HIDE = 0;

describe('searchableSelectFilter', () => {
  it('mostra tudo quando a busca está vazia', () => {
    expect(searchableSelectFilter('Marcos Antônio', '')).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Antônio', '   ')).toBe(SHOW);
  });

  it('casa o rótulo ignorando acento', () => {
    expect(searchableSelectFilter('Hélio', 'helio')).toBe(SHOW);
    expect(searchableSelectFilter('Helio', 'hélio')).toBe(SHOW);
    expect(searchableSelectFilter('Hélio', 'HELIO')).toBe(SHOW);
  });

  it('casa palavras soltas e fora de ordem', () => {
    expect(searchableSelectFilter('Marcos Antônio Moraes Braga', 'marcos braga')).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Antônio Moraes Braga', 'braga marcos')).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Antônio Moraes Braga', 'marcos silva')).toBe(HIDE);
  });

  it('casa por keywords (telefone/documento do cliente, SKU do material)', () => {
    const keywords = ['(21) 96830-1901', '123.456.789-00', 'marcos@empresa.com.br'];
    expect(searchableSelectFilter('Marcos Braga', '21968301901', keywords)).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Braga', '(21) 96830-1901', keywords)).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Braga', '12345678900', keywords)).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Braga', 'marcos@empresa', keywords)).toBe(SHOW);
    expect(searchableSelectFilter('Marcos Braga', '21999998888', keywords)).toBe(HIDE);
  });

  it('esconde quem não casa nem rótulo nem keyword', () => {
    expect(searchableSelectFilter('Marcos Braga', 'joao', ['(21) 96830-1901'])).toBe(HIDE);
  });

  it('opção sem keywords continua filtrando só pelo rótulo', () => {
    expect(searchableSelectFilter('Ar-condicionado Split', 'split')).toBe(SHOW);
    expect(searchableSelectFilter('Ar-condicionado Split', 'geladeira')).toBe(HIDE);
  });

  it('NUNCA esconde o item de criar, mesmo sem casar a busca', () => {
    const createValue = `${CREATE_ITEM_PREFIX} Criar "xyzabc"`;
    expect(searchableSelectFilter(createValue, 'xyzabc')).toBe(SHOW);
    expect(searchableSelectFilter(createValue, 'nada casa isso aqui')).toBe(SHOW);
    expect(searchableSelectFilter(createValue, '')).toBe(SHOW);
  });
});
