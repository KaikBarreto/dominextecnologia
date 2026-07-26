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
