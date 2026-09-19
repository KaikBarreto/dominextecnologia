import { describe, it, expect } from 'vitest';
import {
  buildCategoryTree,
  resolveCategoryCascade,
  groupDreRowsByParent,
  nodeValue,
  type DreRowLike,
} from './category-tree';

interface Cat {
  id: string;
  name: string;
  parent_id: string | null;
  dre_group?: string;
}

const cat = (id: string, name: string, parent_id: string | null = null, dre_group = 'opex'): Cat =>
  ({ id, name, parent_id, dre_group });

describe('buildCategoryTree', () => {
  it('categoria sem filha não ganha filha nenhuma (a tela dela não muda)', () => {
    const list = [cat('1', 'Aluguel'), cat('2', 'Combustível')];
    const tree = buildCategoryTree(list);
    expect(tree.roots.map((c) => c.id)).toEqual(['1', '2']);
    expect(tree.hasChildren('1')).toBe(false);
    expect(tree.childrenOf('1')).toEqual([]);
    // Mesmo array vazio sempre: não realoca a cada render.
    expect(tree.childrenOf('1')).toBe(tree.childrenOf('2'));
  });

  it('monta o mapa pai → filhas em uma passada só, preservando a ordem', () => {
    const list = [
      cat('p', 'CSP'),
      cat('a', 'CSP, Pedágio', 'p'),
      cat('b', 'CSP, Combustível', 'p'),
      cat('z', 'Aluguel'),
    ];
    const tree = buildCategoryTree(list);
    expect(tree.roots.map((c) => c.id)).toEqual(['p', 'z']);
    expect(tree.childrenOf('p').map((c) => c.id)).toEqual(['a', 'b']);
    expect(tree.hasChildren('p')).toBe(true);
    expect(tree.parentOf(list[1])?.name).toBe('CSP');
  });

  it('filha cujo pai está fora do recorte vira raiz, em vez de sumir da tela', () => {
    // Acontece no select: o pai está inativo e foi filtrado, a filha não.
    const tree = buildCategoryTree([cat('a', 'CSP, Pedágio', 'pai-inativo')]);
    expect(tree.roots.map((c) => c.id)).toEqual(['a']);
    expect(tree.parentOf(tree.roots[0])).toBeNull();
  });

  it('lista vazia ou nula não quebra', () => {
    expect(buildCategoryTree(null).roots).toEqual([]);
    expect(buildCategoryTree(undefined).hasChildren('x')).toBe(false);
  });
});

