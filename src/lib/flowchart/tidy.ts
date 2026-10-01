// ─────────────────────────────────────────────────────────────────────────────
// tidy — "Formatar": arruma o desenho SEM jogar fora o arranjo do usuário.
//
// Diferença pro "Organizar" (`layout.ts`): aquele RECALCULA tudo pelo dagre e
// descarta onde a pessoa pôs cada caixa. Este aqui respeita o arranjo e corrige
// só o que deixa um fluxograma com cara de rascunho — que é o que programas
// bons de fluxograma chamam de *tidy up* / *auto-format*:
//
//   1. ALINHAMENTO — caixas quase na mesma linha passam a dividir exatamente a
//      mesma linha; quase na mesma coluna, a mesma coluna. É o que elimina o
//      desalinhamento de 3px que o olho percebe sem saber nomear.
//   2. GRADE — tudo encaixa numa grade, então o espaçamento vira múltiplo e não
//      um valor aleatório de arrasto.
//   3. PONTOS DE CONEXÃO — cada seta passa a sair e entrar pelo lado que a
//      geometria pede. É o que mata o desvio longo e o "duas setas saindo do
//      mesmo ponto", que faz dois caminhos parecerem um só.
//
// Módulo PURO: grafo entra, grafo sai. Sem React, sem DOM, sem copy.
// ─────────────────────────────────────────────────────────────────────────────

import { getShapeSpec } from './shapes';
import {
  isLaneNode,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type ProcessNodeData,
} from './types';

export interface TidyOptions {
  /** Passo da grade. Default 20. */
  grid?: number;
  /** Distância máxima pra considerar que duas caixas querem dividir a mesma linha/coluna. */
  tolerance?: number;
}

const DEFAULTS = { grid: 20, tolerance: 64 };

type Side = 'top' | 'right' | 'bottom' | 'left';

interface Box { id: string; x: number; y: number; w: number; h: number }

function boxOf(n: ProcessNode): Box {
  const size = getShapeSpec((n.data as ProcessNodeData).shape).size;
  return {
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    w: n.width ?? size.width,
    h: n.height ?? size.height,
  };
}

const snap = (v: number, grid: number) => Math.round(v / grid) * grid;

/**
 * Agrupa valores próximos e devolve, pra cada id, o valor REPRESENTATIVO do
 * grupo (a mediana). Mediana e não média: uma caixa muito fora não arrasta o
 * grupo inteiro junto com ela.
 */
function clusterAlign(
  entries: Array<{ id: string; value: number }>,
  tolerance: number,
): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  const out = new Map<string, number>();
  let group: typeof sorted = [];

  const flush = () => {
    if (!group.length) return;
    const values = group.map((g) => g.value).sort((a, b) => a - b);
    const mid = values.length % 2
      ? values[(values.length - 1) / 2]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
    for (const g of group) out.set(g.id, mid);
    group = [];
  };

  for (const item of sorted) {
    if (group.length && item.value - group[group.length - 1].value > tolerance) flush();
    group.push(item);
  }
  flush();
  return out;
}

/**
 * Lado por onde a seta deve sair/entrar, pela posição relativa das duas caixas.
 *
 * Regra: manda o eixo DOMINANTE. Se a distância horizontal entre as bordas é
 * maior que a vertical, a seta é horizontal; senão, vertical. É o que faz o
 * fluxo que anda pra direita sair pela direita, e o retrabalho que desce sair
 * por baixo — em vez do desvio em L que a ferramenta desenha quando o ponto de
 * saída está do lado errado.
 */
function sideFor(from: Box, to: Box): { source: Side; target: Side } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;

  // Folga entre bordas (negativa = as caixas se sobrepõem naquele eixo).
  const gapX = toCx > fromCx ? to.x - (from.x + from.w) : from.x - (to.x + to.w);
  const gapY = toCy > fromCy ? to.y - (from.y + from.h) : from.y - (to.y + to.h);

  if (gapX >= gapY) {
    return toCx >= fromCx
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' };
  }
  return toCy >= fromCy
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' };
}

/** Ordem de desempate quando duas setas disputam o mesmo lado. */
const FALLBACK: Record<Side, Side[]> = {
  right: ['bottom', 'top', 'left'],
  left: ['bottom', 'top', 'right'],
  bottom: ['right', 'left', 'top'],
  top: ['right', 'left', 'bottom'],
};

const OPPOSITE: Record<Side, Side> = {
  top: 'bottom', bottom: 'top', left: 'right', right: 'left',
};

/**
 * Arruma o grafo. Devolve SEMPRE um objeto novo — nunca muta o que entrou.
 */
