import { describe, it, expect } from 'vitest';

import {
  scheduleActivitiesOntoVisits,
  type ActivitySpec,
  type VisitInput,
} from './visitScheduleEngine';

// Motor PMOC mês-base atual, pra o teste de equivalência (superconjunto).
import {
  positionForMonth,
  dueLevelsForPosition,
  type FreqCode,
} from '@/hooks/useContracts';

// ──────────────────────────────────────────────────────────────────────────
// Helpers de teste
// ──────────────────────────────────────────────────────────────────────────

/** addMonths puro (mesma semântica do date-fns usado no motor real). */
function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** addDays puro. */
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Gera N visitas começando em `start`, a cada `stepDays` dias. */
function visitsEveryDays(start: Date, stepDays: number, count: number): VisitInput[] {
  return Array.from({ length: count }, (_, i) => ({ date: addDays(start, i * stepDays) }));
}

/** Gera N visitas mensais começando em `start`. */
function visitsMonthly(start: Date, count: number): VisitInput[] {
  return Array.from({ length: count }, (_, i) => ({ date: addMonths(start, i) }));
}

/** Conjunto de índices (0-based) em que a atividade `id` venceu. */
function dueIndexes(map: Map<number, string[]>, id: string): number[] {
  const out: number[] = [];
  for (const [idx, ids] of map) {
    if (ids.includes(id)) out.push(idx);
  }
  return out.sort((a, b) => a - b);
}

const START = new Date('2026-01-15T12:00:00');

// ──────────────────────────────────────────────────────────────────────────
// 1. Visitas a cada 14 dias por ~6 meses; trimestral 'contract_start'.
//    NÃO vence em toda visita; 1º vencimento só depois de ~90 dias (~7ª visita).
// ──────────────────────────────────────────────────────────────────────────

