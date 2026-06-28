import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FormQuestion } from '@/types/database';

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
        .select(
          'id, template_id, question, question_type, position, freq_kind, freq_months, freq_days, freq_visits, start_kind, start_visit',
        )
        .eq('template_id', formTemplateId!)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as FormQuestion[];
    },
  });
}
