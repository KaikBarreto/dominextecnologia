import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CrmLabel {
  id: string;
  name: string;
  color: string;
}

export interface CrmChecklistTemplateItem {
  id: string;
  text: string;
}

export interface CrmChecklistTemplate {
  id: string;
  name: string;
  items: CrmChecklistTemplateItem[];
}

export interface CrmLeadChecklistItem extends CrmChecklistTemplateItem {
  done: boolean;
}

export interface CrmLeadChecklist {
  id: string;
  title: string;
  templateId?: string | null;
  items: CrmLeadChecklistItem[];
}

export function createCrmCardItemId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `crm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeCrmChecklistTemplateItems(value: unknown): CrmChecklistTemplateItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
    if (!text) return [];
    return [{
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createCrmCardItemId(),
      text,
    }];
  });
}

export function normalizeCrmLeadChecklists(value: unknown): CrmLeadChecklist[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((checklist) => {
    if (!checklist || typeof checklist !== 'object') return [];
    const candidate = checklist as Record<string, unknown>;
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    if (!title) return [];
    const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
    const items = rawItems.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const text = typeof row.text === 'string' ? row.text.trim() : '';
      if (!text) return [];
      return [{
        id: typeof row.id === 'string' && row.id ? row.id : createCrmCardItemId(),
        text,
        done: row.done === true,
      }];
    });
    return [{
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createCrmCardItemId(),
      title,
      templateId: typeof candidate.templateId === 'string' ? candidate.templateId : null,
      items,
    }];
  });
}

export function useCrmLabels(admin = false) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = [admin ? 'admin-crm-labels' : 'crm-labels'];
  const table = admin ? 'admin_crm_labels' : 'crm_labels';

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CrmLabel[];
    },
  });

  const createLabel = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const payload: Record<string, unknown> = { name: name.trim(), color };
      if (!admin) payload.company_id = await getCurrentUserCompanyId();
      if (!admin && !payload.company_id) throw new Error('Empresa não encontrada');
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data as CrmLabel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Etiqueta criada' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível criar a etiqueta', description: getErrorMessage(error) }),
  });

  const updateLabel = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await supabase.from(table).update({ name: name.trim(), color }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível atualizar a etiqueta', description: getErrorMessage(error) }),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [admin ? 'admin-leads' : 'leads'] });
      toast({ title: 'Etiqueta excluída' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível excluir a etiqueta', description: getErrorMessage(error) }),
  });

  return { labels: query.data ?? [], isLoading: query.isLoading, createLabel, updateLabel, deleteLabel };
}

export function useCrmChecklistTemplates(admin = false) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = [admin ? 'admin-crm-checklist-templates' : 'crm-checklist-templates'];
  const table = admin ? 'admin_crm_checklist_templates' : 'crm_checklist_templates';

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('id, name, items')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name),
        items: normalizeCrmChecklistTemplateItems(row.items),
      })) as CrmChecklistTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async ({ name, items }: { name: string; items: CrmChecklistTemplateItem[] }) => {
      const payload: Record<string, unknown> = { name: name.trim(), items };
      if (!admin) payload.company_id = await getCurrentUserCompanyId();
      if (!admin && !payload.company_id) throw new Error('Empresa não encontrada');
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Modelo de checklist criado' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível criar o modelo', description: getErrorMessage(error) }),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, name, items }: { id: string; name: string; items: CrmChecklistTemplateItem[] }) => {
      const { error } = await supabase.from(table).update({ name: name.trim(), items }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível atualizar o modelo', description: getErrorMessage(error) }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Modelo excluído' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível excluir o modelo', description: getErrorMessage(error) }),
  });

  return { templates: query.data ?? [], isLoading: query.isLoading, createTemplate, updateTemplate, deleteTemplate };
}

export function useLeadCardTools(leadId: string | null | undefined, admin = false) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = [admin ? 'admin-lead-card-tools' : 'lead-card-tools', leadId];
  const table = admin ? 'admin_leads' : 'leads';

  const query = useQuery({
    queryKey,
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('crm_label_ids, crm_checklists')
        .eq('id', leadId)
        .maybeSingle();
      if (error) throw error;
      return {
        labelIds: Array.isArray(data?.crm_label_ids) ? data.crm_label_ids.filter((id: unknown): id is string => typeof id === 'string') : [],
        checklists: normalizeCrmLeadChecklists(data?.crm_checklists),
      };
    },
  });

  const updateCardTools = useMutation({
    mutationFn: async (updates: { labelIds?: string[]; checklists?: CrmLeadChecklist[] }) => {
      if (!leadId) throw new Error('Oportunidade não encontrada');
      const payload: Record<string, unknown> = {};
      if (updates.labelIds) payload.crm_label_ids = updates.labelIds;
      if (updates.checklists) payload.crm_checklists = updates.checklists;
      const { error } = await supabase.from(table).update(payload).eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [admin ? 'admin-leads' : 'leads'] });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Não foi possível atualizar a oportunidade', description: getErrorMessage(error) }),
  });

  return {
    labelIds: query.data?.labelIds ?? [],
    checklists: query.data?.checklists ?? [],
    isLoading: query.isLoading,
    updateCardTools,
  };
}
