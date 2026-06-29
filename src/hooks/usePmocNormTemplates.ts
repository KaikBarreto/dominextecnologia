// Hook do EDITOR INLINE de checklist do PMOC novo (P2 — unificação no motor do
// contrato comum). Materializa e carrega os 4 templates de NORMA da empresa (2
// famílias × 2 camadas) que alimentam o CommonChecklistEditor de cada máquina:
//
//   família 'expansao_direta'  → ar-condicionado (split/ACJ/cassete…)
//   família 'sistemas_centrais'→ grande porte/infra (VRF, chiller, torres…)
//   camada  'essencial'        → conjunto essencial da norma (default enxuto)
//   camada  'complementar'     → resto da norma ("Norma completa" = essencial + complementar)
//
// Fluxo:
//  1. Ao montar o ramo PMOC NOVO, chama a RPC `ensure_pmoc_norm_templates`
//     (idempotente — UPSERT por (company_id, pmoc_family, pmoc_tier); barato e
//     seguro de rodar sempre que abrir).
//  2. Carrega os form_templates de norma (is_pmoc_default = true AND pmoc_family
//     NOT NULL) COM suas form_questions, no MESMO shape que o contrato comum usa
//     (ChecklistTemplateOption: id/name/questions[id,question,position,freq_*]).
//  3. Expõe os metadados pmoc_family + pmoc_tier por template, pra (a) agrupar o
//     select de adicionar por família e (b) escolher o default por escopo da
//     máquina (essencial da família correspondente).
//
// NÃO toca o caminho legado do PMOC (catálogo/contract_plan_activities/
// pmoc_start_visit) — coexistência total. Hook é a fronteira do Supabase.
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import type { ChecklistTemplateOption } from '@/components/contracts/CommonChecklistEditor';

// Valores canônicos das colunas pmoc_family / pmoc_tier (espelham os CHECK da
// migration 20260628160000 e as 2 famílias do PmocChecklistPicker).
export type PmocNormFamily = 'expansao_direta' | 'sistemas_centrais';
export type PmocNormTier = 'essencial' | 'complementar';

// Template de norma com os metadados de agrupamento/seleção. Estende a forma que
// o CommonChecklistEditor consome (ChecklistTemplateOption) com família + camada.
export interface PmocNormTemplate extends ChecklistTemplateOption {
  family: PmocNormFamily;
  tier: PmocNormTier;
}

interface UsePmocNormTemplatesArgs {
  // Empresa logada. A RPC só roda e a query só ativa quando presente.
  companyId: string | null | undefined;
  // Só materializa/carrega quando o ramo PMOC novo está ativo (gate do chamador):
  // contrato PMOC + NÃO em edição de um PMOC legado (discriminador no componente).
  enabled: boolean;
}

// Mapeia uma form_question (norma) → ChecklistQuestion do editor comum. Só o
// subset que o editor lê: id, texto, posição e a frequência (freq_*/start_*).
function mapNormQuestion(q: any): ChecklistTemplateOption['questions'][number] {
  return {
    id: q.id,
    question: q.question,
    position: q.position ?? null,
    freq_kind: q.freq_kind ?? null,
    freq_months: q.freq_months ?? null,
    freq_days: q.freq_days ?? null,
    freq_visits: q.freq_visits ?? null,
    start_kind: q.start_kind ?? null,
    start_visit: q.start_visit ?? null,
  };
}

export function usePmocNormTemplates({ companyId, enabled }: UsePmocNormTemplatesArgs) {
  const { toast } = useToast();
  // Guard pra avisar (toast) só uma vez por erro de materialização (não spammar).
  const ensureErrorShownRef = useRef(false);

  // Passo 1: materializa os templates de norma (idempotente). Roda uma vez por
  // (companyId, enabled). Erro não bloqueia a tela — apenas avisa e a query
  // segue (se já houver templates de antes, ainda carregam).
  useEffect(() => {
    if (!enabled || !companyId) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.rpc('ensure_pmoc_norm_templates', {
        p_company_id: companyId,
      });
      if (cancelled) return;
      if (error) {
        if (!ensureErrorShownRef.current) {
          ensureErrorShownRef.current = true;
          toast({
            variant: 'destructive',
            title: 'Não foi possível preparar os checklists da norma',
            description: getErrorMessage(error),
          });
        }
      } else {
        ensureErrorShownRef.current = false;
        // Garante que a query pegue o que a RPC acabou de materializar.
        void refetch();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, companyId]);

  // Passo 2: carrega os templates de norma da empresa COM perguntas. Mesma forma
  // de carga do contrato comum (form_templates + questions:form_questions), mas
  // filtrando os de NORMA (is_pmoc_default + pmoc_family NOT NULL).
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pmoc-norm-templates', companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, name, pmoc_family, pmoc_tier, is_active, questions:form_questions(*)')
        .eq('company_id', companyId!)
        .eq('is_pmoc_default', true)
        .not('pmoc_family', 'is', null)
        .eq('is_active', true);
      if (error) throw error;
      return (data as any[])
        .filter((t) => t.pmoc_family && t.pmoc_tier)
        .map<PmocNormTemplate>((t) => ({
          id: t.id,
          name: t.name,
          family: t.pmoc_family as PmocNormFamily,
          tier: t.pmoc_tier as PmocNormTier,
          questions: ((t.questions ?? []) as any[]).map(mapNormQuestion),
        }));
    },
  });

  // Avisa (uma vez) se a carga falhar — não bloqueia a tela.
  const loadErrorShownRef = useRef(false);
  useEffect(() => {
    if (error && !loadErrorShownRef.current) {
      loadErrorShownRef.current = true;
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar os checklists da norma',
        description: getErrorMessage(error),
      });
    }
    if (!error) loadErrorShownRef.current = false;
  }, [error, toast]);

  const templates = useMemo<PmocNormTemplate[]>(() => data ?? [], [data]);

  // Resolve o template de norma de uma (família, camada). undefined se ainda não
  // materializou/carregou.
  const findTemplate = useMemo(() => {
    const byKey = new Map<string, PmocNormTemplate>();
    for (const t of templates) byKey.set(`${t.family}:${t.tier}`, t);
    return (family: PmocNormFamily, tier: PmocNormTier): PmocNormTemplate | undefined =>
      byKey.get(`${family}:${tier}`);
  }, [templates]);

  return {
    templates,
    isLoading: isLoading && enabled,
    findTemplate,
    refetch,
  };
}

// Mapeia o escopo da máquina (PmocMachineScope: 'ac' | 'full') → família de
// norma. 'ac' = Expansão Direta; 'full' = Sistemas Centrais. Fonte única pra
// default por escopo (o componente pré-seleciona o ESSENCIAL desta família).
export function familyForScope(scope: 'ac' | 'full'): PmocNormFamily {
  return scope === 'ac' ? 'expansao_direta' : 'sistemas_centrais';
}
