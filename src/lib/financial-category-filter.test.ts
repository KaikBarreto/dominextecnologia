import { describe, it, expect } from 'vitest';
import { filterCategoriesByTransactionType, filterCategoriesForSelect, type CategoryLike } from './financial-category-filter';

/**
 * Regressão do bug em ContaFormDialog: o filtro usava 'receita'/'despesa',
 * vocabulário que nunca existiu em `financial_categories.type` (é
 * `entrada|saida|ambos`), então o select de Categoria em "Nova Conta"
 * aparecia vazio pra quase todo mundo.
 */
describe('filterCategoriesByTransactionType', () => {
  const categories: (CategoryLike & { name: string })[] = [
    { name: 'Salários', type: 'saida', is_active: true },
    { name: 'Vendas de serviço', type: 'entrada', is_active: true },
    { name: 'Transferência entre contas', type: 'ambos', is_active: true },
    { name: 'Categoria antiga desativada', type: 'entrada', is_active: false },
  ];

  it('categoria entrada aparece em conta a receber', () => {
    const result = filterCategoriesByTransactionType(categories, 'entrada');
    expect(result.map((c) => c.name)).toContain('Vendas de serviço');
  });

  it('categoria entrada NÃO aparece em conta a pagar', () => {
    const result = filterCategoriesByTransactionType(categories, 'saida');
    expect(result.map((c) => c.name)).not.toContain('Vendas de serviço');
  });

  it('categoria saida aparece em conta a pagar', () => {
    const result = filterCategoriesByTransactionType(categories, 'saida');
    expect(result.map((c) => c.name)).toContain('Salários');
  });

  it('categoria saida NÃO aparece em conta a receber', () => {
    const result = filterCategoriesByTransactionType(categories, 'entrada');
    expect(result.map((c) => c.name)).not.toContain('Salários');
  });

  it('categoria ambos aparece nos dois tipos', () => {
    expect(filterCategoriesByTransactionType(categories, 'entrada').map((c) => c.name)).toContain('Transferência entre contas');
    expect(filterCategoriesByTransactionType(categories, 'saida').map((c) => c.name)).toContain('Transferência entre contas');
  });

  it('categoria inativa não aparece em nenhum tipo', () => {
    expect(filterCategoriesByTransactionType(categories, 'entrada').map((c) => c.name)).not.toContain('Categoria antiga desativada');
    expect(filterCategoriesByTransactionType(categories, 'saida').map((c) => c.name)).not.toContain('Categoria antiga desativada');
  });

  it('lida com lista vazia/nula sem quebrar', () => {
    expect(filterCategoriesByTransactionType(null, 'entrada')).toEqual([]);
    expect(filterCategoriesByTransactionType(undefined, 'saida')).toEqual([]);
    expect(filterCategoriesByTransactionType([], 'entrada')).toEqual([]);
  });
});

/**
 * Regressão: ao EDITAR um lançamento cuja categoria foi desativada, o
 * SearchableSelect caía no placeholder (campo parecia vazio) porque o `value`
 * não estava entre as `options`.
 */
describe('filterCategoriesForSelect', () => {
  const categories: (CategoryLike & { name: string })[] = [
    { name: 'Salários', type: 'saida', is_active: true },
    { name: 'Vendas de serviço', type: 'entrada', is_active: true },
    { name: 'Categoria antiga desativada', type: 'saida', is_active: false },
  ];

  it('sem seleção, se comporta como o filtro normal', () => {
    expect(filterCategoriesForSelect(categories, 'saida').map((c) => c.name))
      .toEqual(['Salários']);
    expect(filterCategoriesForSelect(categories, 'saida', '').map((c) => c.name))
      .toEqual(['Salários']);
    expect(filterCategoriesForSelect(categories, 'saida', null).map((c) => c.name))
      .toEqual(['Salários']);
  });

  it('mantém a categoria selecionada mesmo desativada', () => {
    const result = filterCategoriesForSelect(categories, 'saida', 'Categoria antiga desativada');
    expect(result.map((c) => c.name)).toEqual(['Salários', 'Categoria antiga desativada']);
  });

  it('não duplica quando a selecionada já está visível', () => {
    const result = filterCategoriesForSelect(categories, 'saida', 'Salários');
    expect(result.map((c) => c.name)).toEqual(['Salários']);
  });

  it('mantém a selecionada mesmo quando o tipo dela não bate', () => {
    const result = filterCategoriesForSelect(categories, 'saida', 'Vendas de serviço');
    expect(result.map((c) => c.name)).toEqual(['Salários', 'Vendas de serviço']);
  });

  it('categoria selecionada que não existe mais na tabela não quebra', () => {
    const result = filterCategoriesForSelect(categories, 'saida', 'Apagada de vez');
    expect(result.map((c) => c.name)).toEqual(['Salários']);
  });

  it('lida com lista nula', () => {
    expect(filterCategoriesForSelect(null, 'saida', 'Qualquer')).toEqual([]);
  });
});
