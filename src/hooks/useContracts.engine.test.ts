import { describe, it, expect } from 'vitest';

import {
  positionForMonth,
  dueLevelsForPosition,
  isActivityDueForMachine,
  buildPerMachineVisits,
  buildPerMachineVisitsCustom,
  buildContractVisits,
  generateGroupedVisits,
  generateOccurrences,
  isMonthlyCadence,
  machinesFromItemRows,
  dedupPlanActivities,
  shouldRegenerateVisits,
  orchestrateRegeneration,
  itemsRemovedByEnvironmentRemoval,
  preserveCodesByMonth,
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

// ──────────────────────────────────────────────────────────────────────────
// REGRESSÃO P0 — cross-multiplicação (×N equipamentos) no motor por máquina
// Bug DA Luz (Glacial): 13 máquinas, plano POR MÁQUINA, mas as atividades
// chegavam ao motor com contract_item_id NULL (a UI manda só equipment_ref) →
// caíam no ramo LEGADO de buildPerMachineVisits e eram expandidas pra TODAS as
// máquinas. 1ª OS ficou com 5980 atividades (442 distintas × 13) em vez de 728.
// ──────────────────────────────────────────────────────────────────────────

describe('REGRESSÃO P0 — buildContractVisits NÃO multiplica plano por máquina por N equipamentos', () => {
  const N = 13;
  const ACTS_PER_MACHINE = 8;

  // Máquinas (contract_items) e plano POR MÁQUINA já com contract_item_id
  // resolvido (= o que o hook DEVE passar ao motor após resolver equipment_ref).
  const machines: MachineInput[] = Array.from({ length: N }, (_, i) =>
    machine(`item-${i}`, `eq-${i}`, 'ac', 12),
  );
  const planActivities: PlanActivityInput[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < ACTS_PER_MACHINE; j++) {
      planActivities.push({
        description: `Ativ ${j}`,
        freq_code: 'A', // anual → todas devidas no mês 0 com start=12
        section: 'condicionadores',
        contract_item_id: `item-${i}`, // resolvido (chave da máquina dona)
        applies_per_equipment: true,
      });
    }
  }
  const planActivityIds = planActivities.map((_, idx) => `pa-${idx}`);

  it('com contract_item_id resolvido: 1ª visita = soma dos planos (1× por máquina), NUNCA ×N', () => {
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: 12,
      planActivities,
      planActivityIds,
      machines,
    });
    const first = visits[0];
    const emissions = first.emissions ?? [];
    // Esperado: 13 × 8 = 104. O bug daria 104 × 13 = 1352.
    expect(emissions.length).toBe(N * ACTS_PER_MACHINE);
    // Cada atividade da máquina X sai SÓ com o equipamento de X.
    for (let i = 0; i < N; i++) {
      const ownEmissions = emissions.filter(e => e.equipmentId === `eq-${i}`);
      expect(ownEmissions.length).toBe(ACTS_PER_MACHINE);
    }
  });

  it('PROVA do bug: se o contract_item_id NÃO for resolvido (null), o motor expande ×N (regressão a evitar)', () => {
    // Mesmo plano, mas SEM contract_item_id (o estado cru que vinha da UI).
    const unresolved = planActivities.map(a => ({ ...a, contract_item_id: null }));
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: 12,
      planActivities: unresolved,
      planActivityIds,
      machines,
    });
    const emissions = visits[0].emissions ?? [];
    // Documenta o comportamento ruim: legado expande pra TODAS as máquinas (×N).
    // O hook NUNCA deve passar o plano nesse estado — por isso resolvemos antes.
    expect(emissions.length).toBe(N * ACTS_PER_MACHINE * N);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CHECKLISTS PERSONALIZADOS por máquina (Fase 2). Linha custom = catalog null +
// form_template_id setado + section 'personalizados' + freq 'M' (toda visita).
// Devem entrar na visita ALÉM do catálogo, 1× por máquina (NUNCA ×N), carregando
// o form_template_id até a emissão; e nunca ser filtradas por escopo ('ac'/'full').
// ──────────────────────────────────────────────────────────────────────────

