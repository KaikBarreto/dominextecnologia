// ─────────────────────────────────────────────────────────────────────────────
// validate — conferência do DESENHO do processo.
//
// Por que isto existe: fluxograma errado é pior que fluxograma nenhum. Um
// técnico que segue um desenho com beco sem saída para no meio do trabalho, e
// um desenho sem início não vira POP nenhum. A conferência é o que separa
// "ferramenta de desenho" de "ferramenta de processo".
//
// Módulo PURO: só grafo entra, só código de problema sai. A copy de cada
// problema vive no i18n (`app.employees.processes.issues.<code>`), nos 4
// idiomas — este arquivo não tem texto pro usuário.
//
// IMPORTANTE: só a aresta de SEQUÊNCIA conduz o fluxo. Aresta de INFORMAÇÃO
// (tracejada) documenta um aviso/entrega de dado e NÃO conta pra
// alcançabilidade, nem salva um nó de ser beco sem saída.
// ─────────────────────────────────────────────────────────────────────────────

import { getShapeSpec } from './shapes';
import { isLaneNode, stepNodes, type ProcessGraph, type ProcessNodeData } from './types';

export const PROCESS_ISSUE_CODES = [
  'no-start',
  'multiple-starts',
  'no-end',
  'unreachable',
  'no-path-to-end',
  'dead-end',
  'decision-needs-two-branches',
  'branch-without-label',
  'start-with-incoming',
  'end-with-outgoing',
  'isolated-node',
  'duplicate-connection',
  'empty-label',
] as const;

export type ProcessIssueCode = (typeof PROCESS_ISSUE_CODES)[number];

export type ProcessIssueSeverity = 'error' | 'warning';

export interface ProcessIssue {
  code: ProcessIssueCode;
  severity: ProcessIssueSeverity;
  /** Nó a que o problema se refere (pra selecionar/centralizar no canvas). */
  nodeId?: string;
  /** Aresta a que o problema se refere. */
  edgeId?: string;
}

export interface ProcessValidation {
  issues: ProcessIssue[];
  errorCount: number;
  warningCount: number;
  /** Sem erro = pode publicar. Aviso não bloqueia. */
  isPublishable: boolean;
}

const SEVERITY: Record<ProcessIssueCode, ProcessIssueSeverity> = {
  'no-start': 'error',
  'multiple-starts': 'warning',
  'no-end': 'error',
  unreachable: 'error',
  'no-path-to-end': 'error',
  'dead-end': 'error',
  'decision-needs-two-branches': 'error',
  'branch-without-label': 'error',
  'start-with-incoming': 'warning',
  'end-with-outgoing': 'warning',
  'isolated-node': 'warning',
  'duplicate-connection': 'warning',
  'empty-label': 'warning',
};

/**
 * Confere o grafo e devolve os problemas encontrados.
 *
 * Grafo VAZIO devolve zero problemas de propósito: processo que o usuário
 * acabou de criar não deve nascer coberto de alerta vermelho.
 */
