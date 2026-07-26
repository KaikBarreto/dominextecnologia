import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

// Dimensões estimadas do nó (OrgChartNode). Dagre precisa de largura/altura pra
// espaçar a árvore sem sobreposição. Se o card mudar de tamanho, ajustar aqui.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;

/**
 * Auto-layout hierárquico (árvore de cima pra baixo) com dagre.
 * Recebe os nodes/edges atuais e devolve os MESMOS nodes com `position` nova.
 * Não muta os arrays de entrada.
 */
export function layoutOrgChart<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
): Node<T>[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB', // top-to-bottom = hierarquia
    nodesep: 48, // espaço horizontal entre nós irmãos
    ranksep: 72, // espaço vertical entre níveis
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    const w = node.measured?.width ?? node.width ?? NODE_WIDTH;
    const h = node.measured?.height ?? node.height ?? NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const w = node.measured?.width ?? node.width ?? NODE_WIDTH;
    const h = node.measured?.height ?? node.height ?? NODE_HEIGHT;
    // Dagre devolve o CENTRO do nó; React Flow ancora no canto superior esquerdo.
    return {
      ...node,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
    };
  });
}

/**
 * Reorganiza SÓ a ramificação (subárvore) que contém `seedId`, deixando o resto
 * do grafo intacto. Usado após a adição rápida por "+" — as linhas daquela
 * branch se ajeitam sozinhas sem mexer nas outras árvores do quadro.
 *
 * 1) Sobe de `seedId` pelas arestas (target→source) até a raiz da branch
 *    (nó sem superior). 2) Coleta os descendentes da raiz. 3) Roda dagre só
 *    nesse conjunto e reposiciona ancorando a raiz na posição atual dela (a
 *    branch não "salta" pra outro canto).
 */
export function layoutBranchFrom<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  seedId: string,
): Node<T>[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  if (!nodeById.has(seedId)) return nodes;

  // Sobe até a raiz (primeiro nó sem aresta de entrada), evitando loop.
  const parentOf = new Map<string, string>();
  for (const e of edges) parentOf.set(e.target, e.source);
  let rootId = seedId;
  const seen = new Set<string>([rootId]);
  while (parentOf.has(rootId)) {
    const parent = parentOf.get(rootId)!;
    if (seen.has(parent)) break; // ciclo defensivo
    rootId = parent;
    seen.add(parent);
  }

  // Coleta descendentes da raiz (BFS seguindo source→target).
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
  }
  const branchIds = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (!branchIds.has(child)) {
        branchIds.add(child);
        queue.push(child);
      }
    }
  }

  // Nada a fazer se a branch é só a raiz.
  if (branchIds.size <= 1) return nodes;

  const branchNodes = nodes.filter((n) => branchIds.has(n.id));
  const branchEdges = edges.filter((e) => branchIds.has(e.source) && branchIds.has(e.target));

  // Posição atual da raiz — usada como âncora pra manter a branch onde está.
  const rootBefore = nodeById.get(rootId)!.position;
  const laid = layoutOrgChart(branchNodes, branchEdges);
  const laidRoot = laid.find((n) => n.id === rootId);
  const dx = laidRoot ? rootBefore.x - laidRoot.position.x : 0;
  const dy = laidRoot ? rootBefore.y - laidRoot.position.y : 0;

  const laidById = new Map(laid.map((n) => [n.id, n]));
  return nodes.map((n) => {
    const l = laidById.get(n.id);
    if (!l) return n; // fora da branch: intacto
    return { ...n, position: { x: l.position.x + dx, y: l.position.y + dy } };
  });
}