describe('resolveCategoryCascade', () => {
  const list = [
    cat('p', 'Salários'),
    cat('a', 'Salários, Administrativo', 'p'),
    cat('b', 'Salários, Ajudantes', 'p'),
    cat('z', 'Aluguel'),
  ];
  const tree = buildCategoryTree(list);

  it('nome da FILHA gravado abre os dois selects no lugar certo', () => {
    const c = resolveCategoryCascade(tree, 'Salários, Ajudantes');
    expect(c.parentName).toBe('Salários');
    expect(c.childName).toBe('Salários, Ajudantes');
    expect(c.children.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('nome do PAI gravado mantém o segundo select em "usar a principal"', () => {
    const c = resolveCategoryCascade(tree, 'Salários');
    expect(c.parentName).toBe('Salários');
    expect(c.childName).toBe('');
    expect(c.children).toHaveLength(2);
  });

  it('categoria sem filha não oferece segundo select', () => {
    const c = resolveCategoryCascade(tree, 'Aluguel');
    expect(c.parentName).toBe('Aluguel');
    expect(c.children).toHaveLength(0);
  });

  it('nome órfão (categoria apagada) continua visível no primeiro select', () => {
    const c = resolveCategoryCascade(tree, 'Categoria que não existe mais');
    expect(c.parentName).toBe('Categoria que não existe mais');
    expect(c.children).toHaveLength(0);
  });

  it('vazio é vazio', () => {
    expect(resolveCategoryCascade(tree, '').parentName).toBe('');
    expect(resolveCategoryCascade(tree, null).parentName).toBe('');
  });
});

// ── DRE ─────────────────────────────────────────────────────────────────────

const row = (name: string, value: number, group = 'opex'): DreRowLike & { name: string } =>
  ({ name, key: `${group}:${name}`, value });

const sum = <R extends DreRowLike>(rows: readonly R[]) => rows.reduce((a, r) => a + r.value, 0);

describe('groupDreRowsByParent', () => {
  const opts = (parents: Record<string, string>, sameGroup: (p: string) => boolean = () => true) => ({
    parentNameOf: (name: string) => parents[name] ?? null,
    parentInSameGroup: sameGroup,
    makeKey: (name: string) => `opex:${name}`,
  });

  it('sem nenhuma hierarquia, devolve exatamente as linhas de antes', () => {
    const rows = [row('Aluguel', 100), row('Combustível', 50)];
    const nodes = groupDreRowsByParent(rows, opts({}));
    expect(nodes.every((n) => n.kind === 'leaf')).toBe(true);
    expect(nodes.map((n) => n.key)).toEqual(['opex:Aluguel', 'opex:Combustível']);
  });

  it('NÃO conta duas vezes: subtotal do pai substitui as filhas, nunca soma por cima', () => {
    const rows = [row('Salários', 1000), row('Ajudantes', 400), row('Administrativo', 600), row('Aluguel', 300)];
    const nodes = groupDreRowsByParent(rows, opts({ Ajudantes: 'Salários', Administrativo: 'Salários' }));
    const parent = nodes.find((n) => n.kind === 'parent') as any;
    expect(parent.total).toBe(2000);
    expect(parent.own?.value).toBe(1000);
    expect(parent.children.map((c: any) => c.name)).toEqual(['Ajudantes', 'Administrativo']);
    // As filhas NÃO aparecem também como linha solta.
    expect(nodes.filter((n) => n.kind === 'leaf').map((n: any) => n.row.name)).toEqual(['Aluguel']);
    // Invariante central: o total da tela continua idêntico ao total das linhas.
    expect(nodes.reduce((a, n) => a + nodeValue(n), 0)).toBe(sum(rows));
  });

  it('pai sem lançamento próprio no período ainda agrupa as filhas', () => {
    const rows = [row('Ajudantes', 400), row('Administrativo', 600)];
    const nodes = groupDreRowsByParent(rows, opts({ Ajudantes: 'Salários', Administrativo: 'Salários' }));
    expect(nodes).toHaveLength(1);
    const parent = nodes[0] as any;
    expect(parent.kind).toBe('parent');
    expect(parent.own).toBeNull();
    expect(parent.total).toBe(1000);
    expect(nodes.reduce((a, n) => a + nodeValue(n), 0)).toBe(sum(rows));
  });

  it('filha de grupo DIFERENTE do pai fica solta, e o grupo não vaza', () => {
    // `Ajudantes` é cmv, o pai `Salários` é opex: nesta lista (opex) a filha
    // não pode ser dobrada no pai, senão o total de opex deixaria de bater.
    const rows = [row('Salários', 1000), row('Administrativo', 600)];
    const nodes = groupDreRowsByParent(
      rows,
      opts({ Administrativo: 'Salários', Ajudantes: 'Salários' }, (p) => p === 'Salários'),
    );
    const parent = nodes.find((n) => n.kind === 'parent') as any;
    expect(parent.total).toBe(1600);

    // Na lista de CMV, a mesma filha aparece SOZINHA: o pai não está lá.
    const cmvRows = [row('Ajudantes', 400, 'cmv')];
    const cmvNodes = groupDreRowsByParent(cmvRows, {
      parentNameOf: (name) => (name === 'Ajudantes' ? 'Salários' : null),
      parentInSameGroup: () => false, // pai vive em OPEX
      makeKey: (name) => `cmv:${name}`,
    });
    expect(cmvNodes).toHaveLength(1);
    expect(cmvNodes[0].kind).toBe('leaf');
    expect(cmvNodes.reduce((a, n) => a + nodeValue(n), 0)).toBe(400);
  });

  it('ordena do maior pro menor, contando o subtotal do pai', () => {
    const rows = [row('Aluguel', 900), row('Salários', 200), row('Ajudantes', 800)];
    const nodes = groupDreRowsByParent(rows, opts({ Ajudantes: 'Salários' }));
    expect(nodes.map((n) => (n.kind === 'parent' ? n.name : n.row.name))).toEqual(['Salários', 'Aluguel']);
  });
});
