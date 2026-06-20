import { describe, it, expect } from 'vitest';

import {
  positionForMonth,
  dueLevelsForPosition,
  isActivityDueForMachine,
  buildPerMachineVisits,
  generateGroupedVisits,
  machinesFromItemRows,
  type MachineInput,
  type MachinePlanActivity,
  type PlanActivityInput,
  type FreqCode,
} from './useContracts';

// ──────────────────────────────────────────────────────────────────────────
// Helpers de teste
// ──────────────────────────────────────────────────────────────────────────

const START = new Date('2026-01-15T12:00:00');

/** Atalho pra criar uma atividade do plano com freq_code e seção. */
function act(
  description: string,
  freq: FreqCode,
  opts: Partial<PlanActivityInput> = {},
): PlanActivityInput {
  return { description, freq_code: freq, ...opts };
}

/** Atalho pra MachinePlanActivity (legado: sem contract_item_id, per_eq=true). */
function legacyAct(
  input: PlanActivityInput,
  planActivityId: string | null = null,
): MachinePlanActivity {
  return { input, planActivityId, contractItemId: null, appliesPerEquipment: true };
}

/** Atalho pra atividade própria de uma máquina (novo formato, Fase 3). */
function ownAct(
  input: PlanActivityInput,
  contractItemId: string,
  planActivityId: string | null = null,
): MachinePlanActivity {
  return { input, planActivityId, contractItemId, appliesPerEquipment: true };
}

/** Atalho pra atividade de LOCAL (sem máquina dona, per_eq=false). */
function localAct(
  input: PlanActivityInput,
  planActivityId: string | null = null,
): MachinePlanActivity {
  return { input, planActivityId, contractItemId: null, appliesPerEquipment: false };
}

const machine = (
  contractItemId: string,
  equipmentId: string | null,
  pmocScope: 'ac' | 'full',
  pmocStartVisit: number,
): MachineInput => ({ contractItemId, equipmentId, pmocScope, pmocStartVisit });

// ──────────────────────────────────────────────────────────────────────────
// Funções puras de posição/nível
// ──────────────────────────────────────────────────────────────────────────

describe('positionForMonth', () => {
  it('start=12 → mês 0 cai na posição 12 (anual)', () => {
    expect(positionForMonth(12, 0)).toBe(12);
    expect(positionForMonth(12, 1)).toBe(1);
    expect(positionForMonth(12, 3)).toBe(3);
    expect(positionForMonth(12, 12)).toBe(12);
    expect(positionForMonth(12, 13)).toBe(1);
  });

  it('start=1 → mês 0 cai na posição 1 (mensal)', () => {
    expect(positionForMonth(1, 0)).toBe(1);
    expect(positionForMonth(1, 2)).toBe(3);
    expect(positionForMonth(1, 11)).toBe(12);
    expect(positionForMonth(1, 12)).toBe(1);
  });

  it('valor inválido cai em start=12', () => {
    expect(positionForMonth(0, 0)).toBe(12);
    expect(positionForMonth(NaN, 0)).toBe(12);
  });
});

describe('dueLevelsForPosition', () => {
  it('posição 1 = só mensal', () => {
    expect([...dueLevelsForPosition(1)].sort()).toEqual(['M']);
  });
  it('posição 3/9 = mensal + trimestral', () => {
    expect([...dueLevelsForPosition(3)].sort()).toEqual(['M', 'T']);
    expect([...dueLevelsForPosition(9)].sort()).toEqual(['M', 'T']);
  });
  it('posição 6 = mensal + trimestral + semestral', () => {
    expect([...dueLevelsForPosition(6)].sort()).toEqual(['M', 'S', 'T']);
  });
  it('posição 12 = todos (mensal + trim + sem + anual)', () => {
    expect([...dueLevelsForPosition(12)].sort()).toEqual(['A', 'M', 'S', 'T']);
  });
});