describe('CHECKLISTS PERSONALIZADOS por máquina', () => {
  it('máquina com 2 templates + catálogo: visita devida emite catálogo + 1 linha por template (com form_template_id), sem ×N', () => {
    // 1 máquina 'ac' start=12; 2 atividades de catálogo + 2 checklists custom.
    const machines: MachineInput[] = [machine('item-A', 'eq-A', 'ac', 12)];
    const acts: MachinePlanActivity[] = [
      ownAct(act('Limpar filtro', 'M', { section: 'condicionadores' }), 'item-A'),
      ownAct(act('Revisão anual', 'A', { section: 'condicionadores' }), 'item-A'),
      // Customs: section 'personalizados', freq 'M' → toda visita.
      ownAct(act('Checklist X', 'M', { section: 'personalizados', form_template_id: 'tpl-1' }), 'item-A'),
      ownAct(act('Checklist Y', 'M', { section: 'personalizados', form_template_id: 'tpl-2' }), 'item-A'),
    ];

    // Mês 0 (start=12 → posição 12 = anual): tudo devido.
    const out = buildPerMachineVisits(START, 0, machines, acts);
    const m0 = out[0].emissions;

    // Exatamente 4 emissões (2 catálogo + 2 custom), todas no único equipamento.
    expect(m0.length).toBe(4);
    expect(m0.every(e => e.equipmentId === 'eq-A')).toBe(true);

    const customEmissions = m0.filter(e => e.input.section === 'personalizados');
    expect(customEmissions.map(e => e.input.form_template_id).sort()).toEqual(['tpl-1', 'tpl-2']);

    // As atividades de catálogo NÃO carregam form_template_id.
    const catalogEmissions = m0.filter(e => e.input.section === 'condicionadores');
    expect(catalogEmissions.every(e => !e.input.form_template_id)).toBe(true);
  });

  it('checklist personalizado vale pra QUALQUER escopo (não filtra por ac/full)', () => {
    // Máquina 'ac' com um custom — escopo 'ac' filtraria seções não-AC, mas
    // 'personalizados' tem que passar sempre.
    const machines: MachineInput[] = [machine('item-AC', 'eq-AC', 'ac', 1)];
    const acts: MachinePlanActivity[] = [
      ownAct(act('Checklist próprio', 'M', { section: 'personalizados', form_template_id: 'tpl-1' }), 'item-AC'),
    ];
    // start=1 → mensal devida em todo mês; mês 0 (posição 1) basta.
    const out = buildPerMachineVisits(START, 0, machines, acts);
    const m0 = out[0].emissions;
    expect(m0.length).toBe(1);
    expect(m0[0].input.form_template_id).toBe('tpl-1');
  });

  it('custom é por máquina: 2 máquinas, cada uma 1 template → 2 emissões (1 por máquina), nunca cruzado', () => {
    const machines: MachineInput[] = [
      machine('item-A', 'eq-A', 'ac', 12),
      machine('item-B', 'eq-B', 'full', 12),
    ];
    const acts: MachinePlanActivity[] = [
      ownAct(act('Checklist A', 'M', { section: 'personalizados', form_template_id: 'tpl-A' }), 'item-A'),
      ownAct(act('Checklist B', 'M', { section: 'personalizados', form_template_id: 'tpl-B' }), 'item-B'),
    ];
    const out = buildPerMachineVisits(START, 0, machines, acts);
    const m0 = out[0].emissions;
    const byEq = (eq: string) => m0.filter(e => e.equipmentId === eq).map(e => e.input.form_template_id);
    expect(byEq('eq-A')).toEqual(['tpl-A']);
    expect(byEq('eq-B')).toEqual(['tpl-B']);
    expect(m0.length).toBe(2);
  });

  it('buildContractVisits roteia custom por máquina sem multiplicar por N equipamentos', () => {
    const N = 5;
    const machines: MachineInput[] = Array.from({ length: N }, (_, i) =>
      machine(`item-${i}`, `eq-${i}`, 'ac', 12),
    );
    // Cada máquina: 1 atividade de catálogo + 1 custom (resolvido com contract_item_id).
    const planActivities: PlanActivityInput[] = [];
    for (let i = 0; i < N; i++) {
      planActivities.push({
        description: `Cat ${i}`,
        freq_code: 'A',
        section: 'condicionadores',
        contract_item_id: `item-${i}`,
        applies_per_equipment: true,
      });
      planActivities.push({
        description: `Custom ${i}`,
        freq_code: 'M',
        section: 'personalizados',
        form_template_id: `tpl-${i}`,
        contract_item_id: `item-${i}`,
        applies_per_equipment: true,
      });
    }
    const planActivityIds = planActivities.map((_, idx) => `pa-${idx}`);
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: 12,
      planActivities,
      planActivityIds,
      machines,
    });
    const first = visits[0].emissions ?? [];
    // 5 máquinas × 2 (catálogo + custom) = 10. Bug daria 10 × 5 = 50.
    expect(first.length).toBe(N * 2);
    for (let i = 0; i < N; i++) {
      const custom = first.filter(e => e.equipmentId === `eq-${i}` && e.input.section === 'personalizados');
      expect(custom.length).toBe(1);
      expect(custom[0].input.form_template_id).toBe(`tpl-${i}`);
    }
  });
});

