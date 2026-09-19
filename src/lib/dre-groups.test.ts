import { describe, it, expect } from 'vitest';
import { getDreGroupKey, groupByDre, shouldGroupByDre, DRE_GROUP_ORDER } from './dre-groups';

const LABELS = {
  impostos: 'Impostos',
  cmv: 'CSP',
  opex: 'Despesas operacionais',
  outros: 'Outros',
};

const cat = (name: string, dre_group: string | null) => ({ name, dre_group }) as any;

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
