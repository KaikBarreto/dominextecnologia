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
  /**
   * quando freqKind='time' E `freqDays` NÃO está presente: período em MESES de
   * calendário (1, 3, 6, 12 ou custom). Overflow de fim-de-mês segue o JS.
   */
  freqMonths?: number;
  /**
   * quando freqKind='time': período em DIAS corridos (ex: 17 = "a cada 17 dias",
   * frequência "Personalizada"). PRIORIDADE: se `freqDays` (>0) estiver presente,
   * o intervalo é medido em dias corridos e `freqMonths` é IGNORADO. Só quando
   * `freqDays` está ausente/inválido é que `freqMonths` (meses de calendário) vale.
   */
  freqDays?: number;
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

/** Compara só por DIA (zera a hora): a >= b? */
function dayGte(a: Date, b: Date): boolean {
  const ad = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bd = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return ad >= bd;
}

/** `base` + `count`×intervalo, em meses de calendário OU dias corridos. */
function addInterval(base: Date, count: number, months: number, days: number): Date {
  const d = new Date(base.getTime());
  if (days > 0) d.setDate(d.getDate() + days * count);
  else d.setMonth(d.getMonth() + months * count);
  return d;
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
 *  1. Por tempo: CADÊNCIA FIXA ANCORADA (Model B). As metas ficam fixas a partir
 *     de uma âncora (1ªMeta, +1×iv, +2×iv, …) e NÃO escorregam; cada meta cai na
 *     1ª visita com data ≥ ela. Várias metas na mesma visita = aparece 1 vez
 *     (dedup). Ver `scheduleByTime`.
 *  2. Por nº de visitas: vence a cada `freqVisits` visitas, contagem limpa a
 *     partir do início.
 *  3. Início: 'due_now' = vence já na 1ª visita aplicável; 'visit_n' = 1ª
 *     ocorrência na visita N (1-based); 'contract_start' = relógio começa no
 *     início do contrato (data da 1ª visita).
 *  4. Não agendar após o fim: como as visitas já estão dentro do contrato, uma
 *     atividade cuja meta cairia depois da última visita simplesmente não aparece.
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
 * Por tempo (meses OU dias): CADÊNCIA FIXA ANCORADA (Model B). As metas ficam
 * fixas a partir de uma âncora e NÃO escorregam — diferente do modelo antigo
 * ("desde a última execução"), que reiniciava o relógio na data da visita em que
 * a atividade aparecia (gerando drift quando a visita caía depois da meta).
 *
 * 1. Âncora e 1ª meta conforme `startKind`:
 *    • 'due_now'        → âncora = data da 1ª visita; 1ª meta = essa data (aparece
 *                         já na visita 0). Metas seguintes: âncora + k×intervalo.
 *    • 'visit_n'        → âncora = data da visita N (1-based, índice N-1); 1ª meta
 *                         = essa data; metas seguintes += intervalo.
 *    • 'contract_start' → âncora = data da 1ª visita; 1ª meta = âncora + 1
 *                         intervalo (NÃO aparece na visita 0).
 * 2. Metas = 1ªMeta, +1×iv, +2×iv, … enquanto ≤ data da última visita. Intervalo
 *    em meses de calendário (`freqMonths`) ou dias corridos (`freqDays`, que tem
 *    PRIORIDADE se >0; nesse caso `freqMonths` é ignorado).
 * 3. Cada meta cai na PRIMEIRA visita com data ≥ a meta. Esse índice recebe a
 *    atividade. As metas continuam ancoradas (não reiniciam pela data da visita).
 * 4. Dedup: se várias metas caírem na mesma visita (visitas espaçadas demais), a
 *    atividade aparece UMA vez só naquela visita (Set de índices).
 * 5. Meta cuja 1ª visita ≥ ela não existe (cairia após a última visita) → não
 *    agenda.
 */
function scheduleByTime(
  a: ActivitySpec,
  dates: Date[],
  contractStart: Date,
  push: (visitIndex: number, id: string) => void,
): void {
  const days = a.freqDays && a.freqDays > 0 ? a.freqDays : 0;
  const months = a.freqMonths && a.freqMonths > 0 ? a.freqMonths : 0;
  if (days <= 0 && months <= 0) return; // sem período válido (eventual)

  const visitCount = dates.length;
  const lastVisitDate = dates[visitCount - 1];

  // Âncora + offset da 1ª meta (em nº de intervalos a partir da âncora).
  let anchor: Date;
  let firstStep: number;
  if (a.startKind === 'due_now') {
    anchor = contractStart; // data da 1ª visita
    firstStep = 0; // 1ª meta = âncora (aparece na visita 0)
  } else if (a.startKind === 'visit_n') {
    const startIdx = firstApplicableIndex(a, visitCount);
    if (startIdx >= visitCount) return; // âncora cairia após a última visita
    anchor = dates[startIdx];
    firstStep = 0; // 1ª meta = data da visita N
  } else {
    // 'contract_start': âncora na 1ª visita, 1ª meta após 1 intervalo.
    anchor = contractStart;
    firstStep = 1;
  }

  // Set de índices: dedup quando metas distintas caem na mesma visita.
  const scheduled = new Set<number>();
  let searchFrom = 0; // metas são monótonas → varredura linear acumulada

  for (let step = firstStep; ; step++) {
    const target = addInterval(anchor, step, months, days);
    if (!dayGte(lastVisitDate, target)) break; // meta passou da última visita

    // 1ª visita com data ≥ meta. As datas são crescentes; avança o cursor.
    while (searchFrom < visitCount && !dayGte(dates[searchFrom], target)) {
      searchFrom++;
    }
    if (searchFrom >= visitCount) break; // nenhuma visita alcança a meta
    scheduled.add(searchFrom);
  }

  for (const idx of [...scheduled].sort((x, y) => x - y)) push(idx, a.id);
}