describe('dedupPlanActivities', () => {
  it('remove linhas iguais (mesma máquina+descrição+frequência+seção) preservando ordem', () => {
    const acts: PlanActivityInput[] = [
      { description: 'Limpar filtro', freq_code: 'M', section: 'condicionadores', contract_item_id: 'item-A' },
      { description: 'Limpar filtro', freq_code: 'M', section: 'condicionadores', contract_item_id: 'item-A' }, // dup
      { description: 'Limpar filtro', freq_code: 'M', section: 'condicionadores', contract_item_id: 'item-B' }, // outra máquina
      { description: 'limpar FILTRO', freq_code: 'M', section: 'condicionadores', contract_item_id: 'item-A' }, // case-insensitive dup de A
    ];
    const out = dedupPlanActivities(acts);
    expect(out.length).toBe(2);
    expect(out[0].contract_item_id).toBe('item-A');
    expect(out[1].contract_item_id).toBe('item-B');
  });

  it('é idempotente (aplicar 2x dá o mesmo resultado)', () => {
    const acts: PlanActivityInput[] = [
      { description: 'A', freq_code: 'M', contract_item_id: 'x' },
      { description: 'A', freq_code: 'M', contract_item_id: 'x' },
    ];
    const once = dedupPlanActivities(acts);
    const twice = dedupPlanActivities(once);
    expect(twice).toEqual(once);
    expect(twice.length).toBe(1);
  });

  it('atividade de local (per_eq=false) não colide com a por-equipamento de mesma descrição', () => {
    const acts: PlanActivityInput[] = [
      { description: 'Inspeção', freq_code: 'A', applies_per_equipment: true, contract_item_id: 'item-A' },
      { description: 'Inspeção', freq_code: 'A', applies_per_equipment: false, contract_item_id: null },
    ];
    expect(dedupPlanActivities(acts).length).toBe(2);
  });

  it('checklist personalizado (form_template_id) não colide com atividade do catálogo de mesma descrição', () => {
    const acts: PlanActivityInput[] = [
      { description: 'Checklist', freq_code: 'M', section: 'condicionadores', contract_item_id: 'item-A' },
      { description: 'Checklist', freq_code: 'M', section: 'personalizados', form_template_id: 'tpl-1', contract_item_id: 'item-A' },
    ];
    expect(dedupPlanActivities(acts).length).toBe(2);
  });

  it('2 templates personalizados diferentes na mesma máquina não são deduplicados', () => {
    const acts: PlanActivityInput[] = [
      { description: 'Checklist', freq_code: 'M', section: 'personalizados', form_template_id: 'tpl-1', contract_item_id: 'item-A' },
      { description: 'Checklist', freq_code: 'M', section: 'personalizados', form_template_id: 'tpl-2', contract_item_id: 'item-A' },
    ];
    expect(dedupPlanActivities(acts).length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AUTO-HEAL do gate de regeneração (shouldRegenerateVisits).
// Bug DA Luz (Glacial): contrato ATIVO ficou com 0 ocorrências (uma limpeza
// apagou as OSs) e um "salvar" SEM mudança não regenerava (scheduleChanged=false
// → no-op). O auto-heal regenera quando o ativo está SEM visita futura, e o
// guard mantém o no-op pra contrato saudável sem mudança (não recriar à toa).
// ──────────────────────────────────────────────────────────────────────────

describe('shouldRegenerateVisits — gate de regeneração / auto-heal', () => {
  it('AUTO-HEAL: contrato ATIVO sem visita futura → regenera mesmo SEM mudança', () => {
    expect(
      shouldRegenerateVisits({ newStatus: 'active', scheduleChanged: false, hasFutureVisits: false }),
    ).toBe(true);
  });

  it('GUARD não-regressão: contrato ATIVO saudável (tem visita futura) + SEM mudança → NÃO regenera', () => {
    expect(
      shouldRegenerateVisits({ newStatus: 'active', scheduleChanged: false, hasFutureVisits: true }),
    ).toBe(false);
  });

  it('contrato ATIVO com mudança de cronograma → regenera (mesmo com visita futura)', () => {
    expect(
      shouldRegenerateVisits({ newStatus: 'active', scheduleChanged: true, hasFutureVisits: true }),
    ).toBe(true);
  });

  it('REATIVAÇÃO: status virou active e está sem visita futura → regenera', () => {
    expect(
      shouldRegenerateVisits({ newStatus: 'active', scheduleChanged: false, hasFutureVisits: false }),
    ).toBe(true);
  });

  it('contrato INATIVO nunca regenera, mesmo sem visita futura ou com mudança', () => {
    expect(
      shouldRegenerateVisits({ newStatus: 'inactive', scheduleChanged: true, hasFutureVisits: false }),
    ).toBe(false);
    expect(
      shouldRegenerateVisits({ newStatus: 'inactive', scheduleChanged: false, hasFutureVisits: false }),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CENÁRIO DA LUZ — verificação por teste de que, com os dados reais do contrato
// (13 máquinas 'ac', plano M/T/S/A por máquina, fases mistas 1/3/12, horizonte
// 24, start 2026-06-22), o motor produz visitas > 0 e a 1ª visita traz cada
// atividade 1× por máquina (sem ×N, ≤ total do plano). Reproduz o estado em que
// o DALUZ será curado no próximo "salvar" pela tela (com o auto-heal no ar).
// ──────────────────────────────────────────────────────────────────────────

describe('CENÁRIO DA LUZ — geração de visitas (auto-heal pela tela)', () => {
  const N = 13;
  const HORIZON = 24;
  const DALUZ_START = new Date('2026-06-22T12:00:00');
  // Fases mistas como no contrato real (start_visit 1/3/12), distribuídas.
  const startVisitFor = (i: number): number => [1, 3, 12][i % 3];

  // Plano POR MÁQUINA com os 4 níveis de frequência (M/T/S/A), contract_item_id
  // já resolvido (= o que o hook passa ao motor após resolver equipment_ref).
  const FREQ: FreqCode[] = ['M', 'T', 'S', 'A'];
  const machines: MachineInput[] = Array.from({ length: N }, (_, i) =>
    machine(`item-${i}`, `eq-${i}`, 'ac', startVisitFor(i)),
  );
  const planActivities: PlanActivityInput[] = [];
  for (let i = 0; i < N; i++) {
    for (const f of FREQ) {
      planActivities.push({
        description: `Ativ ${f}`,
        freq_code: f,
        section: 'condicionadores',
        contract_item_id: `item-${i}`,
        applies_per_equipment: true,
      });
    }
  }
  const planActivityIds = planActivities.map((_, idx) => `pa-${idx}`);
  // "Scheduláveis" = tudo menos eventual ('E'); aqui são todas (M/T/S/A).
  const SCHEDULABLE = planActivities.length; // 13 × 4 = 52 (teto por visita)

  const visits = buildContractVisits({
    startDate: DALUZ_START,
    frequencyType: 'months',
    frequencyValue: 1,
    horizonMonths: HORIZON,
    planActivities,
    planActivityIds,
    machines,
  });

  it('gera visitas > 0 (cura o contrato zerado)', () => {
    expect(visits.length).toBeGreaterThan(0);
  });

  it('1ª visita: cada atividade DEVIDA sai 1× por máquina (sem ×N) e ≤ teto do plano', () => {
    const first = visits[0].emissions ?? [];
    // Nunca pode explodir além do plano scheduláveis (×N seria 52 × 13 = 676).
    expect(first.length).toBeLessThanOrEqual(SCHEDULABLE);
    expect(first.length).toBeGreaterThan(0);

    // Cada (equipamento, descrição, freq) aparece no MÁXIMO 1 vez na 1ª visita.
    const seen = new Map<string, number>();
    for (const e of first) {
      const key = `${e.equipmentId}|${e.input.description}|${e.input.freq_code}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [, count] of seen) expect(count).toBe(1);

    // Toda emissão pertence ao equipamento da SUA máquina (sem cruzamento ×N).
    for (const e of first) {
      const ownIdx = Number(String(e.equipmentId).replace('eq-', ''));
      const ownItem = `item-${ownIdx}`;
      expect(e.input.contract_item_id).toBe(ownItem);
    }
  });

  it('máquinas start=1 fazem só a mensal no 1º mês; start=12 fazem todos os níveis', () => {
    const first = visits[0].emissions ?? [];
    // start=1 (posição 1 no mês 0) → só M.
    for (let i = 0; i < N; i++) {
      if (startVisitFor(i) !== 1) continue;
      const descs = first.filter(e => e.equipmentId === `eq-${i}`).map(e => e.input.freq_code).sort();
      expect(descs).toEqual(['M']);
    }
    // start=12 (posição 12 no mês 0) → M+T+S+A (todos os níveis).
    for (let i = 0; i < N; i++) {
      if (startVisitFor(i) !== 12) continue;
      const codes = [...new Set(first.filter(e => e.equipmentId === `eq-${i}`).map(e => e.input.freq_code))].sort();
      expect(codes).toEqual(['A', 'M', 'S', 'T']);
    }
  });

  it('todas as 13 máquinas aparecem em pelo menos uma visita do horizonte', () => {
    const allEqs = new Set(visits.flatMap(v => (v.emissions ?? []).map(e => e.equipmentId)));
    for (let i = 0; i < N; i++) expect(allEqs.has(`eq-${i}`)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// P0 — REGENERAÇÃO SEGURA: "GERAR ANTES DE APAGAR" (orchestrateRegeneration).
// A invariante crítica: numa falha de geração/validação, as OSs antigas NUNCA
// são apagadas (sem janela de perda). Em sucesso, apaga POR ÚLTIMO. Renovação
// (shouldDeleteOld=false) nunca apaga.
// ──────────────────────────────────────────────────────────────────────────

describe('orchestrateRegeneration — gerar antes de apagar (P0)', () => {
  it('SUCESSO: ordem é persist → validate → deleteOld (apaga por ÚLTIMO)', async () => {
    const calls: string[] = [];
    const res = await orchestrateRegeneration({
      shouldDeleteOld: true,
      oldCount: 3,
      persist: async () => { calls.push('persist'); return 5; },
      validate: (c) => { calls.push(`validate:${c}`); /* ok */ },
      deleteOld: async () => { calls.push('deleteOld'); },
    });
    expect(calls).toEqual(['persist', 'validate:5', 'deleteOld']);
    expect(res).toEqual({ createdCount: 5, deletedCount: 3 });
  });

  it('FALHA na validação: deleteOld NUNCA é chamado (antigas preservadas)', async () => {
    const calls: string[] = [];
    await expect(
      orchestrateRegeneration({
        shouldDeleteOld: true,
        oldCount: 3,
        persist: async () => { calls.push('persist'); return 2; },
        validate: (c) => {
          calls.push(`validate:${c}`);
          throw new Error(`Falha ao gerar as visitas do contrato: ${c} de 5`);
        },
        deleteOld: async () => { calls.push('deleteOld'); },
      }),
    ).rejects.toThrow(/Falha ao gerar as visitas/);
    // persist e validate rodaram; deleteOld NÃO.
    expect(calls).toEqual(['persist', 'validate:2']);
    expect(calls).not.toContain('deleteOld');
  });

  it('FALHA na geração (persist lança): nem valida nem apaga', async () => {
    const calls: string[] = [];
    await expect(
      orchestrateRegeneration({
        shouldDeleteOld: true,
        oldCount: 4,
        persist: async () => { calls.push('persist'); throw new Error('insert OS falhou'); },
        validate: () => { calls.push('validate'); },
        deleteOld: async () => { calls.push('deleteOld'); },
      }),
    ).rejects.toThrow('insert OS falhou');
    expect(calls).toEqual(['persist']);
  });

  it('RENOVAÇÃO (shouldDeleteOld=false): gera+valida mas NUNCA apaga; deletedCount=0', async () => {
    const calls: string[] = [];
    const res = await orchestrateRegeneration({
      shouldDeleteOld: false,
      oldCount: 0,
      persist: async () => { calls.push('persist'); return 7; },
      validate: (c) => { calls.push(`validate:${c}`); },
      deleteOld: async () => { calls.push('deleteOld'); },
    });
    expect(calls).toEqual(['persist', 'validate:7']);
    expect(res).toEqual({ createdCount: 7, deletedCount: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// P2a — EXCLUIR AMBIENTE REMOVE OS EQUIPAMENTOS DO CONTRATO
// (itemsRemovedByEnvironmentRemoval). Os equipamentos do ambiente excluído saem
// de contract_items (em vez do antigo FK SET NULL que deixava órfãos). Item sem
// ambiente (environment_id null) nunca é afetado.
// ──────────────────────────────────────────────────────────────────────────

describe('itemsRemovedByEnvironmentRemoval — excluir ambiente remove equipamentos (P2a)', () => {
  const items = [
    { id: 'item-1', environment_id: 'env-A' },
    { id: 'item-2', environment_id: 'env-A' },
    { id: 'item-3', environment_id: 'env-B' },
    { id: 'item-4', environment_id: null }, // sem ambiente — nunca removido
  ];

  it('remove TODOS os equipamentos do ambiente excluído', () => {
    expect(itemsRemovedByEnvironmentRemoval(items, ['env-A']).sort()).toEqual(['item-1', 'item-2']);
  });

  it('remove de múltiplos ambientes excluídos de uma vez', () => {
    expect(itemsRemovedByEnvironmentRemoval(items, ['env-A', 'env-B']).sort()).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('item SEM ambiente (environment_id null) NUNCA é removido', () => {
    expect(itemsRemovedByEnvironmentRemoval(items, ['env-A', 'env-B'])).not.toContain('item-4');
  });

  it('nenhum ambiente removido → não remove nada', () => {
    expect(itemsRemovedByEnvironmentRemoval(items, [])).toEqual([]);
  });

  it('ambiente excluído sem equipamentos → não remove nada', () => {
    expect(itemsRemovedByEnvironmentRemoval(items, ['env-vazio'])).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// preserveCodesByMonth — preservação do link público (public_short_code) por mês
// ──────────────────────────────────────────────────────────────────────────

describe('preserveCodesByMonth', () => {
  const old = (date: string, code: string | null) => ({ scheduled_date: date, public_short_code: code });
  const nu = (id: string, date: string) => ({ id, scheduled_date: date });

  it('mês casa → reusa o código antigo na OS nova daquele mês', () => {
    const r = preserveCodesByMonth(
      [old('2026-02-10', 'AAA'), old('2026-03-10', 'BBB')],
      [nu('new-feb', '2026-02-15'), nu('new-mar', '2026-03-15')],
    );
    expect(r).toEqual([
      { newId: 'new-feb', code: 'AAA' },
      { newId: 'new-mar', code: 'BBB' },
    ]);
  });

  it('casa pelo MÊS mesmo que o DIA da visita mude', () => {
    const r = preserveCodesByMonth([old('2026-02-28', 'AAA')], [nu('new-feb', '2026-02-03')]);
    expect(r).toEqual([{ newId: 'new-feb', code: 'AAA' }]);
  });

  it('mês NOVO sem antigo (horizonte aumentou) → mantém o código do trigger (não entra)', () => {
    const r = preserveCodesByMonth(
      [old('2026-02-10', 'AAA')],
      [nu('new-feb', '2026-02-15'), nu('new-mar', '2026-03-15')],
    );
    expect(r).toEqual([{ newId: 'new-feb', code: 'AAA' }]);
    expect(r.find((x) => x.newId === 'new-mar')).toBeUndefined();
  });

  it('mês ANTIGO sem novo (visita saiu do cronograma) → código descartado', () => {
    const r = preserveCodesByMonth(
      [old('2026-02-10', 'AAA'), old('2026-03-10', 'BBB')],
      [nu('new-feb', '2026-02-15')],
    );
    expect(r).toEqual([{ newId: 'new-feb', code: 'AAA' }]);
  });

  it('não duplica: cada código é aplicado a no máximo 1 OS nova', () => {
    // 2 OSs novas no mesmo mês (cenário anômalo) → só a 1ª herda o código.
    const r = preserveCodesByMonth(
      [old('2026-02-10', 'AAA')],
      [nu('new-feb-1', '2026-02-15'), nu('new-feb-2', '2026-02-20')],
    );
    expect(r).toEqual([{ newId: 'new-feb-1', code: 'AAA' }]);
    const codes = r.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('antigo sem código (null) é ignorado', () => {
    const r = preserveCodesByMonth([old('2026-02-10', null)], [nu('new-feb', '2026-02-15')]);
    expect(r).toEqual([]);
  });

  it('datas null não casam e não quebram', () => {
    const r = preserveCodesByMonth(
      [{ scheduled_date: null, public_short_code: 'AAA' }],
      [{ id: 'new-x', scheduled_date: null }],
    );
    expect(r).toEqual([]);
  });

  it('idempotente: rodar 2× dá o mesmo conjunto de pares', () => {
    const oldOss = [old('2026-02-10', 'AAA'), old('2026-03-10', 'BBB')];
    const newOss = [nu('new-feb', '2026-02-15'), nu('new-mar', '2026-03-15')];
    expect(preserveCodesByMonth(oldOss, newOss)).toEqual(preserveCodesByMonth(oldOss, newOss));
  });

  it('listas vazias → sem pares', () => {
    expect(preserveCodesByMonth([], [])).toEqual([]);
    expect(preserveCodesByMonth([old('2026-02-10', 'AAA')], [])).toEqual([]);
    expect(preserveCodesByMonth([], [nu('new-feb', '2026-02-15')])).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CADÊNCIA CUSTOM (≠ mensal) — sanidade do caminho buildPerMachineVisitsCustom.
// Mensal = caminho legado (ciclo-12). Qualquer outra cadência (a cada 14 dias,
// bimestral, …) gera as DATAS reais (generateOccurrences) e encaixa as
// atividades pelo motor compartilhado (visitScheduleEngine):
//   • catálogo (M/T/S/A): por TEMPO, âncora 'contract_start' → 1ª ocorrência cai
//     na 1ª visita com data ≥ a meta;
//   • checklist personalizado (form_template_id): CONTAINER em TODA visita.
// ──────────────────────────────────────────────────────────────────────────

describe('isMonthlyCadence', () => {
  it('true SÓ pra months/1 (default histórico do PMOC)', () => {
    expect(isMonthlyCadence('months', 1)).toBe(true);
  });
  it('false pra qualquer outra cadência', () => {
    expect(isMonthlyCadence('days', 14)).toBe(false);
    expect(isMonthlyCadence('days', 30)).toBe(false);
    expect(isMonthlyCadence('months', 2)).toBe(false);
    expect(isMonthlyCadence('days', 1)).toBe(false);
    expect(isMonthlyCadence('months', 3)).toBe(false);
  });
});

describe('buildPerMachineVisitsCustom — cadência a cada 14 dias (cenário Glacial)', () => {
  // 6 meses de visitas a cada 14 dias a partir de START. generateOccurrences é a
  // MESMA fonte de datas que o roteamento real usa.
  const HORIZON = 6;
  const visitDates = generateOccurrences(START, 'days', 14, HORIZON);

  // Índice da 1ª visita com data >= (START + offsetDays). Espelha a regra do
  // motor: cada meta cai na 1ª visita que a alcança. Calculado a partir das datas
  // reais pra a asserção não ser frágil com mês de tamanho variável.
  const firstVisitAtOrAfterDays = (offsetDays: number): number => {
    const target = addDays(START, offsetDays);
    return visitDates.findIndex((d) => d.getTime() >= target.getTime());
  };

  // 1 máquina 'ac' start=12 (a fase do ciclo-12 NÃO se aplica no custom: quem
  // decide é a frequência por tempo sobre as datas reais).
  const machines: MachineInput[] = [machine('item-A', 'eq-A', 'ac', 12)];
  const acts: MachinePlanActivity[] = [
    ownAct(act('Limpar filtro', 'M', { section: 'condicionadores' }), 'item-A'),
    ownAct(act('Verificar dreno', 'T', { section: 'condicionadores' }), 'item-A'),
    ownAct(
      act('Checklist do gestor', 'M', { section: 'personalizados', form_template_id: 'tpl-1' }),
      'item-A',
    ),
  ];

  const visits = buildPerMachineVisitsCustom(visitDates, machines, acts);

  // Mapa data-da-visita → descrições devidas, pra inspeção por índice de visita.
  const descsByVisitDate = new Map<number, string[]>();
  for (const v of visits) {
    descsByVisitDate.set(
      v.date.getTime(),
      v.emissions.map((e) => e.input.description),
    );
  }
  const descsAtVisit = (visitIdx: number): string[] =>
    descsByVisitDate.get(visitDates[visitIdx].getTime()) ?? [];

  it('gera visitas e todas as datas vêm da cadência real (14 em 14 dias)', () => {
    expect(visits.length).toBeGreaterThan(0);
    const validDates = new Set(visitDates.map((d) => d.getTime()));
    for (const v of visits) expect(validDates.has(v.date.getTime())).toBe(true);
    // Toda emissão é do único equipamento (1 máquina, sem ×N).
    for (const v of visits) {
      for (const e of v.emissions) expect(e.equipmentId).toBe('eq-A');
    }
  });

  it('checklist personalizado (container) aparece em TODAS as visitas', () => {
    // due_now + freqVisits 1 → toda visita carrega o container.
    expect(visits.length).toBe(visitDates.length);
    for (const v of visits) {
      const customs = v.emissions.filter((e) => e.input.form_template_id === 'tpl-1');
      expect(customs.length).toBe(1);
      expect(customs[0].input.section).toBe('personalizados');
    }
  });

  it('a M (mensal) vence ~a cada 30 dias, na 1ª visita que alcança a meta', () => {
    // 1ª ocorrência da M: âncora 'contract_start' → meta = START + 1 mês (~30d).
    const firstM = firstVisitAtOrAfterDays(30);
    expect(firstM).toBeGreaterThan(0); // NÃO cai na visita 0 (anchor + 1 intervalo)
    expect(descsAtVisit(firstM)).toContain('Limpar filtro');
    // Não aparece antes disso.
    for (let i = 0; i < firstM; i++) expect(descsAtVisit(i)).not.toContain('Limpar filtro');
    // 2ª ocorrência ~60 dias.
    const secondM = firstVisitAtOrAfterDays(60);
    expect(secondM).toBeGreaterThan(firstM);
    expect(descsAtVisit(secondM)).toContain('Limpar filtro');
  });

  it('a T (trimestral) vence por volta da visita que cobre ~90 dias', () => {
    const firstT = firstVisitAtOrAfterDays(90);
    expect(firstT).toBeGreaterThan(0);
    expect(descsAtVisit(firstT)).toContain('Verificar dreno');
    // Antes de ~90 dias, a T não aparece.
    for (let i = 0; i < firstT; i++) expect(descsAtVisit(i)).not.toContain('Verificar dreno');
  });

  it('horizonte vazio → sem visitas', () => {
    expect(buildPerMachineVisitsCustom([], machines, acts)).toEqual([]);
  });
});

describe('buildPerMachineVisitsCustom — borda: Anual com horizonte < 12 meses', () => {
  it('atividade Anual (A) não aparece quando o horizonte não alcança 12 meses', () => {
    // 6 meses a cada 14 dias: a 1ª meta da anual (START + 12 meses) cai DEPOIS da
    // última visita → nunca agenda. Consistente com o mensal (start=12 só no k=12).
    const visitDates = generateOccurrences(START, 'days', 14, 6);
    const machines: MachineInput[] = [machine('item-A', 'eq-A', 'ac', 12)];
    const acts: MachinePlanActivity[] = [
      ownAct(act('Limpar filtro', 'M', { section: 'condicionadores' }), 'item-A'),
      ownAct(act('Revisão completa', 'A', { section: 'condicionadores' }), 'item-A'),
    ];
    const visits = buildPerMachineVisitsCustom(visitDates, machines, acts);
    const anyAnnual = visits.some((v) =>
      v.emissions.some((e) => e.input.description === 'Revisão completa'),
    );
    expect(anyAnnual).toBe(false);
    // A mensal, porém, aparece (sanidade de que o conjunto não ficou vazio à toa).
    const anyMonthly = visits.some((v) =>
      v.emissions.some((e) => e.input.description === 'Limpar filtro'),
    );
    expect(anyMonthly).toBe(true);
  });
});

describe('buildContractVisits — roteia mensal vs. custom pela cadência', () => {
  const machines: MachineInput[] = [machine('item-A', 'eq-A', 'ac', 12)];
  const planActivities: PlanActivityInput[] = [
    {
      description: 'Limpar filtro',
      freq_code: 'M',
      section: 'condicionadores',
      contract_item_id: 'item-A',
      applies_per_equipment: true,
    },
    {
      description: 'Checklist do gestor',
      freq_code: 'M',
      section: 'personalizados',
      form_template_id: 'tpl-1',
      contract_item_id: 'item-A',
      applies_per_equipment: true,
    },
  ];
  const planActivityIds = planActivities.map((_, i) => `pa-${i}`);

  it('cadência custom (days/14) usa as datas reais da cadência (não addMonths mensal)', () => {
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'days',
      frequencyValue: 14,
      horizonMonths: 6,
      planActivities,
      planActivityIds,
      machines,
    });
    const expectedDates = new Set(
      generateOccurrences(START, 'days', 14, 6).map((d) => d.getTime()),
    );
    expect(visits.length).toBeGreaterThan(0);
    for (const v of visits) expect(expectedDates.has(v.date.getTime())).toBe(true);
    // A 2ª visita é 14 dias após a 1ª (cadência real), não 1 mês.
    expect(visits[1].date.getTime()).toBe(addDays(START, 14).getTime());
  });

  it('cadência mensal (months/1) segue o caminho legado (1ª visita = START exata)', () => {
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: 6,
      planActivities,
      planActivityIds,
      machines,
    });
    expect(visits[0].date.getTime()).toBe(START.getTime());
    // No mensal a 2ª visita é 1 mês depois (não 14 dias).
    expect(visits[1].date.getTime()).toBe(addMonthsTest(START, 1).getTime());
  });
});

// addDays local pra os testes de cadência custom (mesma semântica do date-fns
// usado no motor): soma dias corridos sem mutar a data original.
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// addMonths local (mesma semântica do date-fns usado no motor) pra evitar
// import extra no teste — calcula via Date setMonth respeitando overflow.
function addMonthsTest(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