describe('isActivityDueForMachine', () => {
  it('mensal sempre devida', () => {
    for (let k = 0; k <= 12; k++) {
      expect(isActivityDueForMachine({ freq_code: 'M' }, 12, k)).toBe(true);
    }
  });
  it('anual com start=12 só vence nos meses 0 e 12', () => {
    const due: number[] = [];
    for (let k = 0; k <= 24; k++) {
      if (isActivityDueForMachine({ freq_code: 'A' }, 12, k)) due.push(k);
    }
    expect(due).toEqual([0, 12, 24]);
  });
  it('anual com start=1 só vence no mês 11 (posição 12)', () => {
    const due: number[] = [];
    for (let k = 0; k <= 24; k++) {
      if (isActivityDueForMachine({ freq_code: 'A' }, 1, k)) due.push(k);
    }
    expect(due).toEqual([11, 23]);
  });
  it("eventual ('E') nunca vence", () => {
    for (let k = 0; k <= 12; k++) {
      expect(isActivityDueForMachine({ freq_code: 'E' }, 12, k)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// (a) PRESERVAÇÃO: legado start=12 == motor modular global atual
// ──────────────────────────────────────────────────────────────────────────

describe('PRESERVAÇÃO — legado start=12 == motor atual', () => {
  // Plano legado típico: M, T, S, A (sem contract_item_id, per_eq=true).
  const planInputs: PlanActivityInput[] = [
    act('Limpar filtro', 'M', { section: 'condicionadores' }),
    act('Verificar dreno', 'T', { section: 'condicionadores' }),
    act('Higienizar serpentina', 'S', { section: 'condicionadores' }),
    act('Revisão completa', 'A', { section: 'condicionadores' }),
  ];
  const HORIZON = 12;

  it('os MESES gerados batem exatamente com generateGroupedVisits', () => {
    // Referência: motor modular global atual.
    const ref = generateGroupedVisits(START, HORIZON, planInputs);
    const refMonths = ref.map(v => v.date.getTime());

    // Motor por máquina: 2 máquinas 'ac' start=12, plano legado.
    const machines: MachineInput[] = [
      machine('item-A', 'eq-A', 'ac', 12),
      machine('item-B', 'eq-B', 'ac', 12),
    ];
    const acts = planInputs.map(legacyAct);
    const out = buildPerMachineVisits(START, HORIZON, machines, acts);
    const outMonths = out.map(v => v.date.getTime());

    expect(outMonths).toEqual(refMonths);
  });

  it('as ATIVIDADES devidas por mês batem com o motor atual (expandidas por equipamento)', () => {
    const ref = generateGroupedVisits(START, HORIZON, planInputs);
    const machines: MachineInput[] = [
      machine('item-A', 'eq-A', 'ac', 12),
      machine('item-B', 'eq-B', 'ac', 12),
    ];
    const acts = planInputs.map(legacyAct);
    const out = buildPerMachineVisits(START, HORIZON, machines, acts);

    // Para cada visita, o conjunto de descrições devidas deve ser idêntico ao
    // motor atual; e cada atividade aparece 1x por equipamento (eq-A, eq-B).
    expect(out.length).toBe(ref.length);
    ref.forEach((refVisit, i) => {
      const refDescs = refVisit.activityIndexes.map(ai => planInputs[ai].description).sort();
      const outVisit = out[i];

      // Descrições únicas devidas no mês (sem duplicar por equipamento).
      const outDescs = [...new Set(outVisit.emissions.map(e => e.input.description))].sort();
      expect(outDescs).toEqual(refDescs);

      // Cada descrição devida → exatamente 1 emissão por equipamento (2 eqs).
      for (const d of refDescs) {
        const eqs = outVisit.emissions
          .filter(e => e.input.description === d)
          .map(e => e.equipmentId)
          .sort();
        expect(eqs).toEqual(['eq-A', 'eq-B']);
      }
    });
  });

  it('mês 0 traz TODAS as frequências (M+T+S+A) com start=12 (1ª visita = revisão completa)', () => {
    const machines = [machine('item-A', 'eq-A', 'ac', 12)];
    const out = buildPerMachineVisits(START, HORIZON, machines, planInputs.map(legacyAct));
    const m0 = out[0];
    expect(m0.date.getTime()).toBe(START.getTime());
    const descs = m0.emissions.map(e => e.input.description).sort();
    expect(descs).toEqual([
      'Higienizar serpentina',
      'Limpar filtro',
      'Revisão completa',
      'Verificar dreno',
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// (b) Duas máquinas com FASES diferentes geram atividades distintas no mesmo mês
// ──────────────────────────────────────────────────────────────────────────

describe('FASES diferentes por máquina', () => {
  it('máquina start=12 faz anual no mês 0; máquina start=1 faz só mensal no mês 0', () => {
    const machines: MachineInput[] = [
      machine('item-A', 'eq-A', 'ac', 12), // anual no mês 0
      machine('item-B', 'eq-B', 'ac', 1), // só mensal no mês 0
    ];
    // Plano legado expande pra ambas as máquinas, cada uma com sua fase.
    const acts = [
      act('Limpar filtro', 'M', { section: 'condicionadores' }),
      act('Revisão anual', 'A', { section: 'condicionadores' }),
    ].map(legacyAct);

    const out = buildPerMachineVisits(START, 12, machines, acts);
    const m0 = out[0];
    expect(m0.date.getTime()).toBe(START.getTime());

    // eq-A (start=12, pos 12): mensal + anual.
    const eqA = m0.emissions.filter(e => e.equipmentId === 'eq-A').map(e => e.input.description).sort();
    expect(eqA).toEqual(['Limpar filtro', 'Revisão anual']);

    // eq-B (start=1, pos 1): só mensal — NÃO faz a anual no mês 0.
    const eqB = m0.emissions.filter(e => e.equipmentId === 'eq-B').map(e => e.input.description).sort();
    expect(eqB).toEqual(['Limpar filtro']);
  });

  it('máquina start=1 só faz a anual no mês 11 (sua posição 12)', () => {
    const machines = [machine('item-B', 'eq-B', 'ac', 1)];
    const acts = [act('Revisão anual', 'A', { section: 'condicionadores' })].map(legacyAct);
    const out = buildPerMachineVisits(START, 24, machines, acts);

    // Só vira visita quando há algo devido; anual com start=1 vence em k=11, 23.
    const months = out.map(v => v.date.getTime());
    const k11 = addMonthsTest(START, 11).getTime();
    const k23 = addMonthsTest(START, 23).getTime();
    expect(months).toEqual([k11, k23]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// (c) Escopo: 'ac' só pega condicionadores; 'full' pega tudo + locais
// ──────────────────────────────────────────────────────────────────────────

describe('ESCOPO por máquina (atividades próprias e locais)', () => {
  it("máquina 'ac' ignora atividade própria de seção não-AC; 'full' inclui", () => {
    const machines: MachineInput[] = [
      machine('item-AC', 'eq-AC', 'ac', 12),
      machine('item-FULL', 'eq-FULL', 'full', 12),
    ];
    const acts: MachinePlanActivity[] = [
      ownAct(act('Limpar filtro', 'M', { section: 'condicionadores' }), 'item-AC'),
      ownAct(act('Inspeção de torre', 'M', { section: 'torres_resfriamento' }), 'item-AC'),
      ownAct(act('Inspeção de torre full', 'M', { section: 'torres_resfriamento' }), 'item-FULL'),
      ownAct(act('Limpar filtro full', 'M', { section: 'condicionadores' }), 'item-FULL'),
    ];

    const out = buildPerMachineVisits(START, 0, machines, acts);
    const m0 = out[0];

    const eqAC = m0.emissions.filter(e => e.equipmentId === 'eq-AC').map(e => e.input.description).sort();
    // 'ac' só pega a de condicionadores; a de torre é descartada.
    expect(eqAC).toEqual(['Limpar filtro']);

    const eqFULL = m0.emissions.filter(e => e.equipmentId === 'eq-FULL').map(e => e.input.description).sort();
    // 'full' pega ambas.
    expect(eqFULL).toEqual(['Inspeção de torre full', 'Limpar filtro full']);
  });

  it('locais entram só quando há ≥1 máquina full; com fase âncora = menor start das full', () => {
    const local = [localAct(act('Limpeza da casa de máquinas', 'A', { section: 'casa_maquinas' }))];

    // Sem máquina full → local NÃO entra.
    const onlyAc = [machine('item-AC', 'eq-AC', 'ac', 12)];
    const outNoFull = buildPerMachineVisits(START, 12, onlyAc, local);
    expect(outNoFull.flatMap(v => v.emissions).some(e => e.input.description === 'Limpeza da casa de máquinas')).toBe(false);

    // Com máquina full start=1 → âncora=1 → anual do local vence em k=11.
    const withFull = [
      machine('item-AC', 'eq-AC', 'ac', 12),
      machine('item-FULL', 'eq-FULL', 'full', 1),
    ];
    const outFull = buildPerMachineVisits(START, 12, withFull, local);
    const localEmission = outFull
      .flatMap(v => v.emissions.map(e => ({ date: v.date, e })))
      .filter(x => x.e.input.description === 'Limpeza da casa de máquinas');
    expect(localEmission.length).toBe(1);
    expect(localEmission[0].e.equipmentId).toBeNull(); // local = sem equipamento
    expect(localEmission[0].date.getTime()).toBe(addMonthsTest(START, 11).getTime());
  });

  it('ordem dentro da visita: full primeiro, depois ac, depois local', () => {
    const machines: MachineInput[] = [
      machine('item-AC', 'eq-AC', 'ac', 12),
      machine('item-FULL', 'eq-FULL', 'full', 12),
    ];
    const acts: MachinePlanActivity[] = [
      ownAct(act('AC mensal', 'M', { section: 'condicionadores' }), 'item-AC'),
      ownAct(act('FULL mensal', 'M', { section: 'condicionadores' }), 'item-FULL'),
      localAct(act('Local anual', 'A', { section: 'casa_maquinas' })),
    ];
    // Mês 0 com start=12 → todas as máquinas em posição 12; local âncora=12 → anual devida.
    const out = buildPerMachineVisits(START, 0, machines, acts);
    const buckets = out[0].emissions.map(e => e.bucket);
    // Ordenação final é feita no persist por (bucket, machineRank, activitySort);
    // aqui validamos que os buckets foram atribuídos: full=0, ac=1, local=2.
    expect(Math.min(...buckets)).toBe(0); // tem full
    expect(buckets).toContain(1); // tem ac
    expect(buckets).toContain(2); // tem local
    // A emissão da máquina full tem bucket menor que a da 'ac'.
    const fullBucket = out[0].emissions.find(e => e.equipmentId === 'eq-FULL')!.bucket;
    const acBucket = out[0].emissions.find(e => e.equipmentId === 'eq-AC')!.bucket;
    const localBucket = out[0].emissions.find(e => e.equipmentId === null)!.bucket;
    expect(fullBucket).toBeLessThan(acBucket);
    expect(acBucket).toBeLessThan(localBucket);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// machinesFromItemRows (defaults preservam comportamento atual)
// ──────────────────────────────────────────────────────────────────────────

describe('machinesFromItemRows', () => {
  it('aplica defaults ac/12 quando escopo/fase são null e ordena por sort_order', () => {
    const rows = [
      { id: 'b', equipment_id: 'eqB', pmoc_scope: null, pmoc_start_visit: null, sort_order: 1 },
      { id: 'a', equipment_id: 'eqA', pmoc_scope: 'full', pmoc_start_visit: 3, sort_order: 0 },
    ];
    const machines = machinesFromItemRows(rows);
    expect(machines.map(m => m.contractItemId)).toEqual(['a', 'b']); // ordenado por sort_order
    expect(machines[0]).toMatchObject({ pmocScope: 'full', pmocStartVisit: 3 });
    expect(machines[1]).toMatchObject({ pmocScope: 'ac', pmocStartVisit: 12 });
  });
});

// addMonths local (mesma semântica do date-fns usado no motor) pra evitar
// import extra no teste — calcula via Date setMonth respeitando overflow.
function addMonthsTest(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
