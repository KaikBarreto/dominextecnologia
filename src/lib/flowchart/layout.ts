// ─────────────────────────────────────────────────────────────────────────────
// layout — auto-layout do fluxograma de processo com dagre.
//
// Diferença fundamental em relação ao organograma (`orgchart/layout.ts`):
// processo lê da ESQUERDA pra DIREITA (`rankdir: 'LR'`), não de cima pra baixo.
//
// Raias (swimlanes) NÃO entram no dagre como nó: cada raia é um container cujo
// INTERIOR (os filhos, via `parentId`) recebe o seu próprio dagre LR, isolado
// das outras raias. As raias em si ficam empilhadas verticalmente, na ordem em
// que aparecem no array de nós. Etapas sem raia (`parentId` ausente) formam um
// grupo próprio, posicionado abaixo da última raia.
//
// Anotação (`shape: 'note'`) nunca entra no dagre — preserva a posição que o
// usuário deixou, dentro ou fora de uma raia.
// ─────────────────────────────────────────────────────────────────────────────

import dagre from 'dagre';
import { getShapeSpec } from './shapes';
import { isLaneNode, type ProcessEdge, type ProcessNode, type ProcessNodeData } from './types';

// Espaçamento do dagre em coordenadas de flow.
const NODE_SEP = 48; // entre nós na mesma coluna (perpendicular ao fluxo)
const RANK_SEP = 90; // entre colunas (direção do fluxo, esquerda→direita)
const DAGRE_MARGIN = 24;

// Espaçamento entre raias empilhadas, e padding interno de cada raia.
const LANE_GAP = 32;
const LANE_PAD_X = 32;
const LANE_PAD_Y = 48; // reserva espaço pro cabeçalho da raia no topo
const LANE_MIN_WIDTH = 480;
const LANE_MIN_HEIGHT = 160;

// Espaço entre o bloco de raias e o bloco de etapas sem raia (se houver).
const ORPHAN_GROUP_GAP = 64;

function isDecorativeNote(node: ProcessNode): boolean {
  return !isLaneNode(node) && (node.data as ProcessNodeData).shape === 'note';
}

/** Só a sequência conduz o fluxo — a aresta de informação não deve mandar no rank. */
function sequenceEdgesOnly(edges: ProcessEdge[]): ProcessEdge[] {
  return edges.filter((e) => (e.data?.kind ?? 'sequence') === 'sequence');
}

/**
 * Roda o dagre (LR) sobre um conjunto ISOLADO de nós + arestas e devolve a
 * posição (canto superior esquerdo, não o centro que o dagre usa) de cada um.
 */
function layoutGroupLR(
  nodes: ProcessNode[],
  edges: ProcessEdge[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: DAGRE_MARGIN,
    marginy: DAGRE_MARGIN,
  });

  const sizeOf = (n: ProcessNode) => getShapeSpec((n.data as ProcessNodeData).shape).size;

  for (const n of nodes) {
    const { width, height } = sizeOf(n);
    g.setNode(n.id, { width, height });
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  for (const n of nodes) {
    const pos = g.node(n.id);
    if (!pos) continue;
    const { width, height } = sizeOf(n);
    // Dagre devolve o CENTRO; React Flow ancora no canto superior esquerdo.
    result.set(n.id, { x: pos.x - width / 2, y: pos.y - height / 2 });
  }
  return result;
}

