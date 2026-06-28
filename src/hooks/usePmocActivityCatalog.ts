import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Catálogo global de atividades de manutenção PMOC (149 itens da norma).
 * Tabela `pmoc_activity_catalog`, RLS read-all pra logados. Hook é a fronteira
 * do Supabase — o componente nunca lê a tabela direto.
 *
 * São poucas linhas (149) e o conteúdo é estável (catálogo regulatório), então
 * carregamos tudo de uma vez e agrupamos/filtramos no client.
 */
// Tier do conjunto ESSENCIAL ("enxuto") que nasce pré-marcado num plano novo.
//  - base    = essencial da Expansão Direta (herdado por Sistemas Centrais);
//  - central = adição da máquina de Sistemas Centrais (pressões, água);
//  - infra   = essencial do equipamento de infraestrutura (torre/bombas) — Fase 2;
//  - null    = não-essencial (entra DESMARCADO, opt-in via "Adicionar norma completa").
export type PmocEssentialTier = 'base' | 'central' | 'infra';

// Grupo de exibição por TIPO de tarefa. Só agrupa o display do picker; independe
// de `section`. NULL nas seções de infra/central (essas agrupam por section).
export type PmocActivityGroup = 'limpeza' | 'inspecao' | 'medicao' | 'teste';

export interface PmocCatalogActivity {
  id: string;
  section: string;
  component: string | null;
  description: string;
  guidance: string | null;
  default_freq_code: string;
  is_measurement: boolean;
  unit: string | null;
  expected_min: number | null;
  expected_max: number | null;
  sort_order: number;
  essential_tier: PmocEssentialTier | null;
  activity_group: PmocActivityGroup | null;
}

/** Rótulo PT-BR de cada seção da norma (chave técnica → texto pro gestor). */
export const PMOC_SECTION_LABELS: Record<string, string> = {
  condicionadores: 'Condicionadores de Ar (Split/ACJ)',
  dutos: 'Dutos de Ar',
  tomada_ar_exterior: 'Tomada de Ar Exterior',
  casa_maquinas: 'Casa de Máquinas',
  quadros_eletricos: 'Quadros Elétricos',
  medicoes: 'Medições',
  testes: 'Testes',
  tubulacao_hidraulica: 'Tubulação Hidráulica',
  torres_resfriamento: 'Torres de Resfriamento',
  bombas_agua: 'Bombas de Água',
  caixa_expansao: 'Caixa de Expansão',
  tratamento_quimico: 'Tratamento Químico',
  qualidade_ar: 'Qualidade do Ar',
};

/** Seção universal de split/AC, pré-carregada por padrão num contrato PMOC novo. */
export const PMOC_DEFAULT_SECTION = 'condicionadores';

export function pmocSectionLabel(section: string): string {
  return PMOC_SECTION_LABELS[section] ?? section;
}

export interface PmocCatalogSectionGroup {
  section: string;
  label: string;
  activities: PmocCatalogActivity[];
}

// ── Conjunto ESSENCIAL ───────────────────────────────────────────────────────
// O escopo da máquina ('ac' = Expansão Direta; 'full' = Sistemas Centrais) define
// quais tiers contam como essenciais. Expansão Direta = só 'base'; Sistemas
// Centrais herda 'base' e adiciona 'central'. ('infra' é Fase 2 — equipamento de
// infraestrutura à parte — e nunca entra no essencial da máquina.)
export type PmocEssentialScope = 'ac' | 'full';

const ESSENTIAL_TIERS_BY_SCOPE: Record<PmocEssentialScope, ReadonlySet<PmocEssentialTier>> = {
  ac: new Set<PmocEssentialTier>(['base']),
  full: new Set<PmocEssentialTier>(['base', 'central']),
};

/** A atividade pertence ao conjunto essencial do escopo dado? */
export function isEssentialFor(
  activity: Pick<PmocCatalogActivity, 'essential_tier'>,
  scope: PmocEssentialScope,
): boolean {
  return !!activity.essential_tier && ESSENTIAL_TIERS_BY_SCOPE[scope].has(activity.essential_tier);
}

