import { describe, it, expect } from 'vitest';
import { tidyProcessGraph } from '../tidy';
import { PROCESS_LANE_TYPE, PROCESS_NODE_TYPE, type ProcessGraph, type ProcessNode } from '../types';
import { getShapeSpec, type ProcessShape } from '../shapes';

function node(id: string, shape: ProcessShape, x: number, y: number, parentId?: string): ProcessNode {
  return {
    id, type: PROCESS_NODE_TYPE, position: { x, y },
    ...(parentId ? { parentId } : {}),
    data: { shape, label: id },
  };
}
function lane(id: string, y: number): ProcessNode {
  return { id, type: PROCESS_LANE_TYPE, position: { x: 0, y }, width: 2000, height: 400, data: { label: id } };
}
function edge(source: string, target: string, sh?: string, th?: string) {
  return { id: `${source}-${target}`, source, target,
    ...(sh ? { sourceHandle: sh } : {}), ...(th ? { targetHandle: th } : {}) };
}
const pos = (g: ProcessGraph, id: string) => g.nodes.find((n) => n.id === id)!.position;
const handles = (g: ProcessGraph, id: string) => {
  const e = g.edges.find((x) => x.id === id)!;
  return { s: e.sourceHandle, t: e.targetHandle };
};

describe('tidyProcessGraph', () => {
  it('não quebra com grafo vazio', () => {
    const g = tidyProcessGraph({ nodes: [], edges: [] });
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it('não muta o grafo original', () => {
    const original: ProcessGraph = { nodes: [node('a', 'task', 13, 27)], edges: [] };
    const copia = JSON.parse(JSON.stringify(original));
    tidyProcessGraph(original);
    expect(original).toEqual(copia);
  });

  it('encaixa as posições na grade', () => {
    const g = tidyProcessGraph({ nodes: [node('a', 'task', 13, 27)], edges: [] }, { grid: 20 });
    expect(pos(g, 'a').x % 20).toBe(0);
    expect(pos(g, 'a').y % 20).toBe(0);
  });

  it('alinha na MESMA linha caixas que estavam quase alinhadas', () => {
    // Três tarefas com 7px e 11px de desalinhamento vertical — o erro que o
    // olho percebe sem saber nomear.
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 0, 100), node('b', 'task', 400, 107), node('c', 'task', 800, 96)],
      edges: [],
    });
    const ys = ['a', 'b', 'c'].map((id) => pos(g, id).y);
    expect(new Set(ys).size).toBe(1);
  });

  it('centraliza na linha caixas de alturas diferentes', () => {
    const g = tidyProcessGraph({
      nodes: [node('t', 'task', 0, 100), node('d', 'decision', 400, 90)],
      edges: [],
    }, { grid: 1 });
    const ct = pos(g, 't').y + getShapeSpec('task').size.height / 2;
    const cd = pos(g, 'd').y + getShapeSpec('decision').size.height / 2;
    expect(Math.abs(ct - cd)).toBeLessThanOrEqual(1);
  });

  it('alinha colunas pela borda esquerda', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 100, 0), node('b', 'task', 108, 300), node('c', 'task', 94, 600)],
      edges: [],
    });
    const xs = ['a', 'b', 'c'].map((id) => pos(g, id).x);
    expect(new Set(xs).size).toBe(1);
  });

  it('NÃO alinha caixas que estão legitimamente longe uma da outra', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 0, 100), node('b', 'task', 400, 900)],
      edges: [],
    });
    expect(pos(g, 'a').y).not.toBe(pos(g, 'b').y);
  });

  it('seta pra direita sai pela direita e entra pela esquerda', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 0, 0), node('b', 'task', 600, 0)],
      edges: [edge('a', 'b', 'top-source', 'bottom-target')],
    });
    expect(handles(g, 'a-b')).toEqual({ s: 'right-source', t: 'left-target' });
  });

  it('seta pra baixo sai por baixo e entra por cima', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 0, 0), node('b', 'task', 0, 600)],
      edges: [edge('a', 'b', 'left-source', 'right-target')],
    });
    expect(handles(g, 'a-b')).toEqual({ s: 'bottom-source', t: 'top-target' });
  });

  it('seta que volta pra trás sai pela esquerda', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 900, 0), node('b', 'task', 0, 0)],
      edges: [edge('a', 'b')],
    });
    expect(handles(g, 'a-b').s).toBe('left-source');
  });

  it('duas saídas do mesmo nó NÃO disputam o mesmo ponto', () => {
    // É o defeito visível no print: "Elétrica" e "Gás" saindo do mesmo lugar,
    // o que faz os dois caminhos parecerem uma linha só.
    const g = tidyProcessGraph({
      nodes: [
        node('d', 'decision', 500, 0),
        node('x', 'task', 100, 400),
        node('y', 'task', 500, 400),
      ],
      edges: [edge('d', 'x'), edge('d', 'y')],
    });
    const a = handles(g, 'd-x').s;
    const b = handles(g, 'd-y').s;
    expect(a).not.toBe(b);
  });

  it('duas entradas no mesmo nó NÃO disputam o mesmo ponto', () => {
    const g = tidyProcessGraph({
      nodes: [
        node('a', 'task', 0, 0),
        node('b', 'task', 0, 400),
        node('alvo', 'task', 600, 200),
      ],
      edges: [edge('a', 'alvo'), edge('b', 'alvo')],
    });
    expect(handles(g, 'a-alvo').t).not.toBe(handles(g, 'b-alvo').t);
  });

  it('raia não é reposicionada nem alinhada', () => {
    const g = tidyProcessGraph({
      nodes: [lane('l1', 37), node('a', 'task', 13, 27, 'l1')],
      edges: [],
    });
    expect(pos(g, 'l1')).toEqual({ x: 0, y: 37 });
  });

  it('usa a posição ABSOLUTA pra escolher o lado quando há raias', () => {
    // 'a' está na raia de cima, 'b' na de baixo. Em coordenada relativa os dois
    // têm y=40 e pareceriam lado a lado; só somando a raia se vê que b está
    // ABAIXO. Sem isso a seta sairia pelo lado errado.
    const g = tidyProcessGraph({
      nodes: [
        lane('l1', 0), lane('l2', 600),
        node('a', 'task', 40, 40, 'l1'),
        node('b', 'task', 40, 40, 'l2'),
      ],
      edges: [edge('a', 'b')],
    });
    expect(handles(g, 'a-b')).toEqual({ s: 'bottom-source', t: 'top-target' });
  });

  it('preserva rótulo, tipo e demais campos da aresta', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'decision', 0, 0), node('b', 'task', 600, 0)],
      edges: [{ id: 'a-b', source: 'a', target: 'b', label: 'Sim', data: { kind: 'information' } }],
    });
    const e = g.edges[0];
    expect(e.label).toBe('Sim');
    expect(e.data).toEqual({ kind: 'information' });
  });

  it('ignora aresta pendurada em nó que não existe mais', () => {
    const g = tidyProcessGraph({
      nodes: [node('a', 'task', 0, 0)],
      edges: [edge('a', 'fantasma')],
    });
    expect(g.edges).toHaveLength(1);
  });
});
