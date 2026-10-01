import { describe, it, expect } from 'vitest';
import { buildPopOutline } from '../popOutline';
import { PROCESS_LANE_TYPE, PROCESS_NODE_TYPE, type ProcessGraph, type ProcessNode } from '../types';
import type { ProcessShape } from '../shapes';

function node(
  id: string,
  shape: ProcessShape,
  extra: Record<string, unknown> = {},
): ProcessNode {
  return {
    id,
    type: PROCESS_NODE_TYPE,
    position: { x: 0, y: 0 },
    data: { shape, label: id, ...extra },
  };
}
function lane(id: string, label: string): ProcessNode {
  return { id, type: PROCESS_LANE_TYPE, position: { x: 0, y: 0 }, data: { label } };
}
function edge(source: string, target: string, label?: string, kind?: 'information') {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...(label ? { label } : {}),
    ...(kind ? { data: { kind } } : {}),
  };
}
function graph(nodes: ProcessNode[], edges: ReturnType<typeof edge>[] = []): ProcessGraph {
  return { nodes, edges };
}

describe('buildPopOutline', () => {
  it('devolve roteiro vazio pra desenho vazio', () => {
    const o = buildPopOutline(graph([]));
    expect(o.steps).toEqual([]);
    expect(o.notes).toEqual([]);
    expect(o.lanes).toEqual([]);
  });

  it('numera 1..N na ordem do fluxo, não na ordem do array', () => {
    // Array fora de ordem de propósito: e, t, s.
    const o = buildPopOutline(
      graph(
        [node('e', 'end'), node('t', 'task'), node('s', 'start')],
        [edge('s', 't'), edge('t', 'e')],
      ),
    );
    expect(o.steps.map((s) => [s.number, s.nodeId])).toEqual([
      ['1', 's'],
      ['2', 't'],
      ['3', 'e'],
    ]);
  });

  it('cada passo aponta o próximo pelo número e pelo nome', () => {
    const o = buildPopOutline(
      graph([node('s', 'start'), node('t', 'task'), node('e', 'end')], [edge('s', 't'), edge('t', 'e')]),
    );
    expect(o.steps[0].next).toEqual([
      { number: '2', label: 't', isLoopBack: false },
    ]);
    expect(o.steps[2].next).toEqual([]);
  });

  it('decisão vira dois caminhos com a condição de cada um', () => {
    const o = buildPopOutline(
      graph(
        [node('s', 'start'), node('d', 'decision'), node('a', 'task'), node('e', 'end')],
        [edge('s', 'd'), edge('d', 'a', 'Reprovado'), edge('d', 'e', 'Aprovado'), edge('a', 'e')],
      ),
    );
    const decision = o.steps.find((s) => s.nodeId === 'd')!;
    expect(decision.next).toEqual([
      { condition: 'Reprovado', number: '3', label: 'a', isLoopBack: false },
      { condition: 'Aprovado', number: '4', label: 'e', isLoopBack: false },
    ]);
  });

  it('marca retorno quando o caminho volta pra um passo anterior', () => {
    const o = buildPopOutline(
      graph(
        [node('s', 'start'), node('t', 'task'), node('d', 'decision'), node('e', 'end')],
        [edge('s', 't'), edge('t', 'd'), edge('d', 'e', 'Aprovado'), edge('d', 't', 'Reprovado')],
      ),
    );
    const decision = o.steps.find((s) => s.nodeId === 'd')!;
    const volta = decision.next.find((n) => n.condition === 'Reprovado')!;
    expect(volta.isLoopBack).toBe(true);
    expect(volta.number).toBe('2');
    expect(decision.next.find((n) => n.condition === 'Aprovado')!.isLoopBack).toBe(false);
  });

  it('inalcançável não é omitido: entra no fim, marcado', () => {
    const o = buildPopOutline(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('orfao', 'task')],
        [edge('s', 't'), edge('t', 'e')],
      ),
    );
    expect(o.steps).toHaveLength(4);
    const last = o.steps[3];
    expect(last.nodeId).toBe('orfao');
    expect(last.unreachable).toBe(true);
    expect(o.steps.slice(0, 3).every((s) => !s.unreachable)).toBe(true);
  });

  it('anotação sai da numeração e vira observação', () => {
    const o = buildPopOutline(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('n', 'note')],
        [edge('s', 't'), edge('t', 'e')],
      ),
    );
    expect(o.steps.map((s) => s.nodeId)).toEqual(['s', 't', 'e']);
    expect(o.notes).toEqual([{ nodeId: 'n', label: 'n' }]);
  });

  it('aresta de informação não numera o destino: registra como "informa"', () => {
    const o = buildPopOutline(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('doc', 'document')],
        [edge('s', 't'), edge('t', 'e'), edge('t', 'doc', undefined, 'information')],
      ),
    );
    const t = o.steps.find((s) => s.nodeId === 't')!;
    expect(t.informs).toEqual([{ label: 'doc' }]);
    // O documento não é próximo passo de 't' — não entra em `next`.
    expect(t.next.map((n) => n.label)).toEqual(['e']);
  });

  it('carrega responsável, duração e raia pra dentro do passo', () => {
    const o = buildPopOutline(
      graph(
        [
          lane('l1', 'Comercial'),
          node('s', 'start'),
          node('t', 'task', { responsibleLabel: 'Atendente', laneId: 'l1', description: 'Como fazer' }),
          node('w', 'delay', { duration: '48h' }),
          node('e', 'end'),
        ],
        [edge('s', 't'), edge('t', 'w'), edge('w', 'e')],
      ),
    );
    const t = o.steps.find((s) => s.nodeId === 't')!;
    expect(t.responsibleLabel).toBe('Atendente');
    expect(t.laneId).toBe('l1');
    expect(t.laneLabel).toBe('Comercial');
    expect(t.description).toBe('Como fazer');
    expect(o.steps.find((s) => s.nodeId === 'w')!.duration).toBe('48h');
    expect(o.lanes).toEqual([{ id: 'l1', label: 'Comercial' }]);
  });

  it('raia não ocupa número de passo', () => {
    const o = buildPopOutline(
      graph(
        [lane('l1', 'Campo'), node('s', 'start'), node('e', 'end')],
        [edge('s', 'e')],
      ),
    );
    expect(o.steps.map((s) => s.number)).toEqual(['1', '2']);
  });

  it('desenho sem Início ainda rende roteiro, começando por quem não recebe seta', () => {
    const o = buildPopOutline(
      graph([node('a', 'task'), node('b', 'task')], [edge('a', 'b')]),
    );
    expect(o.steps.map((s) => s.nodeId)).toEqual(['a', 'b']);
  });

  it('grafo inteiro em ciclo não devolve lista vazia', () => {
    const o = buildPopOutline(
      graph([node('a', 'task'), node('b', 'task')], [edge('a', 'b'), edge('b', 'a')]),
    );
    expect(o.steps).toHaveLength(2);
    expect(o.steps[0].number).toBe('1');
  });
});