export function validateProcessGraph(graph: ProcessGraph): ProcessValidation {
  const issues: ProcessIssue[] = [];
  const push = (code: ProcessIssueCode, ref?: { nodeId?: string; edgeId?: string }) =>
    issues.push({ code, severity: SEVERITY[code], ...ref });

  const steps = stepNodes(graph.nodes);
  if (steps.length === 0) return summarize(issues);

  // Ids válidos de etapa; descarta raia e aresta pendurada em nó inexistente.
  const stepIds = new Set(steps.map((n) => n.id));
  const laneIds = new Set(graph.nodes.filter(isLaneNode).map((n) => n.id));

  const sequence = graph.edges.filter(
    (e) =>
      (e.data?.kind ?? 'sequence') === 'sequence' &&
      stepIds.has(e.source) &&
      stepIds.has(e.target) &&
      !laneIds.has(e.source) &&
      !laneIds.has(e.target),
  );

  const outgoing = new Map<string, typeof sequence>();
  const incoming = new Map<string, typeof sequence>();
  for (const e of sequence) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    outgoing.get(e.source)!.push(e);
    incoming.get(e.target)!.push(e);
  }

  const outOf = (id: string) => outgoing.get(id) ?? [];
  const inOf = (id: string) => incoming.get(id) ?? [];

  // Etapas que participam do fluxo (anotação não participa).
  const flowing = steps.filter((n) => !getShapeSpec((n.data as ProcessNodeData).shape).decorative);
  const starts = flowing.filter((n) => (n.data as ProcessNodeData).shape === 'start');
  const ends = flowing.filter((n) => (n.data as ProcessNodeData).shape === 'end');

  // ── Esqueleto: início e fim ────────────────────────────────────────────────
  if (starts.length === 0) push('no-start');
  if (starts.length > 1) starts.forEach((n) => push('multiple-starts', { nodeId: n.id }));
  if (ends.length === 0) push('no-end');

  // ── Por nó ────────────────────────────────────────────────────────────────
  for (const node of flowing) {
    const data = node.data as ProcessNodeData;
    const spec = getShapeSpec(data.shape);
    const outs = outOf(node.id);
    const ins = inOf(node.id);

    if (!data.label || !data.label.trim()) push('empty-label', { nodeId: node.id });

    if (ins.length === 0 && outs.length === 0) {
      // Nó solto: avisa uma vez e não acumula dead-end/unreachable em cima.
      push('isolated-node', { nodeId: node.id });
      continue;
    }

    if (!spec.acceptsIncoming && ins.length > 0 && data.shape === 'start') {
      push('start-with-incoming', { nodeId: node.id });
    }
    if (!spec.acceptsOutgoing && outs.length > 0 && data.shape === 'end') {
      push('end-with-outgoing', { nodeId: node.id });
    }
    // Beco sem saída: etapa que admite saída e não tem nenhuma.
    if (spec.acceptsOutgoing && outs.length === 0) {
      push('dead-end', { nodeId: node.id });
    }

    // Decisão precisa de 2+ caminhos, e cada caminho precisa dizer QUAL condição.
    if (spec.requiresLabeledBranches) {
      if (outs.length < 2) push('decision-needs-two-branches', { nodeId: node.id });
      for (const e of outs) {
        if (!e.label || !e.label.trim()) {
          push('branch-without-label', { nodeId: node.id, edgeId: e.id });
        }
      }
    }
  }

  // ── Arestas duplicadas (mesmo par origem→destino) ─────────────────────────
  const seenPairs = new Set<string>();
  for (const e of sequence) {
    const key = `${e.source}→${e.target}`;
    if (seenPairs.has(key)) push('duplicate-connection', { edgeId: e.id });
    else seenPairs.add(key);
  }

  // ── Alcançabilidade a partir dos inícios ──────────────────────────────────
  // Sem nenhum início não há de onde partir: a falta de início já foi apontada,
  // então não enchemos a lista de "inalcançável" pra todo mundo.
  if (starts.length > 0) {
    const reachable = traverse(
      starts.map((n) => n.id),
      (id) => outOf(id).map((e) => e.target),
    );
    for (const node of flowing) {
      if (!reachable.has(node.id) && (inOf(node.id).length > 0 || outOf(node.id).length > 0)) {
        push('unreachable', { nodeId: node.id });
      }
    }

    // ── Todo caminho tem que poder TERMINAR ─────────────────────────────────
    // Caminhando ao contrário a partir dos fins, qualquer nó alcançável que não
    // apareça está preso num trecho que nunca fecha (loop infinito, ou cadeia
    // que morre num beco). Pega o que o dead-end não pega: nó COM saída cuja
    // saída volta pra trás pra sempre.
    if (ends.length > 0) {
      const canEnd = traverse(
        ends.map((n) => n.id),
        (id) => inOf(id).map((e) => e.source),
      );
      for (const node of flowing) {
        if (reachable.has(node.id) && !canEnd.has(node.id) && outOf(node.id).length > 0) {
          push('no-path-to-end', { nodeId: node.id });
        }
      }
    }
  }

  return summarize(issues);
}

/** Busca em largura sobre uma função de vizinhança. */
function traverse(seeds: string[], neighbors: (id: string) => string[]): Set<string> {
  const seen = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of neighbors(id)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function summarize(issues: ProcessIssue[]): ProcessValidation {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    isPublishable: errorCount === 0,
  };
}
