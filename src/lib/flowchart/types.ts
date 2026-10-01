// ─────────────────────────────────────────────────────────────────────────────
// types — contrato do grafo de processo gravado em `processes.data` (jsonb).
//
// Fonte ÚNICA do shape: o hook (`useProcesses`), o canvas, a validação e o PDF
// do POP todos importam daqui. Não redeclare nada disto em outro arquivo.
//
// Espelha a ideia de `OrgChartGraph` (organograma): guardamos só o essencial —
// id, type, position, data — sem os campos transitórios do React Flow
// (`selected`, `dragging`, `measured`).
// ─────────────────────────────────────────────────────────────────────────────

import type { ProcessShape, ProcessEdgeKind } from './shapes';

/** `type` do nó no React Flow. Discrimina etapa de raia. */
export const PROCESS_NODE_TYPE = 'process' as const;
export const PROCESS_LANE_TYPE = 'lane' as const;

export interface ProcessNodeData {
  // Index signature exigida pelo React Flow v12 (Node<T extends Record<string, unknown>>).
  [key: string]: unknown;
  shape: ProcessShape;
  /** Texto principal da etapa — é o que aparece no nó e no passo do POP. */
  label: string;
  /** Detalhe do "como fazer". Vai pro POP, não aparece no desenho. */
  description?: string;
  /** Executor, quando é funcionário do cadastro (resolvido no render por id). */
  responsibleEmployeeId?: string;
  /** Executor em texto livre (cargo, setor, terceiro) quando não é funcionário. */
  responsibleLabel?: string;
  /** Id do nó de raia a que esta etapa pertence (espelha o `parentId` do flow). */
  laneId?: string;
  /** Cor do nó. Herda da raia; preenchido só quando o usuário sobrescreve. */
  color?: string;
  /**
   * Chave do ícone escolhido pelo usuário (catálogo em `processIcons.ts`).
   * Guardamos a CHAVE, nunca o componente. Chave desconhecida cai no ícone
   * padrão da forma — desenho antigo nunca quebra ao evoluir o catálogo.
   */
  icon?: string;
  /** Só em `shape: 'delay'` — duração legível ("48h", "2 dias úteis"). */
  duration?: string;
  /** Só em `shape: 'subprocess'` — aponta pra outro processo da empresa. */
  linkedProcessId?: string;
}

export interface ProcessLaneData {
  [key: string]: unknown;
  /** Nome da raia: setor, cargo ou pessoa responsável pelo trecho. */
  label: string;
  /** Cor da faixa. As etapas de dentro herdam. */
  color?: string;
}

export interface ProcessNode {
  id: string;
  type?: typeof PROCESS_NODE_TYPE | typeof PROCESS_LANE_TYPE | string;
  position: { x: number; y: number };
  /** Presente nas etapas dentro de uma raia (contrato do React Flow). */
  parentId?: string;
  /** Raia: dimensão da faixa (o resize grava aqui). */
  width?: number;
  height?: number;
  data: ProcessNodeData | ProcessLaneData;
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** Rótulo da aresta. Obrigatório nas saídas de uma decisão ("Sim"/"Não"). */
  label?: string;
  data?: { kind?: ProcessEdgeKind };
}

export interface ProcessGraph {
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

/**
 * Cabeçalho do processo — gravado em `processes.meta` (jsonb). É o que torna o
 * desenho um documento: sem objetivo e sem dono, fluxograma é rabisco.
 */
export interface ProcessMeta {
  /** Pra que este processo existe. */
  objective?: string;
  /** Onde começa e onde termina (limites). */
  scope?: string;
  /** O que dispara o processo ("cliente liga", "contrato assinado"). */
  trigger?: string;
  /** Dono do processo — funcionário do cadastro. */
  ownerEmployeeId?: string;
  /** Dono em texto livre, quando não é funcionário cadastrado. */
  ownerLabel?: string;
  /** Entradas necessárias (SIPOC). */
  inputs?: string[];
  /** Saídas entregues (SIPOC). */
  outputs?: string[];
  /** Com que frequência roda ("por demanda", "mensal"). */
  frequency?: string;
  /** Área da empresa ("Comercial", "Campo", "Financeiro"). */
  area?: string;
  /** Indicadores de desempenho do processo. */
  indicators?: string[];
}

export const EMPTY_PROCESS_GRAPH: ProcessGraph = { nodes: [], edges: [] };

/** Type guard: o nó é uma RAIA (faixa de responsabilidade), não uma etapa. */
export function isLaneNode(node: ProcessNode): boolean {
  return node.type === PROCESS_LANE_TYPE;
}

/** Nós de ETAPA (tudo que não é raia), já com o `data` estreitado. */
export function stepNodes(nodes: ProcessNode[]): Array<ProcessNode & { data: ProcessNodeData }> {
  return nodes.filter(
    (n): n is ProcessNode & { data: ProcessNodeData } => !isLaneNode(n),
  );
}
