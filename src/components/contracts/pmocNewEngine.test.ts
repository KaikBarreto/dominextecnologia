// P3 — Contrato PMOC NOVO gera OS pelo MESMO motor do contrato comum.
//
// Discriminador ACORDADO: `contract_item.form_template_ids` não-vazio = NOVO
// (checklist vem dos form_templates de norma; geração por CADÊNCIA do contrato +
// `service_order_equipment` por template; filtro por-pergunta no render via
// `computeVisibleQuestionIds`). `form_template_ids` vazio = LEGADO (catálogo →
// `contract_plan_activities` + `buildPerMachineVisits`/ciclo-12).
//
// Estes testes provam a COEXISTÊNCIA: o ramo novo NÃO materializa atividades de
// catálogo no plano (logo não grava contract_plan_activities/service_order_activities
// e cai na cadência), enquanto o ramo legado segue byte-a-byte como antes.

import { describe, it, expect } from 'vitest';

import {
  buildPmocPlanFromMachines,
  type MachineConfig,
  type MachineItemRef,
  type PlanActivityRow,
} from './pmocMachineRoutine';
import {
  buildContractVisits,
  type MachineInput,
  type PlanActivityInput,
} from '@/hooks/useContracts';
import {
  computeVisibleQuestionIds,
  type VisibilityQuestion,
} from './visitQuestionVisibility';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const START = new Date('2026-03-10T12:00:00');

/** Linha de catálogo já no formato editável do plano (atividade da norma). */
function catalogRow(description: string, eqRef: string): PlanActivityRow {
  return {
    description,
    freq_code: 'M',
    section: 'condicionadores',
    catalog_activity_id: `cat-${description}`,
    applies_per_equipment: true,
    equipment_ref: eqRef,
  };
}

/** Config de máquina NOVA: tem normTemplateIds (form_templates de norma). */
function newMachineConfig(eqRef: string, normTemplateIds: string[]): MachineConfig {
  return {
    scope: 'ac',
    startVisit: 12,
    // No mundo real o editor inline ainda popula `activities` (o catálogo
    // essencial); o builder DEVE ignorá-las quando há normTemplateIds.
    activities: [catalogRow('Limpar filtro', eqRef), catalogRow('Medir pressão', eqRef)],
    customized: false,
    customTemplateIds: [],
    firstOsExcludedQuestions: [],
    normTemplateIds,
  };
}

/** Config de máquina LEGADA: sem normTemplateIds → catálogo vira plano. */
function legacyMachineConfig(eqRef: string): MachineConfig {
  return {
    scope: 'ac',
    startVisit: 12,
    activities: [catalogRow('Limpar filtro', eqRef), catalogRow('Medir pressão', eqRef)],
    customized: false,
    customTemplateIds: [],
    firstOsExcludedQuestions: [],
    // normTemplateIds ausente = legado.
  };
}

const item = (eqId: string): MachineItemRef => ({ equipment_id: eqId, item_name: `Eq ${eqId}` });

// ──────────────────────────────────────────────────────────────────────────
// 1) buildPmocPlanFromMachines — diversão do substrato legado
// ──────────────────────────────────────────────────────────────────────────

