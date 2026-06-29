// Teste de EQUIVALÊNCIA (P4 — Planilha PMOC, fase de maior risco).
//
// Prova que a matriz 12 meses por-pergunta da Planilha legal (função pura da
// edge `supabase/functions/_shared/pmoc-templates/perQuestionMatrix.ts`)
// CONCORDA, mês a mês, com o motor REAL que gera/renderiza as OSs do contrato
// (`scheduleActivitiesOntoVisits` + `toActivitySpec` do front). O doc é prova de
// conformidade da Lei 13.589/2018 — a matriz TEM que bater com a OS gerada.
//
// Importa as DUAS implementações e compara sobre um calendário MENSAL de 12
// visitas. Cobre M / T / S / A, exclusão da 1ª OS (âncora F3), sem-frequência e
// a diferença DELIBERADA do legado (S por-pergunta = meses 0,6, NÃO 6,12).

import { describe, it, expect } from 'vitest';

import {
  buildPerQuestionMonthMatrix,
  generateOccurrencesPure,
  freqLabelFor,
  type MatrixQuestion,
} from '../../../supabase/functions/_shared/pmoc-templates/perQuestionMatrix';
import {
  scheduleActivitiesOntoVisits,
  type ActivitySpec,
} from './visitScheduleEngine';
import { toActivitySpec } from './visitQuestionVisibility';
import { generateOccurrences } from '../../hooks/useContracts';