describe('por tempo — trimestral contract_start sobre visitas de 14 dias', () => {
  // ~6 meses = ~13 visitas de 14 dias (13×14 = 182 dias ≈ 6 meses).
  const visits = visitsEveryDays(START, 14, 13);
  const trimestral: ActivitySpec = {
    id: 'T',
    freqKind: 'time',
    freqMonths: 3,
    startKind: 'contract_start',
  };

  it('NÃO vence em toda visita', () => {
    const map = scheduleActivitiesOntoVisits(visits, [trimestral]);
    const due = dueIndexes(map, 'T');
    expect(due.length).toBeLessThan(visits.length);
  });

  it('1º vencimento só depois de ~90 dias (em torno da 7ª visita, índice ~6)', () => {
    const map = scheduleActivitiesOntoVisits(visits, [trimestral]);
    const due = dueIndexes(map, 'T');
    expect(due.length).toBeGreaterThan(0);
    const first = due[0];
    // 3 meses (15/jan → 15/abr). A visita de índice 6 cai em 15/jan+84d = 09/abr
    // (ainda não passou); a de índice 7 = 23/abr (já passou). Aceita 6 ou 7 pela
    // borda do mês, mas garante que NÃO é a 1ª visita.
    expect(first).toBeGreaterThanOrEqual(6);
    expect(first).toBeLessThanOrEqual(7);
  });

  it('o intervalo entre vencimentos consecutivos é ~3 meses (modelo desde a última execução)', () => {
    const map = scheduleActivitiesOntoVisits(visits, [trimestral]);
    const due = dueIndexes(map, 'T');
    // Com 13 visitas de 14 dias (~6 meses), cai ~2 vezes.
    expect(due.length).toBeGreaterThanOrEqual(1);
    if (due.length >= 2) {
      const dias = (visits[due[1]].date as Date).getTime() - (visits[due[0]].date as Date).getTime();
      const dDias = dias / (1000 * 60 * 60 * 24);
      expect(dDias).toBeGreaterThanOrEqual(84); // >= 6 visitas de gap
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Atividade mensal, visitas a cada 14 dias → ~1 a cada 2 visitas.
// ──────────────────────────────────────────────────────────────────────────

describe('por tempo — mensal sobre visitas de 14 dias (~1 a cada 2)', () => {
  const visits = visitsEveryDays(START, 14, 12); // ~6 meses
  const mensal: ActivitySpec = { id: 'M', freqKind: 'time', freqMonths: 1, startKind: 'contract_start' };

  it('vence aproximadamente 1 a cada 2 visitas', () => {
    const map = scheduleActivitiesOntoVisits(visits, [mensal]);
    const due = dueIndexes(map, 'M');
    // 12 visitas de 14d = 154 dias ≈ 5 meses → ~5 vencimentos.
    expect(due.length).toBeGreaterThanOrEqual(4);
    expect(due.length).toBeLessThanOrEqual(6);
    // Nenhum par de vencimentos consecutivos com gap de só 1 visita (14 dias).
    for (let k = 1; k < due.length; k++) {
      expect(due[k] - due[k - 1]).toBeGreaterThanOrEqual(2);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. "Toda visita": freqMonths pequeno OU freqVisits=1 → todas as visitas.
// ──────────────────────────────────────────────────────────────────────────

describe('toda visita', () => {
  const visits = visitsEveryDays(START, 14, 8);

  it('freqVisits=1 (com due_now) → toda visita', () => {
    const a: ActivitySpec = { id: 'V1', freqKind: 'visits', freqVisits: 1, startKind: 'due_now' };
    const map = scheduleActivitiesOntoVisits(visits, [a]);
    expect(dueIndexes(map, 'V1')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('freqVisits=1 (contract_start é equivalente p/ visitas) → toda visita', () => {
    const a: ActivitySpec = { id: 'V1c', freqKind: 'visits', freqVisits: 1, startKind: 'contract_start' };
    const map = scheduleActivitiesOntoVisits(visits, [a]);
    expect(dueIndexes(map, 'V1c')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Anual 'due_now' → 1ª visita.
// ──────────────────────────────────────────────────────────────────────────

describe('anual due_now', () => {
  it('começa vencida → 1ª visita (índice 0)', () => {
    const visits = visitsMonthly(START, 13);
    const anual: ActivitySpec = { id: 'A', freqKind: 'time', freqMonths: 12, startKind: 'due_now' };
    const map = scheduleActivitiesOntoVisits(visits, [anual]);
    // due_now: vence no mês 0; e de novo no mês 12 (12 meses depois).
    expect(dueIndexes(map, 'A')).toEqual([0, 12]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. Anual 'contract_start' num contrato de 6 meses → não aparece.
// ──────────────────────────────────────────────────────────────────────────

describe('anual contract_start em contrato de 6 meses', () => {
  it('1º vencimento cairia no mês 12 → nunca aparece', () => {
    const visits = visitsMonthly(START, 7); // meses 0..6 (6 meses de contrato)
    const anual: ActivitySpec = { id: 'A6', freqKind: 'time', freqMonths: 12, startKind: 'contract_start' };
    const map = scheduleActivitiesOntoVisits(visits, [anual]);
    expect(dueIndexes(map, 'A6')).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. freqKind='visits', freqVisits=6 → índices 0,6,12 (convenção 0-based, 1ª
//    ocorrência na 1ª visita aplicável).
// ──────────────────────────────────────────────────────────────────────────

describe('por nº de visitas — a cada 6 visitas', () => {
  it('contract_start → índices 0, 6, 12 (0-based; 1ª ocorrência na 1ª visita)', () => {
    const visits = visitsEveryDays(START, 14, 15); // 15 visitas
    const a: ActivitySpec = { id: 'V6', freqKind: 'visits', freqVisits: 6, startKind: 'contract_start' };
    const map = scheduleActivitiesOntoVisits(visits, [a]);
    expect(dueIndexes(map, 'V6')).toEqual([0, 6, 12]);
  });

  it('visit_n=3 → 1ª ocorrência na visita 3 (índice 2), depois a cada 6: 2, 8, 14', () => {
    const visits = visitsEveryDays(START, 14, 15);
    const a: ActivitySpec = { id: 'V6n', freqKind: 'visits', freqVisits: 6, startKind: 'visit_n', startVisit: 3 };
    const map = scheduleActivitiesOntoVisits(visits, [a]);
    expect(dueIndexes(map, 'V6n')).toEqual([2, 8, 14]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. EQUIVALÊNCIA PMOC — cadência mensal + atividades M/T/S/A com fase ancorada
//    igual ao ciclo de 12 do PMOC ⇒ o motor novo BATE com positionForMonth/
//    dueLevelsForPosition. Prova que o motor novo é superconjunto do atual.
// ──────────────────────────────────────────────────────────────────────────

describe('EQUIVALÊNCIA PMOC — cadência mensal, ciclo de 12', () => {
  // Período em meses de cada nível PMOC.
  const PERIOD: Record<Exclude<FreqCode, 'E'>, number> = { M: 1, T: 3, S: 6, A: 12 };

  /**
   * Converte (freqCode, pmocStartVisit) → ActivitySpec equivalente no motor novo,
   * para cadência MENSAL. O PMOC é por POSIÇÃO no ciclo de 12; o nível P (período
   * em meses) vence quando a posição é múltiplo de P (pos==12 p/ anual, pos%6==0
   * p/ semestral, etc.). Em termos de mês k: vence quando (sv-1+k) % P == P-1.
   * 1ª ocorrência em k0 = (P-1 - (sv-1)) mod P; daí a cada P meses (= P visitas
   * mensais). Mapeia pra startKind='visit_n', startVisit=k0+1, freqMonths=P.
   */
  function pmocToSpec(code: Exclude<FreqCode, 'E'>, sv: number): ActivitySpec {
    const P = PERIOD[code];
    const k0 = (((P - 1 - (sv - 1)) % P) + P) % P; // 1º mês (0-based) em que vence
    return {
      id: `${code}-sv${sv}`,
      freqKind: 'time',
      freqMonths: P,
      startKind: 'visit_n',
      startVisit: k0 + 1, // 1-based
    };
  }

  const HORIZON = 24; // meses 0..24
  const visits = visitsMonthly(START, HORIZON + 1);

  const codes: Exclude<FreqCode, 'E'>[] = ['M', 'T', 'S', 'A'];
  const startVisits = [1, 3, 6, 12];

  for (const sv of startVisits) {
    for (const code of codes) {
      it(`freq ${code}, startVisit ${sv} — motor novo == dueLevelsForPosition`, () => {
        const spec = pmocToSpec(code, sv);
        const map = scheduleActivitiesOntoVisits(visits, [spec]);
        const novo = dueIndexes(map, spec.id);

        // Referência PMOC: meses em que o nível `code` é devido.
        const ref: number[] = [];
        for (let k = 0; k <= HORIZON; k++) {
          const pos = positionForMonth(sv, k);
          if (dueLevelsForPosition(pos).has(code)) ref.push(k);
        }
        expect(novo).toEqual(ref);
      });
    }
  }

  it('plano M/T/S/A combinado (start=12) — 1ª visita = todos os níveis (revisão completa)', () => {
    const specs = codes.map((c) => pmocToSpec(c, 12));
    const map = scheduleActivitiesOntoVisits(visits, specs);
    const m0 = (map.get(0) ?? []).sort();
    expect(m0).toEqual(specs.map((s) => s.id).sort());
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Pureza / robustez
// ──────────────────────────────────────────────────────────────────────────

describe('pureza e bordas', () => {
  it('sem visitas → Map vazio', () => {
    expect(scheduleActivitiesOntoVisits([], [{ id: 'X', freqKind: 'time', freqMonths: 1, startKind: 'due_now' }]).size).toBe(0);
  });

  it('determinístico: 2 execuções dão o mesmo resultado', () => {
    const visits = visitsEveryDays(START, 14, 10);
    const acts: ActivitySpec[] = [
      { id: 'a', freqKind: 'time', freqMonths: 2, startKind: 'contract_start' },
      { id: 'b', freqKind: 'visits', freqVisits: 3, startKind: 'due_now' },
    ];
    const r1 = scheduleActivitiesOntoVisits(visits, acts);
    const r2 = scheduleActivitiesOntoVisits(visits, acts);
    expect([...r1.entries()]).toEqual([...r2.entries()]);
  });

  it('aceita datas em string ISO', () => {
    const visits: VisitInput[] = [{ date: '2026-01-15' }, { date: '2026-01-29' }, { date: '2026-02-12' }];
    const a: ActivitySpec = { id: 's', freqKind: 'visits', freqVisits: 2, startKind: 'due_now' };
    const map = scheduleActivitiesOntoVisits(visits, [a]);
    expect(dueIndexes(map, 's')).toEqual([0, 2]);
  });

  it('freqMonths<=0 (eventual) → nunca aparece', () => {
    const visits = visitsMonthly(START, 6);
    const a: ActivitySpec = { id: 'e', freqKind: 'time', freqMonths: 0, startKind: 'due_now' };
    expect(scheduleActivitiesOntoVisits(visits, [a]).size).toBe(0);
  });
});
