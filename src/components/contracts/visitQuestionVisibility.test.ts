import { describe, it, expect } from 'vitest';

import { computeVisibleQuestionIds, type VisibilityQuestion } from './visitQuestionVisibility';
import { generateOccurrences } from '@/hooks/useContracts';

// ──────────────────────────────────────────────────────────────────────────
// Cenário base: contrato de cadência 14 dias, horizonte 12 meses, início 01/01.
// O helper agora recebe as DATAS REAIS das visitas (FIX 2) em vez de reconstruir
// o calendário. Aqui geramos as datas com `generateOccurrences` só pra ter um
// conjunto realista de visitas; em produção viriam dos `scheduled_date` das OSs.
// ──────────────────────────────────────────────────────────────────────────

/** Day key 'YYYY-MM-DD' de um Date local (espelha o helper). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Datas reais das visitas (14 dias, 12 meses), como strings 'YYYY-MM-DD'. */
const CAL = generateOccurrences(new Date('2026-01-01T12:00:00'), 'days', 14, 12);
const VISIT_DATES = CAL.map(dayKey);
const dateOfVisit = (idx: number) => VISIT_DATES[idx];

describe('computeVisibleQuestionIds', () => {
  it('pergunta SEM frequência aparece sempre (em qualquer visita)', () => {
    const questions: VisibilityQuestion[] = [{ id: 'q-null' }];
    // visita 0
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions }),
    ).toEqual(new Set(['q-null']));
    // visita 5
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(5), questions }),
    ).toEqual(new Set(['q-null']));
  });

  it('trimestral (por tempo) em visitas de 14 dias: NÃO aparece nas primeiras, aparece depois', () => {
    const questions: VisibilityQuestion[] = [
      { id: 'q-trim', freq_kind: 'time', freq_months: 3, start_kind: 'contract_start' },
    ];

    // Visita 0 (01/01): trimestral com início no contrato ainda não venceu.
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions }).has('q-trim'),
    ).toBe(false);

    // Visita 2 (~29/01, < 3 meses): ainda não venceu.
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(2), questions }).has('q-trim'),
    ).toBe(false);

    // Conta em quantas das ~26 visitas do horizonte a trimestral aparece —
    // deve ser MENOS que o total (filtrou) e MAIS que zero (apareceu às vezes).
    const appearances = VISIT_DATES.filter((_, idx) =>
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(idx), questions }).has('q-trim'),
    ).length;
    expect(appearances).toBeGreaterThan(0);
    expect(appearances).toBeLessThan(VISIT_DATES.length);
  });

  it('a cada N dias (Personalizado) aparece nas visitas certas e some nas outras', () => {
    // freqDays=17 sobre visitas de 14 dias, contract_start. Espelha o motor
    // (visitScheduleEngine.test.ts cenário do CEO): metas 17,34,51,68,85 caem
    // nos índices [2,3,4,5]; 85 estaria fora do horizonte de 7, mas aqui o
    // horizonte é grande, então só conferimos presença/ausência relativa.
    const questions: VisibilityQuestion[] = [
      { id: 'q-d17', freq_kind: 'time', freq_days: 17, start_kind: 'contract_start' },
    ];
    // Visita 0 (01/01): nada venceu ainda.
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions }).has('q-d17'),
    ).toBe(false);
    // Visita 2 (29/01 ≥ meta 18/01): vence.
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(2), questions }).has('q-d17'),
    ).toBe(true);
    // Aparece em algumas, não em todas.
    const appearances = VISIT_DATES.filter((_, idx) =>
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(idx), questions }).has('q-d17'),
    ).length;
    expect(appearances).toBeGreaterThan(0);
    expect(appearances).toBeLessThan(VISIT_DATES.length);
  });

  it('por nº de visitas (a cada 2) aparece em visitas alternadas a partir do início', () => {
    const questions: VisibilityQuestion[] = [
      { id: 'q-v2', freq_kind: 'visits', freq_visits: 2, start_kind: 'contract_start' },
    ];
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions }).has('q-v2'),
    ).toBe(true); // visita 0
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(1), questions }).has('q-v2'),
    ).toBe(false); // visita 1
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(2), questions }).has('q-v2'),
    ).toBe(true); // visita 2
  });

  it('pergunta já respondida aparece SEMPRE, mesmo quando a frequência não venceria', () => {
    const questions: VisibilityQuestion[] = [
      { id: 'q-trim', freq_kind: 'time', freq_months: 3, start_kind: 'contract_start' },
    ];
    // Visita 0: trimestral não venceria...
    const sem = computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions });
    expect(sem.has('q-trim')).toBe(false);
    // ...mas se já foi respondida, aparece (histórico protegido).
    const com = computeVisibleQuestionIds({
      visitDates: VISIT_DATES,
      scheduledDate: dateOfVisit(0),
      questions,
      answeredQuestionIds: new Set(['q-trim']),
    });
    expect(com.has('q-trim')).toBe(true);
  });

  it('data que NÃO casa com nenhuma visita real → mostra TUDO', () => {
    const questions: VisibilityQuestion[] = [
      { id: 'q-trim', freq_kind: 'time', freq_months: 3, start_kind: 'contract_start' },
      { id: 'q-null' },
    ];
    const result = computeVisibleQuestionIds({
      visitDates: VISIT_DATES,
      scheduledDate: '2026-01-07', // entre a visita 0 (01/01) e a 1 (15/01) — não casa
      questions,
    });
    expect(result).toEqual(new Set(['q-trim', 'q-null']));
  });

  it('sem datas de visita → mostra TUDO (na dúvida, mostra)', () => {
    const questions: VisibilityQuestion[] = [
      { id: 'q-trim', freq_kind: 'time', freq_months: 3, start_kind: 'contract_start' },
      { id: 'q-null' },
    ];
    // Sem visitDates → fallback.
    const result = computeVisibleQuestionIds({
      visitDates: [],
      scheduledDate: '2026-03-01',
      questions,
    });
    expect(result).toEqual(new Set(['q-trim', 'q-null']));
  });

  it('datas reais fora de ordem / com duplicatas são normalizadas', () => {
    // Embaralha e duplica as datas — o helper ordena e deduplica por dia.
    const shuffled = [VISIT_DATES[2], VISIT_DATES[0], VISIT_DATES[2], VISIT_DATES[1]];
    const questions: VisibilityQuestion[] = [
      { id: 'q-v2', freq_kind: 'visits', freq_visits: 2, start_kind: 'contract_start' },
    ];
    // Ordenadas: [v0, v1, v2] → a cada 2 visitas aparece em v0 e v2.
    expect(
      computeVisibleQuestionIds({ visitDates: shuffled, scheduledDate: VISIT_DATES[0], questions }).has('q-v2'),
    ).toBe(true);
    expect(
      computeVisibleQuestionIds({ visitDates: shuffled, scheduledDate: VISIT_DATES[1], questions }).has('q-v2'),
    ).toBe(false);
    expect(
      computeVisibleQuestionIds({ visitDates: shuffled, scheduledDate: VISIT_DATES[2], questions }).has('q-v2'),
    ).toBe(true);
  });

  it('mix: sem-freq sempre + com-freq filtrada na mesma visita', () => {
    const questions: VisibilityQuestion[] = [
      { id: 'q-null' },
      { id: 'q-toda-visita', freq_kind: 'visits', freq_visits: 1, start_kind: 'contract_start' },
      { id: 'q-trim', freq_kind: 'time', freq_months: 3, start_kind: 'contract_start' },
    ];
    // Visita 0: sem-freq + a-cada-1-visita aparecem; trimestral não.
    const v0 = computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions });
    expect(v0.has('q-null')).toBe(true);
    expect(v0.has('q-toda-visita')).toBe(true);
    expect(v0.has('q-trim')).toBe(false);
  });

  it('lista de perguntas vazia → conjunto vazio', () => {
    expect(
      computeVisibleQuestionIds({ visitDates: VISIT_DATES, scheduledDate: dateOfVisit(0), questions: [] }),
    ).toEqual(new Set());
  });
});