describe('buildPmocPlanFromMachines — ramo NOVO não materializa catálogo no plano', () => {
  it('máquina NOVA (normTemplateIds) → NENHUMA linha de plano (sem contract_plan_activities)', () => {
    const items = [item('eq-1')];
    const machineConfigs: Record<string, MachineConfig> = {
      'eq-1': newMachineConfig('eq-1', ['tpl-norma-1']),
    };
    const rows = buildPmocPlanFromMachines({ items, machineConfigs, catalogActivities: [] });
    expect(rows).toHaveLength(0);
  });

  it('máquina LEGADA (sem normTemplateIds) → MANTÉM as atividades do catálogo no plano', () => {
    const items = [item('eq-2')];
    const machineConfigs: Record<string, MachineConfig> = {
      'eq-2': legacyMachineConfig('eq-2'),
    };
    const rows = buildPmocPlanFromMachines({ items, machineConfigs, catalogActivities: [] });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.equipment_ref === 'eq-2')).toBe(true);
    expect(rows.map((r) => r.description).sort()).toEqual(['Limpar filtro', 'Medir pressão']);
  });

  it('MISTO (defensivo) → só a máquina legada gera plano; a nova fica de fora', () => {
    const items = [item('eq-new'), item('eq-old')];
    const machineConfigs: Record<string, MachineConfig> = {
      'eq-new': newMachineConfig('eq-new', ['tpl-norma-1']),
      'eq-old': legacyMachineConfig('eq-old'),
    };
    const rows = buildPmocPlanFromMachines({ items, machineConfigs, catalogActivities: [] });
    // Só as 2 atividades da máquina legada.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.equipment_ref))).toEqual(new Set(['eq-old']));
  });

  it('máquina NOVA com customTemplateIds ainda emite a linha do personalizado (aditiva)', () => {
    // O ramo novo usa normTemplateIds, mas se o gestor também tiver um custom, a
    // linha custom continua (catalog_activity_id null + form_template_id setado).
    const items = [item('eq-1')];
    const machineConfigs: Record<string, MachineConfig> = {
      'eq-1': { ...newMachineConfig('eq-1', ['tpl-norma-1']), customTemplateIds: ['tpl-custom'] },
    };
    const rows = buildPmocPlanFromMachines({
      items,
      machineConfigs,
      catalogActivities: [],
      templateNameById: { 'tpl-custom': 'Checklist da casa' },
    });
    // Nenhuma linha de catálogo; só a linha do personalizado.
    expect(rows).toHaveLength(1);
    expect(rows[0].catalog_activity_id ?? null).toBeNull();
    expect(rows[0].form_template_id).toBe('tpl-custom');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2) buildContractVisits — PMOC novo cai na CADÊNCIA (não buildPerMachineVisits)
// ──────────────────────────────────────────────────────────────────────────

describe('buildContractVisits — PMOC novo gera por cadência, sem snapshot de plano', () => {
  // Plano VAZIO é a consequência direta do ramo novo (catálogo não materializa).
  const HORIZON = 12;

  it('mensal, plano vazio → 1 visita por mês na cadência, com activities/emissions vazias', () => {
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: HORIZON,
      planActivities: [],
      planActivityIds: [],
      // máquinas existem (escopo/fase), mas SEM plano não há motor por máquina.
      machines: [machineInput('item-1', 'eq-1'), machineInput('item-2', 'eq-2')],
    });
    // Cadência mensal por ~12 meses.
    expect(visits.length).toBeGreaterThanOrEqual(11);
    expect(visits.length).toBeLessThanOrEqual(13);
    // Nenhuma visita carrega snapshot de plano (modelo antigo de checklist).
    for (const v of visits) {
      expect(v.activities).toHaveLength(0);
      expect(v.emissions ?? []).toHaveLength(0);
    }
    // 1ª visita na data de início.
    const first = visits[0].date;
    expect(first.getFullYear()).toBe(2026);
    expect(first.getMonth()).toBe(2); // março (0-based)
    expect(first.getDate()).toBe(10);
  });

  it('cadência quinzenal (dias) → visitas a cada 15 dias, ainda sem snapshot', () => {
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'days',
      frequencyValue: 15,
      horizonMonths: 3,
      planActivities: [],
      planActivityIds: [],
      machines: [machineInput('item-1', 'eq-1')],
    });
    expect(visits.length).toBeGreaterThan(3);
    for (const v of visits) {
      expect(v.activities).toHaveLength(0);
      expect(v.emissions ?? []).toHaveLength(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3) COEXISTÊNCIA — máquina LEGADA continua no motor por máquina (ciclo-12)
// ──────────────────────────────────────────────────────────────────────────

describe('buildContractVisits — máquina LEGADA segue buildPerMachineVisits (emissions)', () => {
  it('plano de catálogo + máquinas → visitas com emissions por equipamento (modelo antigo)', () => {
    // Reproduz o que o ramo legado entrega: plano materializado do catálogo.
    const planActivities: PlanActivityInput[] = [
      { description: 'Limpar filtro', freq_code: 'M', section: 'condicionadores', contract_item_id: 'item-1', applies_per_equipment: true },
      { description: 'Revisão anual', freq_code: 'A', section: 'condicionadores', contract_item_id: 'item-1', applies_per_equipment: true },
    ];
    const visits = buildContractVisits({
      startDate: START,
      frequencyType: 'months',
      frequencyValue: 1,
      horizonMonths: 12,
      planActivities,
      planActivityIds: planActivities.map((_, i) => `pa-${i}`),
      machines: [machineInput('item-1', 'eq-1', 'ac', 12)],
    });
    expect(visits.length).toBeGreaterThan(0);
    // Motor por máquina → a 1ª visita carrega emissions (não activities vazias).
    const withEmissions = visits.filter((v) => (v.emissions ?? []).length > 0);
    expect(withEmissions.length).toBeGreaterThan(0);
    // start=12 → 1ª visita faz revisão completa (M + A presentes).
    const firstCodes = new Set((visits[0].emissions ?? []).map((e) => e.input.freq_code));
    expect(firstCodes.has('M')).toBe(true);
    expect(firstCodes.has('A')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4) RENDER — first_os_excluded_questions esconde/mostra na 1ª vs Nª visita
//    (integração com o filtro por-pergunta que a OS do PMOC novo usa)
// ──────────────────────────────────────────────────────────────────────────

describe('computeVisibleQuestionIds — âncora da 1ª OS do PMOC novo (form_template)', () => {
  // 12 visitas mensais reais do contrato (o que o render passa em visitDates).
  const VISIT_DATES = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, 2, 10); // 2026-03-10
    d.setMonth(d.getMonth() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  });
  const dateOf = (i: number) => VISIT_DATES[i];

  // Pergunta trimestral de um template de NORMA (freq por tempo, 3 meses).
  const questions: VisibilityQuestion[] = [
    { id: 'q-toda', freq_kind: null },                       // toda visita
    { id: 'q-trim', freq_kind: 'time', freq_months: 3 },     // trimestral
  ];

  it('pergunta EXCLUÍDA da 1ª OS não aparece na visita 0; aparece quando a freq. vence', () => {
    const excluded = new Set(['q-trim']);
    const v0 = computeVisibleQuestionIds({
      visitDates: VISIT_DATES,
      scheduledDate: dateOf(0),
      questions,
      excludedQuestionIds: excluded,
    });
    // 'q-toda' sempre; 'q-trim' excluída → fora da 1ª.
    expect(v0.has('q-toda')).toBe(true);
    expect(v0.has('q-trim')).toBe(false);

    // Excluída (âncora contract_start) → 1ª vez que vence é ~3 meses depois.
    const apareceuEm = VISIT_DATES.findIndex((_, idx) =>
      computeVisibleQuestionIds({
        visitDates: VISIT_DATES,
        scheduledDate: dateOf(idx),
        questions,
        excludedQuestionIds: excluded,
      }).has('q-trim'),
    );
    expect(apareceuEm).toBeGreaterThan(0);
  });

  it('pergunta INCLUÍDA na 1ª OS (não no set) aparece já na visita 0 (âncora due_now)', () => {
    const excluded = new Set<string>(); // nada excluído = tudo incluído
    const v0 = computeVisibleQuestionIds({
      visitDates: VISIT_DATES,
      scheduledDate: dateOf(0),
      questions,
      excludedQuestionIds: excluded,
    });
    expect(v0.has('q-toda')).toBe(true);
    expect(v0.has('q-trim')).toBe(true); // incluída → due_now → já na 1ª
  });
});

// ──────────────────────────────────────────────────────────────────────────
// helper local: MachineInput (escopo/fase) pro motor
// ──────────────────────────────────────────────────────────────────────────
function machineInput(
  contractItemId: string,
  equipmentId: string,
  pmocScope: 'ac' | 'full' = 'ac',
  pmocStartVisit = 12,
): MachineInput {
  return { contractItemId, equipmentId, pmocScope, pmocStartVisit };
}