// Calendário mensal de 12 visitas a partir de 01/01 (mês 0..11). Mesma âncora
// que a matriz usa quando recebe esse startDate.
const START = '2026-01-01';
// Calendário mensal LOCAL (espelha `buildMonthlyCalendar` da edge). Emite ISO com
// hora local (T00:00:00) pra que o MOTOR REAL — cujo `toDate` faz `new Date(d)` —
// parseie cada visita como meia-noite LOCAL e NÃO escorregue 1 dia em fuso
// negativo (o que dispararia overflow de fim-de-mês no setMonth). A matriz da
// edge gera o mesmo dia internamente; assim os dois lados batem em qualquer fuso.
function monthlyCalendar(start: string): string[] {
  const [y0, m0, d0] = start.split('-').map(Number);
  const out: string[] = [];
  for (let k = 0; k < 12; k++) {
    const d = new Date(y0, m0 - 1, d0);
    d.setMonth(d.getMonth() + k);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${mo}-${da}T00:00:00`);
  }
  return out;
}
const CAL = monthlyCalendar(START);

/** hits[12] do MOTOR REAL pra uma pergunta, sobre o calendário CAL. */
function engineHits(
  q: MatrixQuestion,
  excluded?: Set<string>,
): boolean[] {
  const spec: ActivitySpec = toActivitySpec(q, excluded);
  const schedule = scheduleActivitiesOntoVisits(
    CAL.map((d) => ({ date: d })),
    [spec],
  );
  const hits = new Array(12).fill(false) as boolean[];
  for (const [visitIndex, ids] of schedule) {
    if (ids.includes(q.id) && visitIndex >= 0 && visitIndex < 12) hits[visitIndex] = true;
  }
  return hits;
}

/** hits[12] da MATRIZ DA PLANILHA pra uma pergunta. */
function matrixHits(q: MatrixQuestion, excluded?: Set<string>): boolean[] {
  const rows = buildPerQuestionMonthMatrix([q], excluded, { startDate: START });
  return rows[0].hits;
}

/** Índices marcados (true) de um hits[12]. */
function marked(hits: boolean[]): number[] {
  return hits.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
}

describe('buildPerQuestionMonthMatrix — equivalência com o motor real', () => {
  it('mensal (time, freq_months=1, due_now) → 12 meses marcados, == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-mensal',
      question: 'Mensal',
      freq_kind: 'time',
      freq_months: 1,
      start_kind: 'due_now',
    };
    const m = matrixHits(q);
    expect(marked(m)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(m).toEqual(engineHits(q));
  });

  it('trimestral (freq_months=3, due_now) → meses 0,3,6,9 e == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-trim',
      question: 'Trimestral',
      freq_kind: 'time',
      freq_months: 3,
      start_kind: 'due_now',
    };
    const m = matrixHits(q);
    expect(marked(m)).toEqual([0, 3, 6, 9]);
    expect(m).toEqual(engineHits(q));
  });

  it('semestral (freq_months=6, due_now) → meses 0,6 (NÃO 6,12 do legado) e == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-sem',
      question: 'Semestral',
      freq_kind: 'time',
      freq_months: 6,
      start_kind: 'due_now',
    };
    const m = matrixHits(q);
    // DIFERENÇA DELIBERADA do ciclo-12 faseado da norma (legado): no modelo
    // por-pergunta a semestral começa NO INÍCIO (mês 0) e vence de novo em 6 —
    // exatamente o que a OS gerada mostra. O legado marcaria 6 e 12 (=fora da
    // janela). Esse é o comportamento correto e esperado.
    expect(marked(m)).toEqual([0, 6]);
    expect(m).toEqual(engineHits(q));
  });

  it('anual (freq_months=12, due_now) → só mês 0 e == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-anual',
      question: 'Anual',
      freq_kind: 'time',
      freq_months: 12,
      start_kind: 'due_now',
    };
    const m = matrixHits(q);
    expect(marked(m)).toEqual([0]);
    expect(m).toEqual(engineHits(q));
  });

  it('anual EXCLUÍDA da 1ª OS (âncora contract_start) → não marca mês 0, marca o aniversário conforme motor', () => {
    const q: MatrixQuestion = {
      id: 'q-anual-x',
      question: 'Anual excluída',
      freq_kind: 'time',
      freq_months: 12,
      // start_kind do template é ignorado quando há set de exclusão.
      start_kind: 'due_now',
    };
    const excluded = new Set(['q-anual-x']);
    const m = matrixHits(q, excluded);
    // Excluída → contract_start: 1ª meta = âncora + 12 meses = fora da janela
    // de 12 meses → NÃO marca nenhum mês. Tem que bater com o motor.
    expect(m.some(Boolean)).toBe(false);
    expect(m).toEqual(engineHits(q, excluded));
  });

  it('trimestral EXCLUÍDA da 1ª OS → âncora contract_start: meses 3,6,9 e == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-trim-x',
      question: 'Trimestral excluída',
      freq_kind: 'time',
      freq_months: 3,
      start_kind: 'due_now',
    };
    const excluded = new Set(['q-trim-x']);
    const m = matrixHits(q, excluded);
    // contract_start: 1ª meta = +3 meses (mês 3), depois 6, 9. Não entra no 0.
    expect(marked(m)).toEqual([3, 6, 9]);
    expect(m).toEqual(engineHits(q, excluded));
  });

  it('trimestral INCLUÍDA na 1ª OS (não no set) → âncora due_now: meses 0,3,6,9 e == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-trim-in',
      question: 'Trimestral incluída',
      freq_kind: 'time',
      freq_months: 3,
      start_kind: 'contract_start', // sobrescrito por due_now via set não-membro
    };
    const excluded = new Set(['outra-pergunta']);
    const m = matrixHits(q, excluded);
    expect(marked(m)).toEqual([0, 3, 6, 9]);
    expect(m).toEqual(engineHits(q, excluded));
  });

  it('pergunta SEM frequência (freq_kind null) → 12 meses marcados', () => {
    const q: MatrixQuestion = { id: 'q-null', question: 'Toda visita', freq_kind: null };
    const m = matrixHits(q);
    expect(marked(m)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('por NÚMERO de visitas (freq_visits=2, due_now) → meses pares e == motor', () => {
    const q: MatrixQuestion = {
      id: 'q-v2',
      question: 'A cada 2 visitas',
      freq_kind: 'visits',
      freq_visits: 2,
      start_kind: 'due_now',
    };
    const m = matrixHits(q);
    expect(marked(m)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(m).toEqual(engineHits(q));
  });

  it('lote misto (M/T/S/A + sem freq) concorda pergunta a pergunta com o motor', () => {
    const qs: MatrixQuestion[] = [
      { id: 'a', question: 'M', freq_kind: 'time', freq_months: 1, start_kind: 'due_now' },
      { id: 'b', question: 'T', freq_kind: 'time', freq_months: 3, start_kind: 'due_now' },
      { id: 'c', question: 'S', freq_kind: 'time', freq_months: 6, start_kind: 'due_now' },
      { id: 'd', question: 'A', freq_kind: 'time', freq_months: 12, start_kind: 'due_now' },
      { id: 'e', question: 'Toda visita', freq_kind: null },
    ];
    const rows = buildPerQuestionMonthMatrix(qs, undefined, { startDate: START });
    for (const row of rows) {
      if (row.question.freq_kind) {
        expect(row.hits).toEqual(engineHits(row.question));
      } else {
        expect(marked(row.hits)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      }
    }
  });

  it('freqLabelFor produz rótulos PT-BR esperados', () => {
    expect(freqLabelFor({ id: '1', question: null, freq_kind: 'time', freq_months: 1 })).toBe('Mensal');
    expect(freqLabelFor({ id: '2', question: null, freq_kind: 'time', freq_months: 3 })).toBe('Trimestral');
    expect(freqLabelFor({ id: '3', question: null, freq_kind: 'time', freq_months: 6 })).toBe('Semestral');
    expect(freqLabelFor({ id: '4', question: null, freq_kind: 'time', freq_months: 12 })).toBe('Anual');
    expect(freqLabelFor({ id: '5', question: null, freq_kind: null })).toBe('Toda visita');
    expect(freqLabelFor({ id: '6', question: null, freq_kind: 'visits', freq_visits: 2 })).toBe('A cada 2 visitas');
  });
});

// =============================================================================
// CADÊNCIA NÃO-MENSAL — a matriz tem que projetar as datas REAIS de visita pela
// MESMA lógica de `generateOccurrences` (useContracts.ts) e rodar o motor sobre
// elas. Prova: (1) port de datas == gerador real; (2) mensal reduz ao calendário
// atual de 12 visitas (não-regressão); (3) bimestral e a-cada-15-dias batem com
// o motor real sobre as MESMAS datas que `generateOccurrences` gera.
// =============================================================================

/** Date (campos locais Y-M-D) → 'YYYY-MM-DD'. */
function fmt(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/**
 * hits[12] do MOTOR REAL pra uma pergunta sobre as datas REAIS `dates`
 * (geradas por `generateOccurrences`), mapeadas pro mês de cada visita relativo
 * ao mês de início. Espelho da agregação que a matriz faz.
 */
function engineHitsOnDates(
  q: MatrixQuestion,
  dates: Date[],
  excluded?: Set<string>,
): boolean[] {
  const spec: ActivitySpec = toActivitySpec(q, excluded);
  // Alimenta o motor com as MESMAS datas (T00:00:00 = meia-noite LOCAL, mesmo
  // dia que a matriz vê ao parsear 'YYYY-MM-DD' como meia-dia local).
  const schedule = scheduleActivitiesOntoVisits(
    dates.map((d) => ({ date: `${fmt(d)}T00:00:00` })),
    [spec],
  );
  const anchorY = dates[0].getFullYear();
  const anchorM = dates[0].getMonth();
  const hits = new Array(12).fill(false) as boolean[];
  for (const [visitIndex, ids] of schedule) {
    if (!ids.includes(q.id)) continue;
    const d = dates[visitIndex];
    const off = (d.getFullYear() - anchorY) * 12 + (d.getMonth() - anchorM);
    if (off >= 0 && off < 12) hits[off] = true;
  }
  return hits;
}

describe('buildPerQuestionMonthMatrix — cadência não-mensal (datas reais)', () => {
  it('port generateOccurrencesPure == generateOccurrences real (mensal/bimestral/15 dias)', () => {
    const start = new Date(2026, 0, 1); // 2026-01-01 local
    for (const [type, value] of [
      ['months', 1],
      ['months', 2],
      ['days', 15],
      ['days', 7],
    ] as const) {
      const real = generateOccurrences(start, type, value, 12).map(fmt);
      const port = generateOccurrencesPure(start, type, value, 12).map(fmt);
      expect(port).toEqual(real);
    }
  });

  it('port == real também em início de FIM DE MÊS (clamp do addMonths)', () => {
    // 31/01: +1 mês deve CLAMPAR pra 28/02 (date-fns), não transbordar pra 03/03.
    const start = new Date(2026, 0, 31);
    const real = generateOccurrences(start, 'months', 1, 12).map(fmt);
    const port = generateOccurrencesPure(start, 'months', 1, 12).map(fmt);
    expect(port).toEqual(real);
    expect(port[1]).toBe('2026-02-28'); // clampou
  });

  it('MENSAL via cadência reduz ao calendário atual (não-regressão): trimestral 0,3,6,9', () => {
    const q: MatrixQuestion = {
      id: 'q-trim',
      question: 'Trimestral',
      freq_kind: 'time',
      freq_months: 3,
      start_kind: 'due_now',
    };
    // Passando a cadência mensal explicitamente — tem que dar o MESMO que hoje
    // (sem cadência, branch do calendário mensal legado).
    const viaCadence = buildPerQuestionMonthMatrix([q], undefined, {
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: 12,
    })[0];
    const viaLegacy = buildPerQuestionMonthMatrix([q], undefined, {
      startDate: START,
    })[0];
    expect(viaCadence.hits).toEqual(viaLegacy.hits);
    expect(marked(viaCadence.hits)).toEqual([0, 3, 6, 9]);
    // Mensal → todos os 12 meses têm visita.
    expect(viaCadence.monthHasVisit.every(Boolean)).toBe(true);
  });

  it('BIMESTRAL (months/2): visitas só nos meses pares; ímpares sem visita; == motor', () => {
    const start = new Date(2026, 0, 1);
    const dates = generateOccurrences(start, 'months', 2, 12);
    const visitDates = dates.map(fmt);

    const q: MatrixQuestion = {
      id: 'q-mensal-pergunta',
      question: 'Pergunta mensal numa cadência bimestral',
      freq_kind: 'time',
      freq_months: 1, // vence "sempre que possível" → toda visita real (a cada 2 meses)
      start_kind: 'due_now',
    };
    const row = buildPerQuestionMonthMatrix([q], undefined, { visitDates })[0];

    // Meses com visita: 0,2,4,6,8,10. Ímpares NÃO têm visita.
    expect(marked(row.monthHasVisit)).toEqual([0, 2, 4, 6, 8, 10]);
    // A pergunta vence nas visitas reais → mesmos meses pares.
    expect(marked(row.hits)).toEqual([0, 2, 4, 6, 8, 10]);
    // Concorda com o motor real sobre as MESMAS datas.
    expect(row.hits).toEqual(engineHitsOnDates(q, dates));
  });

  it('BIMESTRAL: semestral por-pergunta cai em 0,6 (visitas reais 0,2,4,6,8,10) e == motor', () => {
    const start = new Date(2026, 0, 1);
    const dates = generateOccurrences(start, 'months', 2, 12);
    const visitDates = dates.map(fmt);
    const q: MatrixQuestion = {
      id: 'q-sem',
      question: 'Semestral',
      freq_kind: 'time',
      freq_months: 6,
      start_kind: 'due_now',
    };
    const row = buildPerQuestionMonthMatrix([q], undefined, { visitDates })[0];
    expect(marked(row.hits)).toEqual([0, 6]);
    expect(row.hits).toEqual(engineHitsOnDates(q, dates));
    // Mês ímpar nunca marca (não há visita lá).
    for (const odd of [1, 3, 5, 7, 9, 11]) expect(row.hits[odd]).toBe(false);
  });

  it('BIMESTRAL: pergunta SEM frequência marca só meses COM visita (não os 12)', () => {
    const start = new Date(2026, 0, 1);
    const visitDates = generateOccurrences(start, 'months', 2, 12).map(fmt);
    const q: MatrixQuestion = { id: 'q-null', question: 'Toda visita', freq_kind: null };
    const row = buildPerQuestionMonthMatrix([q], undefined, { visitDates })[0];
    expect(marked(row.hits)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(marked(row.monthHasVisit)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('A CADA 15 DIAS (days/15): ~2 visitas/mês; mês marca se QUALQUER visita vence; == motor', () => {
    const start = new Date(2026, 0, 1);
    const dates = generateOccurrences(start, 'days', 15, 12);
    const visitDates = dates.map(fmt);
    // Há mais de uma visita por mês → vários meses têm visita.
    expect(dates.length).toBeGreaterThan(12);

    const q: MatrixQuestion = {
      id: 'q-quinzenal',
      question: 'Vence a cada visita (cadência 15 dias)',
      freq_kind: null, // toda visita
    };
    const row = buildPerQuestionMonthMatrix([q], undefined, { visitDates })[0];
    // Todo mês dentro do horizonte tem ao menos 1 visita a cada 15 dias.
    expect(row.monthHasVisit.every(Boolean)).toBe(true);
    expect(row.hits.every(Boolean)).toBe(true);

    // Pergunta MENSAL sobre cadência de 15 dias: vence ~1×/mês → concorda com o
    // motor sobre as MESMAS datas reais.
    const qm: MatrixQuestion = {
      id: 'q-mensal-15',
      question: 'Mensal numa cadência de 15 dias',
      freq_kind: 'time',
      freq_months: 1,
      start_kind: 'due_now',
    };
    const rowM = buildPerQuestionMonthMatrix([qm], undefined, { visitDates })[0];
    expect(rowM.hits).toEqual(engineHitsOnDates(qm, dates));
    // Vence em todos os 12 meses (uma vez por mês basta pra marcar).
    expect(rowM.hits.every(Boolean)).toBe(true);
  });

  it('A CADA 15 DIAS: trimestral por-pergunta concorda com o motor sobre as datas reais', () => {
    const start = new Date(2026, 0, 1);
    const dates = generateOccurrences(start, 'days', 15, 12);
    const visitDates = dates.map(fmt);
    const q: MatrixQuestion = {
      id: 'q-trim-15',
      question: 'Trimestral numa cadência de 15 dias',
      freq_kind: 'time',
      freq_months: 3,
      start_kind: 'due_now',
    };
    const row = buildPerQuestionMonthMatrix([q], undefined, { visitDates })[0];
    expect(row.hits).toEqual(engineHitsOnDates(q, dates));
    // Trimestral due_now → meses 0,3,6,9 (a 1ª visita ≥ meta cai nesses meses).
    expect(marked(row.hits)).toEqual([0, 3, 6, 9]);
  });

  it('cadência projetada internamente (sem visitDates) == projeção externa via generateOccurrences', () => {
    // Garante que buildCadenceCalendar (interno) usa as MESMAS datas do gerador.
    const start = new Date(2026, 0, 1);
    const dates = generateOccurrences(start, 'months', 2, 12);
    const q: MatrixQuestion = {
      id: 'q-cmp',
      question: 'Trimestral',
      freq_kind: 'time',
      freq_months: 3,
      start_kind: 'due_now',
    };
    const internal = buildPerQuestionMonthMatrix([q], undefined, {
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 2,
      horizonMonths: 12,
    })[0];
    const external = buildPerQuestionMonthMatrix([q], undefined, {
      visitDates: dates.map(fmt),
    })[0];
    expect(internal.hits).toEqual(external.hits);
    expect(internal.monthHasVisit).toEqual(external.monthHasVisit);
  });
});
