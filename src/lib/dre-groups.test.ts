import { describe, it, expect } from 'vitest';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import {
  getDreGroupKey,
  groupByConfiguredDre,
  groupByDre,
  legacyDreGroupForNature,
  resolveCategoryDreNature,
  shouldGroupByDre,
  DRE_GROUP_ORDER,
} from './dre-groups';

const LABELS = {
  impostos: 'Impostos',
  cmv: 'CSP',
  opex: 'Despesas operacionais',
  outros: 'Outros',
};

const cat = (name: string, dre_group: string | null): Pick<FinancialCategory, 'name' | 'dre_group'> => ({
  name,
  dre_group,
});

describe('getDreGroupKey', () => {
  it('reconhece os três grupos conhecidos', () => {
    expect(getDreGroupKey(cat('ISS', 'impostos'))).toBe('impostos');
    expect(getDreGroupKey(cat('Peças', 'cmv'))).toBe('cmv');
    expect(getDreGroupKey(cat('Aluguel', 'opex'))).toBe('opex');
  });

  it('joga em "outros" o que for nulo ou desconhecido', () => {
    // `dre_group` é text livre no banco (sem enum/check): lixo tem que cair no
    // bucket final em vez de sumir da lista.
    expect(getDreGroupKey(cat('Sem classificação', null))).toBe('outros');
    expect(getDreGroupKey(cat('Legado', 'qualquer_coisa'))).toBe('outros');
    expect(getDreGroupKey(cat('Vazio', ''))).toBe('outros');
  });
});

describe('groupByDre', () => {
  it('respeita a ordem do DRE, não a ordem de entrada', () => {
    const groups = groupByDre(
      [cat('Aluguel', 'opex'), cat('ISS', 'impostos'), cat('Peças', 'cmv')],
      LABELS,
    );
    expect(groups.map((g) => g.key)).toEqual(['impostos', 'cmv', 'opex']);
    expect(DRE_GROUP_ORDER.indexOf('impostos')).toBeLessThan(DRE_GROUP_ORDER.indexOf('opex'));
  });

  it('descarta grupo vazio, pra não sobrar divisória fantasma', () => {
    const groups = groupByDre([cat('Aluguel', 'opex')], LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Despesas operacionais');
  });

  it('não perde nenhuma categoria pelo caminho', () => {
    const items = [
      cat('ISS', 'impostos'),
      cat('Peças', 'cmv'),
      cat('Aluguel', 'opex'),
      cat('Solta', null),
    ];
    const total = groupByDre(items, LABELS).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(items.length);
  });
});

describe('shouldGroupByDre', () => {
  it('empresa que nunca classificou continua vendo lista plana', () => {
    const groups = groupByDre([cat('Aluguel', 'opex'), cat('Água', 'opex')], LABELS);
    expect(shouldGroupByDre(groups)).toBe(false);
  });

  it('a partir de 2 grupos com item, agrupa', () => {
    const groups = groupByDre([cat('Aluguel', 'opex'), cat('ISS', 'impostos')], LABELS);
    expect(shouldGroupByDre(groups)).toBe(true);
  });

  it('lista vazia não agrupa', () => {
    expect(shouldGroupByDre(groupByDre([], LABELS))).toBe(false);
  });
});

describe('groupByConfiguredDre', () => {
  const configured = [
    { id: 'g-opex-2', name: 'Despesas administrativas', nature: 'operating_expense' as const, sort_order: 20, is_active: true },
    { id: 'g-cost', name: 'Custos diretos', nature: 'cost' as const, sort_order: 10, is_active: true },
  ];

  it('usa nome e ordem configurados pela empresa', () => {
    const groups = groupByConfiguredDre(
      [
        { ...cat('Aluguel', 'opex'), dre_group_id: 'g-opex-2' },
        { ...cat('Peças', 'cmv'), dre_group_id: 'g-cost' },
      ],
      configured,
      LABELS,
    );
    expect(groups.map((group) => group.label)).toEqual(['Custos diretos', 'Despesas administrativas']);
    expect(groups.map((group) => group.nature)).toEqual(['cost', 'operating_expense']);
  });

  it('mantém categoria legada visível quando ainda não tem grupo configurável', () => {
    const groups = groupByConfiguredDre(
      [{ ...cat('ISS legado', 'impostos'), dre_group_id: null }],
      configured,
      LABELS,
    );
    expect(groups[0]).toMatchObject({ key: 'legacy:impostos', label: 'Impostos', nature: 'deduction' });
    expect(groups[0].items[0].name).toBe('ISS legado');
  });

  it('reconhece receita legada pelo tipo e preserva a chave opex no write', () => {
    expect(resolveCategoryDreNature(
      { type: 'entrada', dre_group: 'opex', dre_group_id: null },
      configured,
    )).toBe('revenue');
    expect(legacyDreGroupForNature('revenue')).toBe('opex');
  });
});
