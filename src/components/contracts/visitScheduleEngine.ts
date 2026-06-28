// Motor PURO de "dois relógios" (Fase B, fatia B1). Generaliza o motor PMOC
// mês-base de `useContracts.ts` (positionForMonth/dueLevelsForPosition) para
// QUALQUER cadência de visitas + atividades com frequência PRÓPRIA.
//
// Os "dois relógios":
//   • Relógio do CONTRATO — a lista de visitas já agendadas (cadência qualquer:
//     14 dias, mensal, quinzenal, personalizada). Esse motor NÃO gera datas de
//     visita; ele recebe as visitas prontas e decide o que cai em cada uma.
//   • Relógio de cada ATIVIDADE — a frequência própria da atividade (por tempo,
//     em meses, OU por número de visitas) + o início próprio dela. A frequência
//     da atividade NÃO precisa bater com a cadência das visitas.
//
// 100% pura/determinística: sem Date.now()/new Date() sem argumento, sem random.
// Trabalha só com as datas recebidas, comparando por DIA (sem hora). Sem React,
// sem Supabase. É o superconjunto do motor PMOC atual (ver teste de equivalência
// em visitScheduleEngine.test.ts).

/** Como a frequência da atividade é medida. */
export type FreqKind = 'time' | 'visits';

/**
 * Onde o relógio da atividade começa a contar:
 *   • 'contract_start' (padrão) — conta desde o início do contrato (a 1ª visita).
 *     Uma trimestral só vence quando ~3 meses passaram do início, então NÃO entra
 *     na 1ª visita (a não ser que a frequência seja ~imediata).
 *   • 'due_now' — "começa vencida": a 1ª ocorrência cai já na 1ª visita aplicável.
 *   • 'visit_n' — a 1ª ocorrência cai na visita N (1-based); daí segue a frequência.
 */
export type StartKind = 'contract_start' | 'due_now' | 'visit_n';

/** Especificação de UMA atividade (o relógio dela). */
export interface ActivitySpec {
  id: string;
  freqKind: FreqKind;
  /** quando freqKind='time': período em meses (1, 3, 6, 12 ou custom). */
  freqMonths?: number;
  /** quando freqKind='visits': vence a cada N visitas (1 = toda visita). */
  freqVisits?: number;
  /** Onde o relógio começa. Default 'contract_start'. */
  startKind: StartKind;
  /** 1-based, obrigatório quando startKind='visit_n'. */
  startVisit?: number;
}

