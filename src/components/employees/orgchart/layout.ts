import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

// Dimensões estimadas do nó (OrgChartNode). Dagre precisa de largura/altura pra
// espaçar a árvore sem sobreposição. Se o card mudar de tamanho, ajustar aqui.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;

// Ids dos handles usados no layout top-down (TB). Precisam bater EXATAMENTE com
// os ids definidos no OrgChartNode (`${dir}-source` / `${dir}-target`). No
// "Organizar" a árvore desce reta: a aresta sai do handle de BAIXO do pai
// (source) e entra no handle de CIMA do filho (target).
const TB_SOURCE_HANDLE = 'bottom-source';
const TB_TARGET_HANDLE = 'top-target';

// Detecta se a aresta foi criada por um handle lateral (left/right).
// Ligações laterais significam "mesmo nível" (peers), não hierarquia pai→filho.
// Ligações verticais (top/bottom) continuam sendo tratadas como hierarquia.
const LATERAL_HANDLE = /^(left|right)-/;
function isLateralEdge(e: Edge): boolean {
  return LATERAL_HANDLE.test(e.sourceHandle ?? '') || LATERAL_HANDLE.test(e.targetHandle ?? '');
}

/**
 * Normaliza os handles das arestas VERTICAIS pro layout top-down (TB): cada
 * aresta sai do handle de baixo do pai e entra no handle de cima do filho.
 * Arestas LATERAIS (left/right) preservam seus handles originais — a linha
 * continua saindo e entrando pela lateral que o usuário escolheu.
 * Não muta o array de entrada; sourceHandle/targetHandle já serializam no save.
 */
export function normalizeEdgeHandlesTB(edges: Edge[]): Edge[] {
  return edges.map((e) =>
    // Aresta lateral preserva os handles; vertical recebe os handles TB padrão.
    isLateralEdge(e)
      ? e
      : {
          ...e,
          sourceHandle: TB_SOURCE_HANDLE,
          targetHandle: TB_TARGET_HANDLE,
        },
  );
}

/**
 * Auto-layout hierárquico (árvore de cima pra baixo) com dagre.
 * Recebe os nodes/edges atuais e devolve os MESMOS nodes com `position` nova.
 * Não muta os arrays de entrada.
 *
 * Arestas LATERAIS (left/right) NÃO entram no ranqueamento do dagre: assim o
 * nó conectado lateralmente vira uma raiz própria e cai no mesmo nível (rank 0)
 * do nó de origem, em vez de ser empurrado um nível abaixo como filho.
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

  // Nós soltos (sem nenhuma aresta) NÃO entram no dagre: o "Organizar" arruma
  // só o que está ligado por linhas; caixas soltas ficam onde o usuário deixou.
  // O `if (!pos) return node` lá embaixo já cuida de devolvê-los inalterados.
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }

  for (const node of nodes) {
    if (!connectedIds.has(node.id)) continue; // solto → fica parado
    const w = node.measured?.width ?? node.width ?? NODE_WIDTH;
    const h = node.measured?.height ?? node.height ?? NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    // Arestas laterais não entram no rank do dagre: peers ficam no mesmo nível.
    if (isLateralEdge(edge)) continue;
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
 *
 * Arestas LATERAIS são ignoradas ao montar parentOf/childrenOf: um peer não é
 * pai nem filho, não deve guiar a subida até a raiz nem a coleta de descendentes.
 */
export function layoutBranchFrom<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  seedId: string,
): Node<T>[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  if (!nodeById.has(seedId)) return nodes;

  // Sobe até a raiz (primeiro nó sem aresta de entrada), evitando loop.
  // Arestas laterais são puladas: peer não é pai.
  const parentOf = new Map<string, string>();
  for (const e of edges) {
    if (isLateralEdge(e)) continue; // peer não é pai
    parentOf.set(e.target, e.source);
  }
  let rootId = seedId;
  const seen = new Set<string>([rootId]);
  while (parentOf.has(rootId)) {
    const parent = parentOf.get(rootId)!;
    if (seen.has(parent)) break; // ciclo defensivo
    rootId = parent;
    seen.add(parent);
  }

  // Coleta descendentes da raiz (BFS seguindo source→target).
  // Arestas laterais são puladas: peer não é filho.
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (isLateralEdge(e)) continue; // peer não é filho
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
