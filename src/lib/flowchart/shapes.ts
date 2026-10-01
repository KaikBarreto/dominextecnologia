// ─────────────────────────────────────────────────────────────────────────────
// shapes — catálogo das formas do fluxograma de processo.
//
// Subset CURADO do BPMN 2.0. A escolha é deliberada: o BPMN completo tem mais
// de cem elementos e o nosso público (dono de empresa de climatização) usa oito.
// Cada forma aqui carrega a REGRA de como ela participa do fluxo, e é dessa
// regra que a validação (`validate.ts`) e o auto-layout se alimentam — não há
// uma segunda cópia da regra na UI.
//
// Módulo PURO: sem React, sem ícone, sem copy. Rótulo traduzido vive no i18n
// (`app.employees.processes.shapes.<shape>`); ícone vive no componente.
// ─────────────────────────────────────────────────────────────────────────────

export const PROCESS_SHAPES = [
  'start',
  'task',
  'decision',
  'subprocess',
  'document',
  'delay',
  'end',
  'note',
] as const;

export type ProcessShape = (typeof PROCESS_SHAPES)[number];

/** Tipos de aresta. `information` é fluxo de informação — NÃO é sequência. */
export const PROCESS_EDGE_KINDS = ['sequence', 'information'] as const;
export type ProcessEdgeKind = (typeof PROCESS_EDGE_KINDS)[number];

export interface ProcessShapeSpec {
  shape: ProcessShape;
  /** Tamanho em coordenadas de flow — também o fallback do snap/helper lines. */
  size: { width: number; height: number };
  /** Aceita aresta de sequência CHEGANDO? */
  acceptsIncoming: boolean;
  /** Aceita aresta de sequência SAINDO? */
  acceptsOutgoing: boolean;
  /** Exige 2+ saídas, todas rotuladas (é o caso da decisão). */
  requiresLabeledBranches: boolean;
  /**
   * Fora do fluxo: existe só pra anotar. Não entra em alcançabilidade, nem em
   * beco sem saída, nem conta como etapa no POP.
   */
  decorative: boolean;
}

export const PROCESS_SHAPE_SPECS: Record<ProcessShape, ProcessShapeSpec> = {
  start: {
    shape: 'start',
    // Dimensionadas pela LEITURA, não pelo desenho: título em negrito 15px
    // precisa de 240 pra não cortar "Orçamento aprovado pelo cliente".
    size: { width: 240, height: 60 },
    acceptsIncoming: false,
    acceptsOutgoing: true,
    requiresLabeledBranches: false,
    decorative: false,
  },
  task: {
    shape: 'task',
    // 260×152: título em negrito ocupa 2 linhas nos rótulos reais, e com 124 a
    // segunda linha do "como fazer" era CORTADA NO MEIO — card com texto
    // cortado parece quebrado. 152 cabe título(2) + descrição(2) + responsável.
    size: { width: 260, height: 152 },
    acceptsIncoming: true,
    acceptsOutgoing: true,
    requiresLabeledBranches: false,
    decorative: false,
  },
  decision: {
    shape: 'decision',
    size: { width: 190, height: 190 },
    acceptsIncoming: true,
    acceptsOutgoing: true,
    requiresLabeledBranches: true,
    decorative: false,
  },
  subprocess: {
    shape: 'subprocess',
    size: { width: 260, height: 152 },
    acceptsIncoming: true,
    acceptsOutgoing: true,
    requiresLabeledBranches: false,
    decorative: false,
  },
  document: {
    shape: 'document',
    size: { width: 240, height: 112 },
    acceptsIncoming: true,
    acceptsOutgoing: true,
    requiresLabeledBranches: false,
    decorative: false,
  },
  delay: {
    shape: 'delay',
    size: { width: 210, height: 84 },
    acceptsIncoming: true,
    acceptsOutgoing: true,
    requiresLabeledBranches: false,
    decorative: false,
  },
  end: {
    shape: 'end',
    size: { width: 240, height: 60 },
    acceptsIncoming: true,
    acceptsOutgoing: false,
    requiresLabeledBranches: false,
    decorative: false,
  },
  note: {
    shape: 'note',
    size: { width: 240, height: 108 },
    acceptsIncoming: false,
    acceptsOutgoing: false,
    requiresLabeledBranches: false,
    decorative: true,
  },
};

/** Maior forma do catálogo — fallback de tamanho pro snap antes da 1ª medição. */
export const PROCESS_FALLBACK_NODE_SIZE = { width: 260, height: 190 };

export function getShapeSpec(shape: ProcessShape): ProcessShapeSpec {
  return PROCESS_SHAPE_SPECS[shape] ?? PROCESS_SHAPE_SPECS.task;
}

/** Formas que o usuário escolhe na paleta, na ordem em que aparecem. */
export const PALETTE_ORDER: ProcessShape[] = [
  'start',
  'task',
  'decision',
  'subprocess',
  'document',
  'delay',
  'end',
  'note',
];
