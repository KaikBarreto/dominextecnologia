import { describe, it, expect } from 'vitest';
import { filterCostCentersForSelect, type CostCenterLike } from './cost-center-filter';

/**
 * Regressão do mesmo bug já visto em `filterCategoriesForSelect`: ao editar
 * um lançamento cujo centro de custo foi desativado depois, o select não
 * pode aparecer vazio.
 */
describe('filterCostCentersForSelect', () => {
  const costCenters: (CostCenterLike & { name: string })[] = [
    { id: '1', name: 'Obra Shopping Vale', is_active: true },
    { id: '2', name: 'Administrativo', is_active: true },
    { id: '3', name: 'Projeto antigo desativado', is_active: false },
  ];

  it('sem seleção, mostra só os ativos', () => {
    expect(filterCostCentersForSelect(costCenters).map((c) => c.name))
      .toEqual(['Obra Shopping Vale', 'Administrativo']);
    expect(filterCostCentersForSelect(costCenters, null).map((c) => c.name))
      .toEqual(['Obra Shopping Vale', 'Administrativo']);
    expect(filterCostCentersForSelect(costCenters, '').map((c) => c.name))
      .toEqual(['Obra Shopping Vale', 'Administrativo']);
  });

  it('centro inativo não aparece quando não é o selecionado', () => {
    const result = filterCostCentersForSelect(costCenters, '1');
    expect(result.map((c) => c.name)).not.toContain('Projeto antigo desativado');
  });

  it('mantém o centro selecionado mesmo desativado', () => {
    const result = filterCostCentersForSelect(costCenters, '3');
    expect(result.map((c) => c.name)).toEqual(['Obra Shopping Vale', 'Administrativo', 'Projeto antigo desativado']);
  });

  it('não duplica quando o selecionado já está entre os ativos', () => {
    const result = filterCostCentersForSelect(costCenters, '1');
    expect(result.map((c) => c.name)).toEqual(['Obra Shopping Vale', 'Administrativo']);
  });

  it('centro selecionado que não existe mais na tabela não quebra', () => {
    const result = filterCostCentersForSelect(costCenters, 'apagado-de-vez');
    expect(result.map((c) => c.name)).toEqual(['Obra Shopping Vale', 'Administrativo']);
  });

  it('lida com lista nula/vazia sem quebrar', () => {
    expect(filterCostCentersForSelect(null, '1')).toEqual([]);
    expect(filterCostCentersForSelect(undefined)).toEqual([]);
    expect(filterCostCentersForSelect([], '1')).toEqual([]);
  });
});