/** Uma visita do contrato. As visitas chegam JÁ ORDENADAS e dentro do contrato. */
export interface VisitInput {
  date: string | Date;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers de data — comparação por DIA (sem hora), em meses inteiros.
// ──────────────────────────────────────────────────────────────────────────

/** Date pura de uma entrada (string ISO 'YYYY-MM-DD' ou Date), sem mutar. */
function toDate(d: string | Date): Date {
  if (d instanceof Date) return new Date(d.getTime());
  // String: aceita 'YYYY-MM-DD' (data pura) ou ISO com hora. Compara por dia.
  return new Date(d);
}

/**
 * "Já passaram pelo menos `months` meses (de calendário) entre `from` e `to`?"
 * Compara por DIA, ignorando hora. Modelo de calendário: a data-alvo é
 * `from` + `months` meses (com overflow de fim-de-mês do JS), e devolve true se
 * `to` é >= essa data-alvo (no nível do dia). Isso casa com a régua "a atividade
 * vence na 1ª visita em que já passou `freqMonths` desde a última vez que venceu".
 */
function monthsElapsedReached(from: Date, to: Date, months: number): boolean {
  const target = new Date(from.getTime());
  target.setMonth(target.getMonth() + months);
  // Comparação por dia (zera a hora dos dois lados).
  const a = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return a >= b;
}

// ──────────────────────────────────────────────────────────────────────────
// Núcleo: agenda as atividades nas visitas.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Decide, por índice de visita (0-based), quais atividades vencem nela.
 * Retorna um Map<indiceDaVisita, idsDeAtividades[]>. Índices de visita sem
 * nenhuma atividade devida simplesmente NÃO aparecem no Map.
 *
 * Convenção de índice: visitas e o Map são 0-based; `startVisit` (em 'visit_n')
 * e o `freqVisits` são contados de forma humana (1-based / "a cada N"). Ver os
 * testes 6 e 7 pra a tabela exata.
 *
 * Regras (o coração — ver doc da fatia B1):
 *  1. Por tempo: vence na 1ª visita em que já passou `freqMonths` desde a última
 *     vez que venceu (modelo "desde a última execução", não drift fixo). Ao
 *     vencer, a "última vez" passa a ser a data daquela visita.
 *  2. Por nº de visitas: vence a cada `freqVisits` visitas, contagem limpa a
 *     partir do início.
 *  3. Início: 'due_now' = vence já na 1ª visita aplicável; 'visit_n' = 1ª
 *     ocorrência na visita N (1-based); 'contract_start' = relógio começa no
 *     início do contrato (data da 1ª visita).
 *  4. Não agendar após o fim: como as visitas já estão dentro do contrato, uma
 *     atividade cujo 1º vencimento cairia depois da última visita simplesmente
 *     não aparece.
 */
export function scheduleActivitiesOntoVisits(
  visits: VisitInput[],
  activities: ActivitySpec[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (visits.length === 0) return result;

  const dates = visits.map((v) => toDate(v.date));
  const contractStart = dates[0]; // a 1ª visita ancora o início do contrato

  const push = (visitIndex: number, id: string) => {
    const arr = result.get(visitIndex);
    if (arr) arr.push(id);
    else result.set(visitIndex, [id]);
  };

  for (const a of activities) {
    if (a.freqKind === 'visits') {
      scheduleByVisits(a, dates.length, push);
    } else {
      scheduleByTime(a, dates, contractStart, push);
    }
  }

  return result;
}

/** Índice 0-based da 1ª visita aplicável conforme o início da atividade. */
function firstApplicableIndex(a: ActivitySpec, visitCount: number): number {
  if (a.startKind === 'visit_n') {
    const n = a.startVisit && a.startVisit >= 1 ? a.startVisit : 1;
    return n - 1; // 1-based → 0-based
  }
  // 'due_now' e 'contract_start' aplicam a partir da 1ª visita (índice 0).
  return 0;
}

/**
 * Por nº de visitas: contagem limpa a partir da 1ª visita aplicável. A 1ª
 * ocorrência é nesse índice; daí a cada `freqVisits` visitas. freqVisits<=1 =
 * toda visita.
 */
function scheduleByVisits(
  a: ActivitySpec,
  visitCount: number,
  push: (visitIndex: number, id: string) => void,
): void {
  const step = a.freqVisits && a.freqVisits >= 1 ? Math.floor(a.freqVisits) : 1;
  const start = firstApplicableIndex(a, visitCount);
  if (start >= visitCount) return; // 1º vencimento cairia após a última visita
  for (let i = start; i < visitCount; i += step) {
    push(i, a.id);
  }
}

/**
 * Por tempo (meses): modelo "desde a última execução". A âncora inicial depende
 * do início:
 *   • 'due_now'        → vence na 1ª visita aplicável (índice 0).
 *   • 'visit_n'        → vence na visita N (índice N-1).
 *   • 'contract_start' → o relógio parte do início do contrato; vence na 1ª
 *                        visita em que já passou `freqMonths` desde o início.
 * Após cada vencimento, a "última execução" vira a data daquela visita; o próximo
 * vencimento é a 1ª visita em que já passou `freqMonths` desde então.
 */
function scheduleByTime(
  a: ActivitySpec,
  dates: Date[],
  contractStart: Date,
  push: (visitIndex: number, id: string) => void,
): void {
  const months = a.freqMonths && a.freqMonths > 0 ? a.freqMonths : 0;
  if (months <= 0) return; // sem período válido (eventual) → nunca no automático

  const visitCount = dates.length;
  let i = 0; // índice da próxima visita candidata
  let lastDue: Date | null = null;

  // Resolve o 1º vencimento conforme o início.
  if (a.startKind === 'due_now') {
    // Começa vencida: 1ª visita aplicável já é vencimento.
    push(0, a.id);
    lastDue = dates[0];
    i = 1;
  } else if (a.startKind === 'visit_n') {
    const startIdx = firstApplicableIndex(a, visitCount);
    if (startIdx >= visitCount) return; // após a última visita → não aparece
    push(startIdx, a.id);
    lastDue = dates[startIdx];
    i = startIdx + 1;
  } else {
    // 'contract_start': relógio parte do início; 1º vencimento quando já passou
    // `months` desde o contractStart. lastDue começa como o início (não emite).
    lastDue = contractStart;
    i = 0;
  }

  // Varre as visitas restantes, emitindo a cada vez que `months` já passaram
  // desde a última vez que venceu (ou desde o início, no contract_start).
  for (; i < visitCount; i++) {
    if (lastDue && monthsElapsedReached(lastDue, dates[i], months)) {
      push(i, a.id);
      lastDue = dates[i];
    }
  }
}
