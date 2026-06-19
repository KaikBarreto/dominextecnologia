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

export function usePmocActivityCatalog() {
  const { data, isLoading } = useQuery({
    queryKey: ['pmoc-activity-catalog'],
    staleTime: 1000 * 60 * 60, // catálogo estável — 1h
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pmoc_activity_catalog')
        .select(
          'id, section, component, description, guidance, default_freq_code, is_measurement, unit, expected_min, expected_max, sort_order',
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
