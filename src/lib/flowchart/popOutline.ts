// ─────────────────────────────────────────────────────────────────────────────
// popOutline — transforma o DESENHO num roteiro numerado de passos.
//
// É a ponte entre o fluxograma e o POP (Procedimento Operacional Padrão): o
// desenho é bom pra ver o todo, mas quem vai EXECUTAR precisa de uma lista
// numerada que se lê de cima pra baixo, com "se aprovado vá para o passo 7, se
// reprovado volte ao passo 4".
//
// ORDEM: busca em largura a partir dos inícios, seguindo só arestas de
// SEQUÊNCIA. É a mesma ordem de leitura que o auto-layout usa (esquerda pra
// direita), então o número do passo bate com a posição no desenho.
//
// Etapa inalcançável NÃO é omitida — vai pro fim da lista marcada com
// `unreachable`. Omitir seria esconder do usuário um trecho que ele desenhou.
//
// Módulo PURO: zero copy, zero React. Rótulo de seção vive no i18n.
// ─────────────────────────────────────────────────────────────────────────────

import { getShapeSpec, type ProcessShape } from './shapes';
import { isLaneNode, stepNodes, type ProcessGraph, type ProcessNodeData } from './types';

export interface PopNextStep {
  /** Condição que leva por este caminho (rótulo da aresta). Vazio = caminho único. */
  condition?: string;
  /** Número do passo de destino ('—' quando o destino ficou fora da lista). */
  number: string;
  label: string;
  /** true quando o destino tem número MENOR, ou seja, o fluxo volta atrás. */
  isLoopBack: boolean;
}

export interface PopStep {
  /** Numeração 1..N na ordem de leitura do fluxo. */
  number: string;
  nodeId: string;
  shape: ProcessShape;
  label: string;
  description?: string;
  responsibleEmployeeId?: string;
  responsibleLabel?: string;
  /** Só em `delay`. */
  duration?: string;
  /** Raia (faixa de responsabilidade) a que o passo pertence. */
  laneId?: string;
  laneLabel?: string;
  /** Caminhos de saída, na ordem das arestas. */
  next: PopNextStep[];
  /** Informações que este passo entrega (arestas de informação, tracejadas). */
  informs: Array<{ label: string }>;
  /** Etapa que o fluxo nunca alcança a partir do início. */
  unreachable: boolean;
}

export interface PopOutline {
  steps: PopStep[];
  /** Anotações do desenho — viram "Observações" no documento, fora da numeração. */
  notes: Array<{ nodeId: string; label: string }>;
  /** Raias na ordem em que aparecem, pra seção de responsabilidades. */
  lanes: Array<{ id: string; label: string }>;
}

export function buildPopOutline(graph: ProcessGraph): PopOutline {
  const lanes = graph.nodes.filter(isLaneNode).map((n) => ({
    id: n.id,
    label: String((n.data as { label?: unknown }).label ?? ''),
  }));
  const laneLabelById = new Map(lanes.map((l) => [l.id, l.label]));

  const all = stepNodes(graph.nodes);
  const notes: PopOutline['notes'] = [];
  const flowing: typeof all = [];
  for (const n of all) {
    if (getShapeSpec(n.data.shape).decorative) {
      notes.push({ nodeId: n.id, label: n.data.label ?? '' });
    } else {
      flowing.push(n);
    }
  }
  if (flowing.length === 0) return { steps: [], notes, lanes };

  const byId = new Map(flowing.map((n) => [n.id, n]));
  const sequence = graph.edges.filter(
    (e) => (e.data?.kind ?? 'sequence') === 'sequence' && byId.has(e.source) && byId.has(e.target),
  );
  const information = graph.edges.filter(
    (e) => e.data?.kind === 'information' && byId.has(e.source),
  );

  const outgoing = new Map<string, typeof sequence>();
  for (const e of sequence) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  // ── Ordem de leitura: largura a partir dos inícios ────────────────────────
  // Sem início declarado, usa como semente quem não recebe nenhuma seta — e se
  // nem isso existir (grafo todo em ciclo), o primeiro nó, pra nunca devolver
  // lista vazia num desenho que tem etapas.
  const hasIncoming = new Set(sequence.map((e) => e.target));
  let seeds = flowing.filter((n) => n.data.shape === 'start').map((n) => n.id);
  if (seeds.length === 0) seeds = flowing.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
  if (seeds.length === 0) seeds = [flowing[0].id];

  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [...seeds];
  for (const s of seeds) seen.add(s);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outgoing.get(id) ?? []) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }

  // Inalcançáveis entram no fim, na ordem em que estão no grafo.
  const unreachableIds = flowing.filter((n) => !seen.has(n.id)).map((n) => n.id);
  const fullOrder = [...order, ...unreachableIds];

  const numberById = new Map(fullOrder.map((id, i) => [id, String(i + 1)]));
  const labelOf = (id: string) => byId.get(id)?.data.label ?? '';

  const informsBySource = new Map<string, Array<{ label: string }>>();
  for (const e of information) {
    if (!informsBySource.has(e.source)) informsBySource.set(e.source, []);
    // O alvo pode ser uma anotação ou um documento: usa o rótulo dele, e o da
    // própria aresta quando o alvo não existe mais no grafo.
    const target = graph.nodes.find((n) => n.id === e.target);
    const label = target
      ? String((target.data as { label?: unknown }).label ?? '')
      : (e.label ?? '');
    informsBySource.get(e.source)!.push({ label });
  }

  const steps: PopStep[] = fullOrder.map((id, index) => {
    const node = byId.get(id)!;
    const data = node.data as ProcessNodeData;
    const myNumber = index + 1;
    const next: PopNextStep[] = (outgoing.get(id) ?? []).map((e) => {
      const n = numberById.get(e.target);
      return {
        ...(e.label && e.label.trim() ? { condition: e.label.trim() } : {}),
        number: n ?? '—',
        label: labelOf(e.target),
        isLoopBack: n !== undefined && Number(n) < myNumber,
      };
    });

    return {
      number: String(myNumber),
      nodeId: id,
      shape: data.shape,
      label: data.label ?? '',
      ...(data.description ? { description: data.description } : {}),
      ...(data.responsibleEmployeeId ? { responsibleEmployeeId: data.responsibleEmployeeId } : {}),
      ...(data.responsibleLabel ? { responsibleLabel: data.responsibleLabel } : {}),
      ...(data.duration ? { duration: data.duration } : {}),
      ...(data.laneId ? { laneId: data.laneId, laneLabel: laneLabelById.get(data.laneId) ?? '' } : {}),
      next,
      informs: informsBySource.get(id) ?? [],
      unreachable: !seen.has(id),
    };
  });

  return { steps, notes, lanes };
}