/** Bounding box (canto superior esquerdo + tamanho) de um grupo já posicionado. */
function groupBounds(
  nodes: ProcessNode[],
  positions: Map<string, { x: number; y: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    const { width, height } = getShapeSpec((n.data as ProcessNodeData).shape).size;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + width);
    maxY = Math.max(maxY, p.y + height);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Auto-layout do fluxograma inteiro.
 *
 * - Nós de RAIA não entram no dagre; são empilhados verticalmente na ordem em
 *   que aparecem no array de entrada. O dagre roda uma vez PRA CADA raia, só
 *   com os filhos dela (`parentId === lane.id`), e o resultado é normalizado
 *   para coordenadas RELATIVAS à raia (contrato do React Flow p/ `parentId`).
 * - Etapas SEM raia (sem `parentId`) formam um grupo próprio, com seu próprio
 *   dagre, posicionado abaixo do bloco de raias (ou sozinho, se não há raias).
 * - Anotação (`shape: 'note'`) nunca entra no dagre — preserva a posição atual.
 * - A largura/altura de uma raia só CRESCE para caber o conteúdo (nunca
 *   encolhe um resize manual que já esteja maior).
 */
export function autoLayoutProcess(nodes: ProcessNode[], edges: ProcessEdge[]): ProcessNode[] {
  if (nodes.length === 0) return nodes;

  const seqEdges = sequenceEdgesOnly(edges);
  const lanes = nodes.filter(isLaneNode);

  const positions = new Map<string, { x: number; y: number }>();
  const laneSizes = new Map<string, { width: number; height: number }>();

  let yCursor = 0;

  for (const lane of lanes) {
    const children = nodes.filter(
      (n) => n.parentId === lane.id && !isDecorativeNote(n),
    );
    const childIds = new Set(children.map((c) => c.id));
    const innerEdges = seqEdges.filter((e) => childIds.has(e.source) && childIds.has(e.target));

    const rawPositions = layoutGroupLR(children, innerEdges);
    const bounds = groupBounds(children, rawPositions);

    // Normaliza para que o conteúdo comece no canto (LANE_PAD_X, LANE_PAD_Y)
    // relativo à raia — é exatamente o que `parentId` exige (posição RELATIVA).
    const offsetX = bounds ? LANE_PAD_X - bounds.minX : LANE_PAD_X;
    const offsetY = bounds ? LANE_PAD_Y - bounds.minY : LANE_PAD_Y;
    for (const c of children) {
      const p = rawPositions.get(c.id);
      if (!p) continue;
      positions.set(c.id, { x: p.x + offsetX, y: p.y + offsetY });
    }

    const contentWidth = bounds ? bounds.maxX - bounds.minX : 0;
    const contentHeight = bounds ? bounds.maxY - bounds.minY : 0;
    // AJUSTA ao conteúdo — não usa `lane.width/height` como piso.
    //
    // Antes isto era `Math.max(lane.width ?? 0, …)`, ou seja, só crescia: uma
    // raia que ficasse larga demais continuava larga pra sempre, e o "Organizar"
    // não tinha como consertar. O efeito aparecia na EXPORTAÇÃO — a faixa vazia
    // entra no enquadramento, sobra branco à direita e o texto do desenho
    // inteiro fica pequeno. Organizar é justamente a ação que deve reenquadrar.
    const width = Math.max(contentWidth + LANE_PAD_X * 2, LANE_MIN_WIDTH);
    const height = Math.max(contentHeight + LANE_PAD_Y * 1.5, LANE_MIN_HEIGHT);
    laneSizes.set(lane.id, { width, height });

    positions.set(lane.id, { x: 0, y: yCursor });
    yCursor += height + LANE_GAP;
  }

  // Todas as raias saem com a MESMA largura (a da mais larga). Borda direita
  // irregular faz o desenho parecer quebrado — raia é faixa, não cartão.
  if (laneSizes.size > 0) {
    const widest = Math.max(...Array.from(laneSizes.values(), (s) => s.width));
    for (const [id, size] of laneSizes) laneSizes.set(id, { ...size, width: widest });
  }

  // Etapas de nível superior (sem raia), excluindo anotações.
  const orphanSteps = nodes.filter(
    (n) => !isLaneNode(n) && !n.parentId && !isDecorativeNote(n),
  );
  if (orphanSteps.length > 0) {
    const orphanIds = new Set(orphanSteps.map((n) => n.id));
    const orphanEdges = seqEdges.filter((e) => orphanIds.has(e.source) && orphanIds.has(e.target));
    const rawPositions = layoutGroupLR(orphanSteps, orphanEdges);
    const bounds = groupBounds(orphanSteps, rawPositions);
    const topOffset = lanes.length > 0 ? yCursor + ORPHAN_GROUP_GAP : 0;
    const offsetX = bounds ? -bounds.minX : 0;
    const offsetY = bounds ? topOffset - bounds.minY : topOffset;
    for (const n of orphanSteps) {
      const p = rawPositions.get(n.id);
      if (!p) continue;
      positions.set(n.id, { x: p.x + offsetX, y: p.y + offsetY });
    }
  }

  return nodes.map((n) => {
    if (isLaneNode(n)) {
      const pos = positions.get(n.id);
      const size = laneSizes.get(n.id);
      if (!pos) return n;
      return {
        ...n,
        position: pos,
        width: size?.width ?? n.width,
        height: size?.height ?? n.height,
      };
    }
    if (isDecorativeNote(n)) return n; // preserva — anotação nunca entra no dagre
    const pos = positions.get(n.id);
    if (!pos) return n; // órfão sem posição calculada (não deveria ocorrer): preserva
    return { ...n, position: pos };
  });
}

/**
 * Garante que toda raia apareça no array ANTES dos seus filhos — convenção
 * recomendada do React Flow para `parentId` (o motor resolve por lookup
 * independente da ordem, mas manter a ordem evita qualquer efeito de borda no
 * primeiro frame de render de um nó recém-criado).
 */
export function sortLanesFirst(nodes: ProcessNode[]): ProcessNode[] {
  const lanes = nodes.filter(isLaneNode);
  const rest = nodes.filter((n) => !isLaneNode(n));
  return [...lanes, ...rest];
}