/**
 * A atividade é o essencial de INFRAESTRUTURA (Fase 2)? São os itens de torre,
 * bombas, tratamento químico, quadros e QAI que o cliente marca rápido ao montar
 * um equipamento de infraestrutura. Independe do escopo da máquina — o selo
 * "Essencial" da infra usa este predicado (não o ESSENTIAL_TIERS_BY_SCOPE, que só
 * cobre base/central da máquina de ar).
 */
export function isInfraEssential(
  activity: Pick<PmocCatalogActivity, 'essential_tier'>,
): boolean {
  return activity.essential_tier === 'infra';
}

// ── Grupos de exibição por TIPO de tarefa (Expansão Direta) ──────────────────
// Ordem fixa pedida pelo CEO: LIMPEZA · INSPEÇÃO · MEDIÇÕES · TESTES.
export const PMOC_ACTIVITY_GROUP_ORDER: PmocActivityGroup[] = ['limpeza', 'inspecao', 'medicao', 'teste'];

export const PMOC_ACTIVITY_GROUP_LABELS: Record<PmocActivityGroup, string> = {
  limpeza: 'Limpeza',
  inspecao: 'Inspeção',
  medicao: 'Medições',
  teste: 'Testes',
};

export function pmocActivityGroupLabel(group: PmocActivityGroup): string {
  return PMOC_ACTIVITY_GROUP_LABELS[group];
}

export interface PmocCatalogActivityGroupBlock {
  group: PmocActivityGroup;
  label: string;
  activities: PmocCatalogActivity[];
}

/**
 * Agrupa uma lista de atividades por `activity_group`, na ordem fixa
 * LIMPEZA/INSPEÇÃO/MEDIÇÕES/TESTES. Atividades sem grupo (NULL) são ignoradas
 * aqui (elas pertencem ao display por section de Sistemas Centrais). Grupos
 * vazios não aparecem.
 */
export function groupActivitiesByType(
  activities: PmocCatalogActivity[],
): PmocCatalogActivityGroupBlock[] {
  const byGroup = new Map<PmocActivityGroup, PmocCatalogActivity[]>();
  for (const a of activities) {
    if (!a.activity_group) continue;
    const arr = byGroup.get(a.activity_group) ?? [];
    arr.push(a);
    byGroup.set(a.activity_group, arr);
  }
  return PMOC_ACTIVITY_GROUP_ORDER.filter((g) => (byGroup.get(g)?.length ?? 0) > 0).map((g) => ({
    group: g,
    label: PMOC_ACTIVITY_GROUP_LABELS[g],
    activities: byGroup.get(g)!,
  }));
}

export function usePmocActivityCatalog() {
  const { data, isLoading } = useQuery({
    queryKey: ['pmoc-activity-catalog'],
    staleTime: 1000 * 60 * 60, // catálogo estável — 1h
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pmoc_activity_catalog')
        .select(
          'id, section, component, description, guidance, default_freq_code, is_measurement, unit, expected_min, expected_max, sort_order, essential_tier, activity_group',
        )
        .eq('is_active', true)
        .order('section', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PmocCatalogActivity[];
    },
  });

  const activities = useMemo(() => data ?? [], [data]);

  // Agrupado por seção (e já ordenado por sort_order dentro da seção pela query).
  const groups = useMemo<PmocCatalogSectionGroup[]>(() => {
    const bySection = new Map<string, PmocCatalogActivity[]>();
    for (const a of activities) {
      const arr = bySection.get(a.section) ?? [];
      arr.push(a);
      bySection.set(a.section, arr);
    }
    return Array.from(bySection.entries()).map(([section, acts]) => ({
      section,
      label: pmocSectionLabel(section),
      activities: acts,
    }));
  }, [activities]);

  // Atividades da seção universal (split/AC) — usadas pra pré-carregar o plano
  // padrão de um contrato PMOC novo.
  const defaultSectionActivities = useMemo(
    () => activities.filter(a => a.section === PMOC_DEFAULT_SECTION),
    [activities],
  );

  return { activities, groups, defaultSectionActivities, isLoading };
}
