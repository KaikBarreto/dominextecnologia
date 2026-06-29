// =============================================================================
// perQuestionMatrix.ts — Matriz 12 meses POR-PERGUNTA pra Planilha PMOC (modelo
// NOVO, contratos com `contract_items.form_template_ids` não-vazio).
// =============================================================================
// FUNÇÃO PURA, SEM imports Deno (só matemática/datas). Espelha BIT A BIT a
// semântica do motor real do front:
//   • `scheduleActivitiesOntoVisits` (src/components/contracts/visitScheduleEngine.ts)
//   • `toActivitySpec`                (src/components/contracts/visitQuestionVisibility.ts)
//
// ⚠️ POR QUE ISSO IMPORTA (Lei 13.589/2018 — o doc é prova de conformidade):
// a Planilha legal mostra "atividade × 12 meses" (bolinha verde no mês em que
// vence). No modelo NOVO a frequência é POR-PERGUNTA (freq_kind/freq_months/…),
// agendada por visita pelo motor por-pergunta — NÃO pelo ciclo-12 faseado da
// norma (legado). Uma SEMESTRAL a partir do início cai nos meses 0 e 6, e NÃO
// 6 e 12 como o legado. O doc TEM que bater com a OS realmente gerada, então a
// matriz nova reusa a MESMA lógica do render (motor por-pergunta + âncora
// `first_os_excluded_questions`). A equivalência é provada por teste (vitest) em
// src/components/contracts/perQuestionMatrix.test.ts, que importa ESTA função E
// o motor REAL e prova que concordam sobre um calendário mensal de 12 visitas.
//
// 100% pura/determinística: sem Date.now()/new Date() sem argumento, sem random.
// Trabalha só com as datas recebidas, comparando por DIA (sem hora).
// =============================================================================

// ──────────────────────────────────────────────────────────────────────────
// Tipos (subset do que a edge carrega de form_questions / contract_items).
// ──────────────────────────────────────────────────────────────────────────

/** Pergunta na forma mínima que a matriz precisa (subset de form_questions). */
export interface MatrixQuestion {
  id: string;
  question: string | null;
  freq_kind?: string | null;
  freq_months?: number | null;
  freq_days?: number | null;
  freq_visits?: number | null;
  start_kind?: string | null;
  start_visit?: number | null;
  unit?: string | null;
  expected_min?: number | null;
  expected_max?: number | null;
  pmoc_section?: string | null;
  pmoc_group?: string | null;
}

export interface BuildMatrixOpts {
  /**
   * Datas REAIS das 12 (ou N) visitas projetadas, 'YYYY-MM-DD', JÁ ORDENADAS.
   * Quando ausente, a matriz projeta as datas a partir da CADÊNCIA do contrato
   * (`frequencyType`/`frequencyValue`/`horizonMonths`, port fiel de
   * `generateOccurrences`) ou, se nada vier, de um calendário MENSAL de 12
   * visitas a partir de `startDate`.
   */
  visitDates?: string[];
  /** Início do contrato/1ª visita (âncora) quando `visitDates` é gerado aqui. */
  startDate?: string;
  /**
   * Cadência do contrato (mesma de `contracts.frequency_type`). Com ela +
   * `frequencyValue` + `horizonMonths` a matriz projeta as datas REAIS de visita
   * (port de `generateOccurrences`) — mês de cada visita marca a coluna. MENSAL
   * (`months`/1) reduz EXATAMENTE ao calendário mensal de 12 visitas de hoje.
   */
  frequencyType?: "days" | "months" | string | null;
  frequencyValue?: number | null;
  horizonMonths?: number | null;
}

