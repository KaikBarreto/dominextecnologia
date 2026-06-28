// Visibilidade de PERGUNTAS por visita (Fase B, fatia B3.1). Helper PURO que
// decide quais perguntas de um checklist DEVEM aparecer na visita atual de uma
// OS de CONTRATO, conforme a frequência própria de cada pergunta.
//
// É display-only: NÃO mexe na geração de OS. Recebe as DATAS REAIS das visitas
// do contrato (as `scheduled_date` de TODAS as OSs daquele contrato, ordenadas),
// acha o índice da visita atual casando a `scheduledDate` por DIA, e roda o
// motor puro `scheduleActivitiesOntoVisits` pra saber o que vence nessa visita.
//
// Por que datas reais (e não reconstruir o calendário): OSs de contrato COM
// PLANO são geradas mensalmente por um motor diferente; remarcação, virada de
// mês e cap de horizonte fazem um calendário reconstruído divergir das visitas
// reais, e o índice não casa → cairia no fallback "mostra tudo" silencioso.
// Usar as datas reais elimina a divergência.
//
// Régua de ouro: NA DÚVIDA, MOSTRA. Qualquer incerteza (sem datas de visita,
// calendário vazio, data que não casa) → devolve TODAS as perguntas. Pergunta
// sem frequência (freq_kind NULL) → sempre aparece. Pergunta já respondida →
// sempre aparece (proteção de histórico).
//
// 100% pura: sem Date.now()/new Date() sem argumento, sem random. Só trabalha
// com as datas recebidas, comparando por DIA.

import {
  scheduleActivitiesOntoVisits,
  type ActivitySpec,
  type VisitInput,
} from './visitScheduleEngine';

/** Pergunta na forma mínima que o helper precisa (subset de FormQuestion). */
export interface VisibilityQuestion {
  id: string;
  freq_kind?: string | null;
  freq_months?: number | null;
  freq_days?: number | null;
  freq_visits?: number | null;
  start_kind?: string | null;
  start_visit?: number | null;
}

export interface ComputeVisibleArgs {
  /**
   * Datas REAIS de TODAS as visitas do contrato (as `scheduled_date` de todas as
   * OSs daquele `contract_id`), em qualquer ordem ('YYYY-MM-DD' ou ISO). O helper
   * normaliza por DIA, ordena e deduplica. Vazio/ausente → fallback mostra tudo.
   */
  visitDates?: (string | null | undefined)[] | null;
  /** Data desta OS (yyyy-mm-dd ou ISO). */
  scheduledDate?: string | null;
  /** Perguntas do checklist. */
  questions: VisibilityQuestion[];
  /** Perguntas que já têm resposta — nunca escondidas. */
  answeredQuestionIds?: Set<string>;
  /**
   * IDs de perguntas EXCLUÍDAS da PRIMEIRA OS deste equipamento (vem do flag
   * `contract_items.first_os_excluded_questions`, fatia F3 — "checklists por
   * equipamento + primeira OS"). É a ÂNCORA por equipamento (Opção A do CEO),
   * sobrescrevendo o `start_kind` do template:
   *   • pergunta INCLUÍDA (id NÃO está no set)  → âncora 'due_now'
   *     (entra na 1ª visita e conta a frequência a partir dali);
   *   • pergunta EXCLUÍDA (id está no set)       → âncora 'contract_start'
   *     (não entra na 1ª OS; aparece só na 1ª vez que a frequência vence).
   * Só afeta perguntas COM frequência — perguntas "toda visita" (sem freq.)
   * aparecem sempre, não há o que ancorar. Ausente/undefined = sem flag =
   * comportamento atual (âncora pelo `start_kind` do template).
   */
  excludedQuestionIds?: Set<string>;
}