export function tidyProcessGraph(graph: ProcessGraph, options: TidyOptions = {}): ProcessGraph {
  const grid = options.grid ?? DEFAULTS.grid;
  const tolerance = options.tolerance ?? DEFAULTS.tolerance;

  const steps = graph.nodes.filter((n) => !isLaneNode(n));
  if (steps.length === 0) return { nodes: [...graph.nodes], edges: [...graph.edges] };

  // ── 1+2. Alinhar e encaixar na grade, por GRUPO ───────────────────────────
  // Filhos de raias diferentes não se alinham entre si: as coordenadas são
  // relativas ao pai, então misturá-los alinharia coisas que não se veem juntas.
  const groups = new Map<string, ProcessNode[]>();
  for (const n of steps) {
    const key = n.parentId ?? '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  const placed = new Map<string, { x: number; y: number }>();
  for (const group of groups.values()) {
    const boxes = group.map(boxOf);
    // Linhas: alinha pelo CENTRO vertical (caixas de alturas diferentes numa
    // mesma linha ficam centradas entre si, que é como o olho espera ler).
    const rows = clusterAlign(boxes.map((b) => ({ id: b.id, value: b.y + b.h / 2 })), tolerance);
    // Colunas: alinha pela BORDA ESQUERDA (dá a "indentação" regular).
    const cols = clusterAlign(boxes.map((b) => ({ id: b.id, value: b.x })), tolerance);

    for (const b of boxes) {
      const cy = rows.get(b.id) ?? b.y + b.h / 2;
      const left = cols.get(b.id) ?? b.x;
      placed.set(b.id, { x: snap(left, grid), y: snap(cy - b.h / 2, grid) });
    }
  }

  const nodes = graph.nodes.map((n) => {
    const p = placed.get(n.id);
    return p ? { ...n, position: p } : { ...n };
  });

  // ── 3. Pontos de conexão ──────────────────────────────────────────────────
  const edges = normalizeEdgeHandles({ nodes, edges: graph.edges }).edges;

  return { nodes, edges };
}

/**
 * Reescolhe o lado de saída/entrada de CADA seta pela geometria final, sem
 * mover nenhuma caixa.
 *
 * É a metade do "formatar" que também interessa ao "organizar": o dagre
 * reposiciona tudo, mas as setas continuam saindo pelo ponto que estava lá
 * antes — e aí o desenho fica arrumado com as linhas ainda dando a volta.
 */
export function normalizeEdgeHandles(graph: ProcessGraph): ProcessGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Posição ABSOLUTA: filho de raia soma a posição do pai. Sem isso, duas
  // caixas em raias diferentes parecem lado a lado (ambas com y relativo baixo)
  // e a seta sai pelo lado errado.
  const absBox = (id: string): Box | null => {
    const n = byId.get(id);
    if (!n || isLaneNode(n)) return null;
    const b = boxOf(n);
    if (n.parentId) {
      const parent = byId.get(n.parentId);
      if (parent) { b.x += parent.position.x; b.y += parent.position.y; }
    }
    return b;
  };

  const usedBySource = new Map<string, Set<Side>>();
  const usedByTarget = new Map<string, Set<Side>>();
  const take = (map: Map<string, Set<Side>>, id: string, wanted: Side): Side => {
    if (!map.has(id)) map.set(id, new Set());
    const used = map.get(id)!;
    if (!used.has(wanted)) { used.add(wanted); return wanted; }
    for (const alt of FALLBACK[wanted]) {
      if (!used.has(alt)) { used.add(alt); return alt; }
    }
    return wanted; // 4+ ligações no mesmo nó: repetir é melhor que inventar
  };

  // As ligações CURTAS escolhem primeiro: são as que mais sofrem quando saem
  // pelo lado errado (a longa já dá a volta de qualquer jeito).
  const order = graph.edges
    .map((e, i) => {
      const a = absBox(e.source); const b = absBox(e.target);
      const d = a && b
        ? Math.hypot((a.x + a.w / 2) - (b.x + b.w / 2), (a.y + a.h / 2) - (b.y + b.h / 2))
        : Number.POSITIVE_INFINITY;
      return { i, d };
    })
    .sort((p, q) => p.d - q.d);

  const edges: ProcessEdge[] = graph.edges.map((e) => ({ ...e }));
  for (const { i } of order) {
    const e = edges[i];
    const from = absBox(e.source);
    const to = absBox(e.target);
    if (!from || !to) continue;
    const wanted = sideFor(from, to);
    const source = take(usedBySource, e.source, wanted.source);
    // Se o lado de saída teve que mudar, a entrada acompanha, pra a seta não
    // chegar "por trás" do destino.
    const target = take(
      usedByTarget,
      e.target,
      source === wanted.source ? wanted.target : OPPOSITE[source],
    );
    e.sourceHandle = `${source}-source`;
    e.targetHandle = `${target}-target`;
  }

  return { nodes: graph.nodes, edges };
}