export interface MatrixRow {
  question: MatrixQuestion;
  /** 12 posições (mês 0..11): true = a pergunta vence naquele mês. */
  hits: boolean[];
  /**
   * 12 posições (mês 0..11): true = existe AO MENOS uma visita real naquele mês.
   * Em cadência MENSAL todos os 12 são true. Em cadência supra-mensal (bimestral,
   * etc.) os meses sem visita ficam false — o render diferencia "sem visita" de
   * "tem visita mas a tarefa não vence". Idêntico em TODAS as linhas (a cadência
   * é do contrato, não da pergunta); repetido por linha só por conveniência.
   */
  monthHasVisit: boolean[];
  /** Rótulo PT-BR da frequência (Mensal/Trimestral/Semestral/Anual/…). */
  freqLabel: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  section: string | null;
  group: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// ActivitySpec espelhado (mesma forma do motor). Mantido local pra a função
// não depender de NADA do front (é Deno; o front é src/). A equivalência é
// garantida pelo teste, não pelo compartilhamento de código.
// ──────────────────────────────────────────────────────────────────────────

type FreqKind = "time" | "visits";
type StartKind = "contract_start" | "due_now" | "visit_n";

interface ActivitySpec {
  id: string;
  freqKind: FreqKind;
  freqMonths?: number;
  freqDays?: number;
  freqVisits?: number;
  startKind: StartKind;
  startVisit?: number;
}

/** Pergunta tem frequência própria? (freq_kind preenchido e válido). */
function hasFrequency(q: MatrixQuestion): boolean {
  return q.freq_kind === "time" || q.freq_kind === "visits";
}

/**
 * Espelha EXATAMENTE `toActivitySpec` do front:
 *  • com `excludedQuestionIds` (flag F3 por equipamento) a ÂNCORA sobrescreve o
 *    template — INCLUÍDA (não no set) → 'due_now'; EXCLUÍDA (no set) →
 *    'contract_start';
 *  • sem o set → âncora pelo `start_kind` do template ('due_now'/'visit_n' senão
 *    'contract_start').
 */
function toActivitySpec(
  q: MatrixQuestion,
  excludedQuestionIds?: Set<string>,
): ActivitySpec {
  const freqKind: FreqKind = q.freq_kind === "visits" ? "visits" : "time";
  let startKind: StartKind;
  if (excludedQuestionIds) {
    startKind = excludedQuestionIds.has(q.id) ? "contract_start" : "due_now";
  } else {
    startKind =
      q.start_kind === "due_now" || q.start_kind === "visit_n"
        ? (q.start_kind as StartKind)
        : "contract_start";
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

// ──────────────────────────────────────────────────────────────────────────
// Motor PORTADO — cópia 1:1 da lógica de `scheduleActivitiesOntoVisits`
// (visitScheduleEngine.ts). Não pode divergir; o teste de equivalência trava.
// ──────────────────────────────────────────────────────────────────────────

// Espelha `visitScheduleEngine.toDate` em RESULTADO (a data de calendário), mas
// é robusto a fuso: 'YYYY-MM-DD' vira meia-dia LOCAL (não meia-noite UTC). Por
// quê: o motor compara por DIA usando campos LOCAIS (getFullYear/Month/Date) e
// faz aritmética de meses com setMonth (campos LOCAIS). Parsear como UTC
// (`new Date('2026-01-01')`) num fuso negativo escorrega pro dia anterior (31),
// disparando overflow de fim-de-mês no setMonth e DRIFT na matriz. Meia-dia
// local fixa o dia certo em qualquer fuso e NÃO muda o resultado do motor pra as
// datas que ele realmente recebe em produção (scheduled_date de OS, data pura).
// O teste de equivalência alimenta o motor real e ESTA matriz com as MESMAS
// strings e prova que concordam.
function toDate(d: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
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

function firstApplicableIndex(a: ActivitySpec): number {
  if (a.startKind === "visit_n") {
    const n = a.startVisit && a.startVisit >= 1 ? a.startVisit : 1;
    return n - 1;
  }
  return 0;
}

function scheduleByVisits(
  a: ActivitySpec,
  visitCount: number,
  push: (visitIndex: number, id: string) => void,
): void {
  const step = a.freqVisits && a.freqVisits >= 1 ? Math.floor(a.freqVisits) : 1;
  const start = firstApplicableIndex(a);
  if (start >= visitCount) return;
  for (let i = start; i < visitCount; i += step) push(i, a.id);
}

function scheduleByTime(
  a: ActivitySpec,
  dates: Date[],
  contractStart: Date,
  push: (visitIndex: number, id: string) => void,
): void {
  const days = a.freqDays && a.freqDays > 0 ? a.freqDays : 0;
  const months = a.freqMonths && a.freqMonths > 0 ? a.freqMonths : 0;
  if (days <= 0 && months <= 0) return;

  const visitCount = dates.length;
  const lastVisitDate = dates[visitCount - 1];

  let anchor: Date;
  let firstStep: number;
  if (a.startKind === "due_now") {
    anchor = contractStart;
    firstStep = 0;
  } else if (a.startKind === "visit_n") {
    const startIdx = firstApplicableIndex(a);
    if (startIdx >= visitCount) return;
    anchor = dates[startIdx];
    firstStep = 0;
  } else {
    anchor = contractStart;
    firstStep = 1;
  }

  const scheduled = new Set<number>();
  let searchFrom = 0;

  for (let step = firstStep; ; step++) {
    const target = addInterval(anchor, step, months, days);
    if (!dayGte(lastVisitDate, target)) break;
    while (searchFrom < visitCount && !dayGte(dates[searchFrom], target)) {
      searchFrom++;
    }
    if (searchFrom >= visitCount) break;
    scheduled.add(searchFrom);
  }

  for (const idx of [...scheduled].sort((x, y) => x - y)) push(idx, a.id);
}

/** Espelho 1:1 de `scheduleActivitiesOntoVisits`. */
function scheduleActivitiesOntoVisits(
  visitDates: string[],
  activities: ActivitySpec[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (visitDates.length === 0) return result;

  const dates = visitDates.map(toDate);
  const contractStart = dates[0];

  const push = (visitIndex: number, id: string) => {
    const arr = result.get(visitIndex);
    if (arr) arr.push(id);
    else result.set(visitIndex, [id]);
  };

  for (const a of activities) {
    if (a.freqKind === "visits") scheduleByVisits(a, dates.length, push);
    else scheduleByTime(a, dates, contractStart, push);
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Calendário e rótulos.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Calendário MENSAL de 12 visitas (mês 0..11) a partir de `startDate`, em
 * 'YYYY-MM-DD'. Faz a aritmética de meses em UTC e formata com getUTC* pra que,
 * quando o motor re-parsear cada string com `new Date(d)` (UTC), a comparação
 * por DIA caia no MESMO dia gerado — sem deslize de fuso. Overflow de fim-de-mês
 * segue o JS (setUTCMonth), igual ao motor. Sem `startDate` → âncora neutra
 * (2000-01-01): o que importa pra matriz é a CADÊNCIA relativa, não o ano.
 */
function buildMonthlyCalendar(startDate?: string): string[] {
  // Âncora a partir dos campos Y-M-D (ignora hora/fuso da string de entrada).
  let y0 = 2000, m0 = 0, d0 = 1;
  if (startDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate.trim());
    if (m) {
      y0 = Number(m[1]);
      m0 = Number(m[2]) - 1;
      d0 = Number(m[3]);
    }
  }
  const out: string[] = [];
  for (let k = 0; k < 12; k++) {
    // Aritmética de meses em horário LOCAL (espelha o setMonth do motor) a
    // partir de meia-noite local — sem deslize de fuso. Emite só a data
    // 'YYYY-MM-DD'; o motor (real e portado) lê essa data como o MESMO dia.
    const d = new Date(y0, m0, d0);
    d.setMonth(d.getMonth() + k);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${mo}-${da}`);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Port FIEL do gerador de ocorrências do contrato (src/hooks/useContracts.ts
// → `generateOccurrences`). A geração REAL das visitas (e portanto das OSs) do
// contrato NOVO de cadência não-mensal usa `generateOccurrences(start, type,
// value, horizon)`, que por sua vez usa date-fns `addMonths`/`addDays`. A
// matriz TEM que usar as MESMAS datas, senão o doc mente. Por isso replicamos
// aqui, BIT A BIT, a semântica do date-fns:
//   • addDays  → soma `n` dias de calendário.
//   • addMonths→ avança `n` meses e, se o dia original não existe no mês alvo
//                 (ex.: 31 em fevereiro), CLAMPA pro último dia do mês alvo
//                 (NÃO transborda pro mês seguinte, ao contrário do setMonth nativo).
// A equivalência é provada por teste (vitest), que importa ESTE port E o
// `generateOccurrences` real e prova que produzem as MESMAS datas.
// ──────────────────────────────────────────────────────────────────────────

/** date-fns `addDays`: soma `amount` dias de calendário (campos locais). */
function dfAddDays(date: Date, amount: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + amount);
  return d;
}

/**
 * date-fns `addMonths`: avança `amount` meses preservando o dia, mas CLAMPANDO
 * pro último dia do mês alvo quando o dia original não existe nele. Espelha o
 * algoritmo do date-fns v3 (define o dia 1, soma os meses, e só então tenta
 * restaurar o dia — se estourar, fica no último dia do mês).
 */
function dfAddMonths(date: Date, amount: number): Date {
  const d = new Date(date.getTime());
  const dayOfMonth = d.getDate();
  // Data candidata no dia 1 do mês alvo (não transborda).
  const endOfDesiredMonth = new Date(d.getTime());
  endOfDesiredMonth.setMonth(d.getMonth() + amount + 1, 0); // dia 0 = último dia do mês alvo
  const daysInMonth = endOfDesiredMonth.getDate();
  if (dayOfMonth >= daysInMonth) {
    // Dia original não cabe no mês alvo → clampa pro último dia.
    return endOfDesiredMonth;
  }
  d.setFullYear(
    endOfDesiredMonth.getFullYear(),
    endOfDesiredMonth.getMonth(),
    dayOfMonth,
  );
  return d;
}

/**
 * Port FIEL de `generateOccurrences` (useContracts.ts). Mesmos limites (≤120
 * datas, fim = início + `horizonMonths`), mesmo stepping (dias vs meses),
 * mesmo tratamento de borda (via dfAddMonths/dfAddDays). Recebe e devolve
 * objetos Date em horário LOCAL (campos Y-M-D), como o gerador real.
 */
export function generateOccurrencesPure(
  startDate: Date,
  frequencyType: "days" | "months",
  frequencyValue: number,
  horizonMonths: number,
): Date[] {
  const dates: Date[] = [];
  const endDate = dfAddMonths(startDate, horizonMonths);
  let current = new Date(startDate.getTime());
  while (current.getTime() <= endDate.getTime() && dates.length < 120) {
    dates.push(new Date(current.getTime()));
    if (frequencyType === "months") {
      current = dfAddMonths(current, frequencyValue);
    } else {
      current = dfAddDays(current, frequencyValue);
    }
  }
  return dates;
}

/**
 * Calendário das visitas REAIS a partir da cadência do contrato, em
 * 'YYYY-MM-DD'. Usa o port de `generateOccurrences`. MENSAL (`months`/1) cai no
 * MESMO conjunto de datas que `buildMonthlyCalendar` produziria a partir do
 * mesmo `startDate` (com a diferença correta de que fim-de-mês CLAMPA, igual à
 * geração real — `buildMonthlyCalendar` antigo transbordava; só importava em
 * início no dia 29/30/31, caso em que o antigo já divergia da OS gerada).
 * Sem `startDate` → âncora neutra (2000-01-01): o que importa é a cadência
 * relativa, não o ano.
 */
function buildCadenceCalendar(
  startDate: string | undefined,
  frequencyType: "days" | "months",
  frequencyValue: number,
  horizonMonths: number,
): string[] {
  let y0 = 2000, m0 = 0, d0 = 1;
  if (startDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate.trim());
    if (m) {
      y0 = Number(m[1]);
      m0 = Number(m[2]) - 1;
      d0 = Number(m[3]);
    }
  }
  const anchor = new Date(y0, m0, d0);
  const dates = generateOccurrencesPure(
    anchor,
    frequencyType,
    frequencyValue,
    horizonMonths,
  );
  return dates.map((d) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  });
}

/**
 * Índice de mês (0-based) de uma data de visita RELATIVO ao mês de início.
 * Conta meses de calendário (não dias): (ano−ano0)*12 + (mês−mês0). Garante que
 * 2 visitas no mesmo mês caiam na mesma coluna e que a coluna seja o "mês k" da
 * planilha (igual ao índice de visita no caso mensal).
 */
function monthOffset(visitISO: string, anchorY: number, anchorM: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(visitISO.trim());
  if (!m) return -1;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return (y - anchorY) * 12 + (mo - anchorM);
}

/** Rótulo PT-BR da frequência a partir dos campos da pergunta. */
export function freqLabelFor(q: MatrixQuestion): string {
  if (q.freq_kind === "visits") {
    const n = q.freq_visits && q.freq_visits >= 1 ? Math.floor(q.freq_visits) : 1;
    return n <= 1 ? "Toda visita" : `A cada ${n} visitas`;
  }
  if (q.freq_kind === "time") {
    const days = q.freq_days && q.freq_days > 0 ? Math.floor(q.freq_days) : 0;
    if (days > 0) {
      return days === 1 ? "Diária" : `A cada ${days} dias (Personalizado)`;
    }
    const m = q.freq_months && q.freq_months > 0 ? Math.floor(q.freq_months) : 0;
    switch (m) {
      case 1:
        return "Mensal";
      case 2:
        return "Bimestral";
      case 3:
        return "Trimestral";
      case 4:
        return "Quadrimestral";
      case 6:
        return "Semestral";
      case 12:
        return "Anual";
      case 0:
        return "Eventual";
      default:
        return `A cada ${m} meses (Personalizado)`;
    }
  }
  // freq_kind null/ausente → "toda visita" (sem frequência própria).
  return "Toda visita";
}

// ──────────────────────────────────────────────────────────────────────────
// API pública.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Constrói a matriz 12 meses por-pergunta. Para cada pergunta:
 *  • SEM frequência (freq_kind null) → TODOS os 12 meses marcados ("toda visita");
 *  • COM frequência → roda o motor por-pergunta sobre o calendário (mensal por
 *    padrão, ou as `visitDates` reais projetadas) e marca os meses em que vence.
 *
 * A âncora da 1ª OS vem de `excludedQuestionIds` (contract_items
 * .first_os_excluded_questions), espelhando `toActivitySpec`:
 *  • INCLUÍDA → 'due_now' (entra na 1ª visita / mês 0 se a freq. vence ali);
 *  • EXCLUÍDA → 'contract_start' (não entra no mês 0; só na 1ª vez que vence).
 */
export function buildPerQuestionMonthMatrix(
  questions: MatrixQuestion[],
  excludedQuestionIds: Set<string> | undefined,
  opts: BuildMatrixOpts = {},
): MatrixRow[] {
  // ── 1. Datas REAIS das visitas. Prioridade:
  //      (a) `visitDates` explícitas (já projetadas pela edge), senão
  //      (b) projeção pela cadência do contrato (port de generateOccurrences),
  //          que para MENSAL reduz ao calendário mensal de 12 visitas, senão
  //      (c) calendário mensal de 12 visitas a partir de `startDate` (legado).
  let visitDates: string[];
  const freqType =
    opts.frequencyType === "days" || opts.frequencyType === "months"
      ? opts.frequencyType
      : null;
  const freqValue = opts.frequencyValue && opts.frequencyValue > 0
    ? Math.round(opts.frequencyValue)
    : null;
  const horizon = opts.horizonMonths && opts.horizonMonths > 0
    ? Math.round(opts.horizonMonths)
    : 12;
  if (opts.visitDates && opts.visitDates.length > 0) {
    visitDates = opts.visitDates;
  } else if (freqType && freqValue) {
    visitDates = buildCadenceCalendar(opts.startDate, freqType, freqValue, horizon);
  } else {
    visitDates = buildMonthlyCalendar(opts.startDate);
  }

  // ── 2. Âncora (mês 0 da planilha) = mês da 1ª visita. Cada visita é mapeada
  //      ao seu deslocamento de meses; só interessam os 12 primeiros meses.
  const first = visitDates[0] ?? buildMonthlyCalendar(opts.startDate)[0];
  const am = /^(\d{4})-(\d{2})/.exec(first.trim());
  const anchorY = am ? Number(am[1]) : 2000;
  const anchorM = am ? Number(am[2]) - 1 : 0;

  // Mapa visitIndex → mês-offset (0..) e quais meses têm visita.
  const monthOfVisit = visitDates.map((v) => monthOffset(v, anchorY, anchorM));
  const monthHasVisitBase = new Array(12).fill(false) as boolean[];
  for (const mo of monthOfVisit) if (mo >= 0 && mo < 12) monthHasVisitBase[mo] = true;

  // ── 3. Motor por-pergunta sobre as datas REAIS (uma vez pras perguntas com
  //      frequência). Devolve visitIndex → ids.
  const freqQuestions = questions.filter(hasFrequency);
  const specs = freqQuestions.map((q) => toActivitySpec(q, excludedQuestionIds));
  const schedule = scheduleActivitiesOntoVisits(visitDates, specs);

  // Inverte: id → Set<visitIndex>.
  const hitsByQuestion = new Map<string, Set<number>>();
  for (const [visitIndex, ids] of schedule) {
    for (const id of ids) {
      const set = hitsByQuestion.get(id) ?? new Set<number>();
      set.add(visitIndex);
      hitsByQuestion.set(id, set);
    }
  }

  return questions.map((q) => {
    const hits = new Array(12).fill(false) as boolean[];
    if (!hasFrequency(q)) {
      // Sem frequência → "toda visita": marca todos os meses que TÊM visita
      // (não os 12 cegamente — mês sem visita não recebe marca).
      for (let m = 0; m < 12; m++) if (monthHasVisitBase[m]) hits[m] = true;
    } else {
      // Cada visita em que a pergunta vence marca o MÊS daquela visita.
      const set = hitsByQuestion.get(q.id);
      if (set) {
        for (const idx of set) {
          const mo = monthOfVisit[idx];
          if (mo >= 0 && mo < 12) hits[mo] = true;
        }
      }
    }
    return {
      question: q,
      hits,
      monthHasVisit: monthHasVisitBase.slice(),
      freqLabel: freqLabelFor(q),
      unit: q.unit ?? null,
      min: q.expected_min ?? null,
      max: q.expected_max ?? null,
      section: q.pmoc_section ?? null,
      group: q.pmoc_group ?? null,
    };
  });
}
