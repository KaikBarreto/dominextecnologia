import { describe, expect, it } from 'vitest';
import { buildDreExcelSheets } from './dreExcelGenerator';

describe('buildDreExcelSheets', () => {
  it('leva o mesmo regime, totais, categorias e centros de custo do PDF', () => {
    const sheets = buildDreExcelSheets({
      company: { name: 'Dominex DEMO', document: '00.000.000/0001-00' },
      period: '01/09/2026 a 30/09/2026',
      regime: 'competencia',
      receitaBruta: 10_000,
      receitaCategories: [{ name: 'Serviços', value: 10_000, color: '#000' }],
      impostos: 1_000,
      impostosCategories: [{ name: 'ISS', value: 1_000, color: '#000' }],
      receitaLiquida: 9_000,
      cpv: 2_000,
      cpvCategories: [{ name: 'Materiais', value: 2_000, color: '#000' }],
      lucroBruto: 7_000,
      opex: 3_000,
      opexCategories: [{ name: 'Aluguel', value: 3_000, color: '#000' }],
      resultadoLiquido: 4_000,
      margem: 70,
      costCenters: [{ name: 'Operação', color: '#000', revenue: 10_000, expense: 6_000, result: 4_000 }],
    });

    expect(sheets[0].rows).toContainEqual(['Regime', 'Competência']);
    expect(sheets[0].rows).toContainEqual(['Receita Bruta', 'Serviços', 10_000]);
    expect(sheets[0].rows).toContainEqual(['Resultado Líquido (EBITDA)', 'Total', 4_000]);
    expect(sheets[0].rows).toContainEqual(['Despesas Operacionais', 'Aluguel', -3_000]);
    expect(sheets[1].rows).toContainEqual(['Operação', 10_000, -6_000, 4_000]);
  });
});
