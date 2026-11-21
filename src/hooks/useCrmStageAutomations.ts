import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import type { CrmAutomationRule, CrmAutomationRuleInput } from '@/types/crmAutomation';
import { assertRowsAffected } from '@/lib/supabaseMutation';

const rulesKey = (pipelineId?: string | null) => ['crm-automation-rules', pipelineId] as const;

function useRulesQuery(pipelineId?: string | null) {
  return useQuery({
    queryKey: rulesKey(pipelineId),
    enabled: Boolean(pipelineId),
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_automation_rules').select('*').eq('pipeline_id', pipelineId!).order('position').order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as CrmAutomationRule[];
    },
  });
}

/**
 * Só a relação de automações do funil, no MESMO cache do editor. Serve pra
 * lista de etapas mostrar quantas automações cada uma tem sem carregar
 * usuários, etiquetas e modelos que só o editor usa.
 */
export function useCrmAutomationRules(pipelineId?: string | null) {
  const rulesQuery = useRulesQuery(pipelineId);
  return { rules: rulesQuery.data ?? [] };
}

export function useCrmStageAutomations(pipelineId?: string | null) {
  const queryClient = useQueryClient();
  const rulesQuery = useRulesQuery(pipelineId);
  const resourcesQuery = useQuery({
    queryKey: ['crm-automation-resources'],
    queryFn: async () => {
      const companyId = await getCurrentUserCompanyId();
      const [users, labels, templates, pipelines, stages] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email').eq('company_id', companyId).eq('is_active', true).order('full_name'),
        supabase.from('crm_labels').select('id, name, color').eq('company_id', companyId).order('name'),
        supabase.from('crm_checklist_templates').select('id, name').eq('company_id', companyId).order('name'),
        supabase.from('crm_pipelines').select('id, name').eq('company_id', companyId).order('position'),
        supabase.from('crm_stages').select('id, name, pipeline_id, is_lost').eq('company_id', companyId).order('position'),
      ]);
      const error = users.error ?? labels.error ?? templates.error ?? pipelines.error ?? stages.error;
      if (error) throw error;
      return { users: users.data ?? [], labels: labels.data ?? [], templates: templates.data ?? [], pipelines: pipelines.data ?? [], stages: stages.data ?? [] };
    },
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: rulesKey(pipelineId) });
  const saveRule = useMutation({
    mutationFn: async (input: CrmAutomationRuleInput) => {
      const company_id = await getCurrentUserCompanyId();
      const payload = { company_id, pipeline_id: input.pipeline_id, trigger_stage_id: input.trigger_stage_id, name: input.name.trim(), trigger_type: input.trigger_type, trigger_config: input.trigger_config as Json, actions: input.actions as unknown as Json, enabled: input.enabled, position: input.position ?? rulesQuery.data?.length ?? 0 };
      if (input.id) {
        assertRowsAffected(
          await supabase.from('crm_automation_rules').update(payload, { count: 'exact' }).eq('id', input.id),
          'update',
        );
      } else {
        const { error } = await supabase.from('crm_automation_rules').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => void invalidate(),
  });
  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      assertRowsAffected(
        await supabase.from('crm_automation_rules').update({ enabled }, { count: 'exact' }).eq('id', id),
        'update',
      );
    },
    onSuccess: () => void invalidate(),
  });
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      assertRowsAffected(
        await supabase.from('crm_automation_rules').delete({ count: 'exact' }).eq('id', id),
        'delete',
      );
    },
    onSuccess: () => void invalidate(),
  });
  return {
    rules: rulesQuery.data ?? [], isLoading: rulesQuery.isLoading, error: rulesQuery.error,
    resources: resourcesQuery.data ?? { users: [], labels: [], templates: [], pipelines: [], stages: [] },
    saveRule, toggleRule, deleteRule,
  };
}