/** 'YYYY-MM-DD' de uma string de data (ISO ou data pura), em horário local. */
function toDayKey(d: string): string | null {
  // Aceita 'YYYY-MM-DD' direto (mais robusto que parsear) e ISO com hora.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.trim());
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const mo = String(parsed.getMonth() + 1).padStart(2, '0');
  const da = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Devolve todos os ids (fallback "mostra tudo"). */
function allIds(questions: VisibilityQuestion[]): Set<string> {
  return new Set(questions.map((q) => q.id));
}

/** Pergunta tem frequência própria? (freq_kind preenchido com valor válido). */
function hasFrequency(q: VisibilityQuestion): boolean {
  return q.freq_kind === 'time' || q.freq_kind === 'visits';
}

/**
 * Mapeia uma pergunta com frequência pra ActivitySpec do motor.
 *
 * Quando `excludedQuestionIds` é fornecido (OS de contrato com o flag por
 * equipamento — fatia F3), a ÂNCORA vem do flag e SOBRESCREVE o `start_kind` do
 * template (Opção A do CEO):
 *   • pergunta INCLUÍDA (não está no set)  → 'due_now'  (1ª visita ancora a freq.)
 *   • pergunta EXCLUÍDA (está no set)      → 'contract_start' (só na 1ª vez que vence)
 * Sem `excludedQuestionIds` → âncora pelo `start_kind` do template (atual).
 */
function toActivitySpec(
  q: VisibilityQuestion,
  excludedQuestionIds?: Set<string>,
): ActivitySpec {
  const freqKind = q.freq_kind === 'visits' ? 'visits' : 'time';
  let startKind: ActivitySpec['startKind'];
  if (excludedQuestionIds) {
    // Âncora por equipamento (flag F3) sobrescreve o template.
    startKind = excludedQuestionIds.has(q.id) ? 'contract_start' : 'due_now';
  } else {
    startKind =
      q.start_kind === 'due_now' || q.start_kind === 'visit_n'
        ? q.start_kind
        : 'contract_start';
  }
  return {
    id: q.id,
    freqKind,
    freqMonths: q.freq_months ?? undefined,
    freqDays: q.freq_days ?? undefined,
    freqVisits: q.freq_visits ?? undefined,
    startKind,
    startVisit: q.start_visit ?? undefined,
  };
}

/**
 * Conjunto de ids de perguntas que DEVEM aparecer nesta visita.
 *
 * União de três conjuntos:
 *   1. Perguntas SEM frequência (freq_kind NULL) → sempre.
 *   2. Perguntas COM frequência que vencem no índice desta visita (motor).
 *   3. Perguntas já respondidas → sempre (proteção de histórico).
 *
 * Fallback "mostra tudo" sempre que faltam datas de visita, o calendário fica
 * vazio, ou a data da OS não casa com nenhuma visita real.
 */
export function computeVisibleQuestionIds(args: ComputeVisibleArgs): Set<string> {
  const { visitDates, scheduledDate, questions, answeredQuestionIds, excludedQuestionIds } = args;

  // Sem perguntas → conjunto vazio (nada a mostrar, nada a esconder).
  if (!questions || questions.length === 0) return new Set();

  const schedKey = scheduledDate ? toDayKey(scheduledDate) : null;

  // Normaliza, deduplica e ordena as datas reais das visitas (por DIA).
  const dayKeys = Array.from(
    new Set(
      (visitDates ?? [])
        .map((d) => (d ? toDayKey(d) : null))
        .filter((k): k is string => !!k),
    ),
  ).sort();

  // Contexto incompleto → mostra tudo.
  if (!schedKey || dayKeys.length === 0) {
    return allIds(questions);
  }

  // Acha o índice da visita atual casando por DIA.
  const visitIndex = dayKeys.indexOf(schedKey);
  if (visitIndex < 0) {
    // A OS não casa com nenhuma visita real (reagendada fora do dia exato,
    // etc.) → na dúvida, mostra tudo.
    return allIds(questions);
  }

  const visible = new Set<string>();

  // (1) Perguntas sem frequência → sempre.
  // (separa também as que têm frequência pra rodar o motor só nelas)
  const freqQuestions: VisibilityQuestion[] = [];
  for (const q of questions) {
    if (hasFrequency(q)) {
      freqQuestions.push(q);
    } else {
      visible.add(q.id);
    }
  }

  // (2) Perguntas com frequência → motor decide o que cai nesta visita.
  if (freqQuestions.length > 0) {
    const visits: VisitInput[] = dayKeys.map((k) => ({ date: k }));
    const specs = freqQuestions.map((q) => toActivitySpec(q, excludedQuestionIds));
    const schedule = scheduleActivitiesOntoVisits(visits, specs);
    const dueHere = schedule.get(visitIndex) ?? [];
    for (const id of dueHere) visible.add(id);
  }

  // (3) Perguntas já respondidas → sempre (nunca esconder histórico).
  if (answeredQuestionIds) {
    for (const q of questions) {
      if (answeredQuestionIds.has(q.id)) visible.add(q.id);
    }
  }

  return visible;
}
