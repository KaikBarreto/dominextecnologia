import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FormQuestion } from '@/types/database';

const QUESTION_COLUMNS =
  'id, template_id, question, question_type, position, freq_kind, freq_months, freq_days, freq_visits, start_kind, start_visit';

/**
 * Perguntas do CHECKLIST PADRÃO de um contrato comum (Fase C — documento "Plano
 * de Manutenção"). O checklist vem de `contracts.form_template_id` (o Checklist
 * Padrão do contrato). Carrega as `form_questions` desse template já ordenadas,
 * com os campos de frequência (freq_*), pra o documento rotular cada item e
 * rodar o motor de planejamento.
 *
 * Hook é a fronteira do Supabase: o componente nunca chama `supabase.from`.
 * Sem template → query desabilitada, devolve lista vazia.
 */
export function useContractChecklistQuestions(formTemplateId: string | null | undefined) {
  return useQuery({
    queryKey: ['contract-checklist-questions', formTemplateId],
    enabled: !!formTemplateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_questions')
        .select(QUESTION_COLUMNS)
        .eq('template_id', formTemplateId!)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as FormQuestion[];
    },
  });
}

/**
 * Perguntas de VÁRIOS templates de uma vez — usado pelo documento "Plano de
 * Manutenção" quando o checklist é POR EQUIPAMENTO (`contract_items.form_template_id`).
 * Cada equipamento tem o seu template, então buscamos todos numa tacada e
 * agrupamos por `template_id` (já ordenadas por `position`).
 *
 * Devolve um Map<templateId, FormQuestion[]>. Lista de ids vazia → Map vazio,
 * query desabilitada.
 */
export function useChecklistQuestionsByTemplates(templateIds: string[]) {
  // Dedup + ordena pra estabilizar a queryKey (mesmo conjunto = mesmo cache).
  const uniqueIds = Array.from(new Set(templateIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['checklist-questions-by-templates', uniqueIds],
    enabled: uniqueIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_questions')
        .select(QUESTION_COLUMNS)
        .in('template_id', uniqueIds)
        .order('position', { ascending: true });

      if (error) throw error;
      const rows = (data ?? []) as unknown as FormQuestion[];
      const byTemplate = new Map<string, FormQuestion[]>();
      for (const q of rows) {
        const tid = (q as { template_id?: string | null }).template_id;
        if (!tid) continue;
        const arr = byTemplate.get(tid);
        if (arr) arr.push(q);
        else byTemplate.set(tid, [q]);
      }
      return byTemplate;
    },
  });
}
