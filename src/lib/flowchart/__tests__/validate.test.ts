import { describe, it, expect } from 'vitest';
import { validateProcessGraph, type ProcessIssueCode } from '../validate';
import {
  PROCESS_LANE_TYPE,
  PROCESS_NODE_TYPE,
  type ProcessGraph,
  type ProcessNode,
} from '../types';
import type { ProcessShape } from '../shapes';

// ── Construtores enxutos ─────────────────────────────────────────────────────
function node(id: string, shape: ProcessShape, label = id): ProcessNode {
  return { id, type: PROCESS_NODE_TYPE, position: { x: 0, y: 0 }, data: { shape, label } };
}
function lane(id: string, label = id): ProcessNode {
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
/** Códigos encontrados, pra asserção legível. */
function codes(g: ProcessGraph): ProcessIssueCode[] {
  return validateProcessGraph(g).issues.map((i) => i.code);
}

// Fluxo mínimo válido: início → tarefa → fim.
const HAPPY = graph(
  [node('s', 'start'), node('t', 'task'), node('e', 'end')],
  [edge('s', 't'), edge('t', 'e')],
);

describe('validateProcessGraph', () => {
  it('não acusa nada num processo recém-criado (grafo vazio)', () => {
    const v = validateProcessGraph(graph([]));
    expect(v.issues).toEqual([]);
    expect(v.isPublishable).toBe(true);
  });

  it('não acusa nada no fluxograma recém-criado com só a caixa de Início semeada', () => {
    const v = validateProcessGraph(graph([node('s', 'start')]));
    expect(v.issues).toEqual([]);
    expect(v.isPublishable).toBe(true);
  });

  it('volta a acusar assim que a pessoa desenha a segunda caixa', () => {
    // Já não é mais folha em branco: sem Fim e com etapa solta, a conferência
    // tem que falar. É o que separa o "nasceu agora" do "está pela metade".
    expect(codes(graph([node('s', 'start'), node('t', 'task')]))).toContain('no-end');
  });

  it('aprova o fluxo mínimo início → tarefa → fim', () => {
    const v = validateProcessGraph(HAPPY);
    expect(v.issues).toEqual([]);
    expect(v.errorCount).toBe(0);
    expect(v.isPublishable).toBe(true);
  });

  it('exige início e fim', () => {
    expect(codes(graph([node('t', 'task')]))).toContain('no-start');
    expect(codes(graph([node('t', 'task')]))).toContain('no-end');
  });

  it('avisa (sem bloquear) quando há mais de um início', () => {
    const v = validateProcessGraph(
      graph(
        [node('s1', 'start'), node('s2', 'start'), node('t', 'task'), node('e', 'end')],
        [edge('s1', 't'), edge('s2', 't'), edge('t', 'e')],
      ),
    );
    expect(v.issues.filter((i) => i.code === 'multiple-starts')).toHaveLength(2);
    expect(v.isPublishable).toBe(true);
  });

  it('acusa beco sem saída na etapa que não conecta em nada à frente', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('x', 'task'), node('e', 'end')],
        [edge('s', 't'), edge('t', 'e'), edge('t', 'x')],
      ),
    );
    expect(v.issues).toEqual(
      expect.arrayContaining([{ code: 'dead-end', severity: 'error', nodeId: 'x' }]),
    );
  });

  it('não acusa beco sem saída no nó de fim', () => {
    expect(codes(HAPPY)).not.toContain('dead-end');
  });

  it('exige 2 caminhos rotulados na decisão', () => {
    const umCaminho = graph(
      [node('s', 'start'), node('d', 'decision'), node('e', 'end')],
      [edge('s', 'd'), edge('d', 'e')],
    );
    expect(codes(umCaminho)).toContain('decision-needs-two-branches');

    const semRotulo = graph(
      [node('s', 'start'), node('d', 'decision'), node('a', 'task'), node('e', 'end')],
      [edge('s', 'd'), edge('d', 'a'), edge('d', 'e'), edge('a', 'e')],
    );
    const v = validateProcessGraph(semRotulo);
    expect(v.issues.filter((i) => i.code === 'branch-without-label')).toHaveLength(2);
    expect(v.isPublishable).toBe(false);
  });

  it('aceita decisão com os dois caminhos rotulados', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('d', 'decision'), node('a', 'task'), node('e', 'end')],
        [edge('s', 'd'), edge('d', 'a', 'Sim'), edge('d', 'e', 'Não'), edge('a', 'e')],
      ),
    );
    expect(v.issues).toEqual([]);
  });

  it('acusa nó solto como aviso, sem empilhar beco sem saída em cima', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('solto', 'task')],
        [edge('s', 't'), edge('t', 'e')],
      ),
    );
    expect(v.issues).toEqual(
      expect.arrayContaining([{ code: 'isolated-node', severity: 'warning', nodeId: 'solto' }]),
    );
    expect(v.issues.filter((i) => i.nodeId === 'solto')).toHaveLength(1);
    expect(v.isPublishable).toBe(true);
  });

  it('acusa trecho inalcançável a partir do início', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('a', 'task'), node('b', 'task')],
        [edge('s', 't'), edge('t', 'e'), edge('a', 'b'), edge('b', 'e')],
      ),
    );
    const unreachable = v.issues.filter((i) => i.code === 'unreachable').map((i) => i.nodeId);
    expect(unreachable).toEqual(expect.arrayContaining(['a', 'b']));
    expect(unreachable).not.toContain('t');
  });

  it('pega o loop infinito que o beco sem saída não pega', () => {
    // s → a ⇄ b, e o fim nunca é alcançado a partir do loop. Todo nó tem saída,
    // então nenhum é "beco sem saída" — só a volta a partir do fim revela.
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('a', 'task'), node('b', 'task'), node('e', 'end')],
        [edge('s', 'a'), edge('a', 'b'), edge('b', 'a')],
      ),
    );
    const noPath = v.issues.filter((i) => i.code === 'no-path-to-end').map((i) => i.nodeId);
    expect(noPath).toEqual(expect.arrayContaining(['s', 'a', 'b']));
    expect(v.issues.filter((i) => i.code === 'dead-end')).toHaveLength(0);
  });

  it('aceita loop de retrabalho que ainda consegue terminar', () => {
    // Reprovou → volta pra tarefa; aprovou → fim. Loop legítimo, zero problema.
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('d', 'decision'), node('e', 'end')],
        [edge('s', 't'), edge('t', 'd'), edge('d', 'e', 'Aprovado'), edge('d', 't', 'Reprovado')],
      ),
    );
    expect(v.issues).toEqual([]);
  });

  it('aresta de INFORMAÇÃO não conduz o fluxo nem salva de beco sem saída', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('doc', 'document')],
        [edge('s', 't'), edge('t', 'e'), edge('t', 'doc', undefined, 'information')],
      ),
    );
    expect(v.issues).toEqual(
      expect.arrayContaining([{ code: 'isolated-node', severity: 'warning', nodeId: 'doc' }]),
    );
  });

  it('anotação não entra no fluxo: não é beco sem saída nem inalcançável', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end'), node('n', 'note')],
        [edge('s', 't'), edge('t', 'e')],
      ),
    );
    expect(v.issues).toEqual([]);
  });

  it('raia não é etapa: não gera problema nenhum', () => {
    const v = validateProcessGraph(
      graph(
        [lane('l1', 'Comercial'), node('s', 'start'), node('t', 'task'), node('e', 'end')],
        [edge('s', 't'), edge('t', 'e')],
      ),
    );
    expect(v.issues).toEqual([]);
  });

  it('avisa sobre etapa sem texto', () => {
    const g = graph(
      [node('s', 'start'), { ...node('t', 'task'), data: { shape: 'task', label: '  ' } }, node('e', 'end')],
      [edge('s', 't'), edge('t', 'e')],
    );
    const v = validateProcessGraph(g);
    expect(v.issues).toEqual(
      expect.arrayContaining([{ code: 'empty-label', severity: 'warning', nodeId: 't' }]),
    );
    expect(v.isPublishable).toBe(true);
  });

  it('avisa sobre conexão duplicada e sobre entrada no início / saída no fim', () => {
    const v = validateProcessGraph(
      graph(
        [node('s', 'start'), node('t', 'task'), node('e', 'end')],
        [
          edge('s', 't'),
          { ...edge('s', 't'), id: 's-t-2' },
          edge('t', 'e'),
          { ...edge('e', 's'), id: 'e-s' },
        ],
      ),
    );
    const found = v.issues.map((i) => i.code);
    expect(found).toContain('duplicate-connection');
    expect(found).toContain('end-with-outgoing');
    expect(found).toContain('start-with-incoming');
  });

  it('conta erro e aviso separados e só bloqueia publicação por erro', () => {
    const v = validateProcessGraph(graph([node('t', 'task')]));
    expect(v.errorCount).toBeGreaterThan(0);
    expect(v.isPublishable).toBe(false);
    expect(v.errorCount + v.warningCount).toBe(v.issues.length);
  });
});
