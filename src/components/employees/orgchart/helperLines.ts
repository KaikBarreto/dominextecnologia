/**
 * Helper Lines — guias de alinhamento + snap para o canvas do Organograma.
 *
 * Implementa o padrão oficial do React Flow "Helper Lines":
 *   https://reactflow.dev/examples/interaction/helper-lines
 *
 * Uso:
 *   1. Importe `getHelperLines` e chame dentro do `handleNodesChange` quando
 *      houver exatamente 1 change do tipo `position` com `dragging === true`.
 *   2. Aplique o `snapPosition` retornado sobrescrevendo `change.position`.
 *   3. Guarde `horizontal` e `vertical` em estado e passe para `<HelperLines>`.
 *   4. Limpe o estado ao soltar (dragging === false ou changes sem `position`).
 */

import type { Node, NodeChange, XYPosition } from '@xyflow/react';

// Limiar em coordenadas de flow (pixels de zoom 1:1) para ativar o snap.
export const HELPER_LINE_THRESHOLD = 6;

// Cor das guias — teal da marca (#00C597) contrasta bem nos dois temas (claro/escuro).
export const HELPER_LINE_COLOR = '#00C597';

export interface HelperLinesResult {
  /** Coordenada Y em flow-space onde traçar a linha guia HORIZONTAL (se houver). */
  horizontal?: number;
  /** Coordenada X em flow-space onde traçar a linha guia VERTICAL (se houver). */
  vertical?: number;
  /** Posição "snapada" a aplicar sobre o nó arrastado. */
  snapPosition: Partial<XYPosition>;
}

/** Dimensões de um nó (com fallback para os defaults do canvas do Dominex). */
function nodeRect(node: Node): { x: number; y: number; width: number; height: number } {
  const w = node.measured?.width ?? (node as { width?: number }).width ?? 220;
  const h = node.measured?.height ?? (node as { height?: number }).height ?? 92;
  return { x: node.position.x, y: node.position.y, width: w, height: h };
}

/**
 * Compara o retângulo do nó sendo arrastado com os retângulos de todos os
 * outros nós e encontra (por eixo) o alinhamento mais próximo dentro do limiar.
 *
 * @param change  - O NodeChange do tipo `position` do nó arrastado.
 * @param nodes   - Lista completa de nós do canvas (inclui o nó arrastado).
 * @returns       - Resultado com coordenadas das guias e snap.
 */
export function getHelperLines(
  change: NodeChange & { type: 'position'; position?: XYPosition },
  nodes: Node[],
): HelperLinesResult {
  const result: HelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: {},
  };

  // Nó sendo arrastado — precisamos das suas dimensões medidas.
  const draggingNode = nodes.find((n) => n.id === (change as { id: string }).id);
  if (!draggingNode || !change.position) return result;

  // Posição candidata (onde o cursor soltou o nó).
  const cx = change.position.x;
  const cy = change.position.y;

  // Dimensões do nó arrastado.
  const w =
    draggingNode.measured?.width ?? (draggingNode as { width?: number }).width ?? 220;
  const h =
    draggingNode.measured?.height ?? (draggingNode as { height?: number }).height ?? 92;

  // Pontos-chave do retângulo candidato (em coordenadas de flow).
  const cLeft = cx;
  const cRight = cx + w;
  const cCenterX = cx + w / 2;
  const cTop = cy;
  const cBottom = cy + h;
  const cCenterY = cy + h / 2;

  // Rastreia o alinhamento mais próximo por eixo.
  let closestVerticalDist = HELPER_LINE_THRESHOLD;
  let closestHorizontalDist = HELPER_LINE_THRESHOLD;

  for (const node of nodes) {
    // Não compara consigo mesmo.
    if (node.id === (change as { id: string }).id) continue;

    const r = nodeRect(node);
    const nLeft = r.x;
    const nRight = r.x + r.width;
    const nCenterX = r.x + r.width / 2;
    const nTop = r.y;
    const nBottom = r.y + r.height;
    const nCenterY = r.y + r.height / 2;

    // ── Alinhamentos VERTICAIS (linha guia vertical, coordenada X) ─────────

    // left ↔ left
    const distLL = Math.abs(cLeft - nLeft);
    if (distLL < closestVerticalDist) {
      closestVerticalDist = distLL;
      result.snapPosition.x = nLeft;
      result.vertical = nLeft;
    }

    // right ↔ right
    const distRR = Math.abs(cRight - nRight);
    if (distRR < closestVerticalDist) {
      closestVerticalDist = distRR;
      result.snapPosition.x = nRight - w;
      result.vertical = nRight;
    }

    // centerX ↔ centerX
    const distCX = Math.abs(cCenterX - nCenterX);
    if (distCX < closestVerticalDist) {
      closestVerticalDist = distCX;
      result.snapPosition.x = nCenterX - w / 2;
      result.vertical = nCenterX;
    }

    // left ↔ right (borda esquerda do arrastado alinha com borda direita do outro)
    const distLR = Math.abs(cLeft - nRight);
    if (distLR < closestVerticalDist) {
      closestVerticalDist = distLR;
      result.snapPosition.x = nRight;
      result.vertical = nRight;
    }

    // right ↔ left (borda direita do arrastado alinha com borda esquerda do outro)
    const distRL = Math.abs(cRight - nLeft);
    if (distRL < closestVerticalDist) {
      closestVerticalDist = distRL;
      result.snapPosition.x = nLeft - w;
      result.vertical = nLeft;
    }

    // ── Alinhamentos HORIZONTAIS (linha guia horizontal, coordenada Y) ─────

    // top ↔ top
    const distTT = Math.abs(cTop - nTop);
    if (distTT < closestHorizontalDist) {
      closestHorizontalDist = distTT;
      result.snapPosition.y = nTop;
      result.horizontal = nTop;
    }

    // bottom ↔ bottom
    const distBB = Math.abs(cBottom - nBottom);
    if (distBB < closestHorizontalDist) {
      closestHorizontalDist = distBB;
      result.snapPosition.y = nBottom - h;
      result.horizontal = nBottom;
    }

    // centerY ↔ centerY
    const distCY = Math.abs(cCenterY - nCenterY);
    if (distCY < closestHorizontalDist) {
      closestHorizontalDist = distCY;
      result.snapPosition.y = nCenterY - h / 2;
      result.horizontal = nCenterY;
    }

    // top ↔ bottom (topo do arrastado alinha com base do outro)
    const distTB = Math.abs(cTop - nBottom);
    if (distTB < closestHorizontalDist) {
      closestHorizontalDist = distTB;
      result.snapPosition.y = nBottom;
      result.horizontal = nBottom;
    }

    // bottom ↔ top (base do arrastado alinha com topo do outro)
    const distBT = Math.abs(cBottom - nTop);
    if (distBT < closestHorizontalDist) {
      closestHorizontalDist = distBT;
      result.snapPosition.y = nTop - h;
      result.horizontal = nTop;
    }
  }

  return result;
}
