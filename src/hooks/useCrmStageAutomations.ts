import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import type { CrmAutomationRule, CrmAutomationRuleInput } from '@/types/crmAutomation';

const rulesKey = (pipelineId?: string | null) => ['crm-automation-rules', pipelineId] as const;

export function useCrmStageAutomations(pipelineId?: string | null) {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({
    queryKey: rulesKey(pipelineId),
    enabled: Boolean(pipelineId),
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_automation_rules').select('*').eq('pipeline_id', pipelineId!).order('position').order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as CrmAutomationRule[];
    },
  });
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
      const request = input.id ? supabase.from('crm_automation_rules').update(payload).eq('id', input.id) : supabase.from('crm_automation_rules').insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });
  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('crm_automation_rules').update({ enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_automation_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });
  return {
    rules: rulesQuery.data ?? [], isLoading: rulesQuery.isLoading, error: rulesQuery.error,
    resources: resourcesQuery.data ?? { users: [], labels: [], templates: [], pipelines: [], stages: [] },
    saveRule, toggleRule, deleteRule,
  };
}
