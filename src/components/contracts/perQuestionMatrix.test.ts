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
  freqLabelFor,
  type MatrixQuestion,
} from '../../../supabase/functions/_shared/pmoc-templates/perQuestionMatrix';
import {
  scheduleActivitiesOntoVisits,
  type ActivitySpec,
} from './visitScheduleEngine';
import { toActivitySpec } from './visitQuestionVisibility';

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
