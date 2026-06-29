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
   * Quando ausente, a matriz monta um calendário MENSAL de 12 visitas a partir
   * de `startDate` (ou de uma âncora neutra). Pra cadência NÃO-mensal, a edge
   * projeta as datas reais e passa aqui (mês de cada visita marca a coluna).
   */
  visitDates?: string[];
  /** Início do contrato/1ª visita (âncora) quando `visitDates` é gerado aqui. */
  startDate?: string;
}

export interface MatrixRow {
  question: MatrixQuestion;
  /** 12 posições (mês 0..11): true = a pergunta vence naquele mês. */
  hits: boolean[];
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
  // Calendário das visitas: usa as datas reais (cadência não-mensal projetada)
  // ou monta um calendário mensal de 12 visitas a partir do início.
  const visitDates =
    opts.visitDates && opts.visitDates.length > 0
      ? opts.visitDates.slice(0, 12)
      : buildMonthlyCalendar(opts.startDate);

  // Quantas colunas (meses) a matriz tem. Mensal = 12; se vierem menos visitas
  // reais (cadência não-mensal num horizonte curto), respeita o que veio.
  const monthCount = Math.min(12, Math.max(1, visitDates.length));

  // Roda o motor UMA vez pras perguntas com frequência.
  const freqQuestions = questions.filter(hasFrequency);
  const specs = freqQuestions.map((q) => toActivitySpec(q, excludedQuestionIds));
  const schedule = scheduleActivitiesOntoVisits(visitDates, specs);

  // Inverte o schedule: visitIndex → ids ⇒ id → Set<visitIndex>.
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
      // Sem frequência → "toda visita": todos os meses cobertos pelo calendário.
      for (let k = 0; k < monthCount; k++) hits[k] = true;
    } else {
      const set = hitsByQuestion.get(q.id);
      if (set) for (const idx of set) if (idx >= 0 && idx < 12) hits[idx] = true;
    }
    return {
      question: q,
      hits,
      freqLabel: freqLabelFor(q),
      unit: q.unit ?? null,
      min: q.expected_min ?? null,
      max: q.expected_max ?? null,
      section: q.pmoc_section ?? null,
      group: q.pmoc_group ?? null,
    };
  });
}
