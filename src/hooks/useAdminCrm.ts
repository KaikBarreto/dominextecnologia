import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import {
  STAGE_CHANGE_INTERACTION_TYPE,
  buildStageChangeDescription,
  shouldLogStageChange,
} from '@/lib/leadStageHistory';

export interface AdminCrmStage {
  id: string;
  name: string;
  color: string;
  /** Nome de um ícone lucide (ex: 'Phone'), desenhado no cabeçalho da coluna do
   *  funil. Opcional — etapa sem ícone só mostra o nome. Paridade com
   *  `crm_stages.icon` do CRM do tenant. */
  icon: string | null;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
  pipeline_id: string;
}

export interface AdminCrmPipeline {
  id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminLead {
  id: string;
  title: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  value: number | null;
  probability: number | null;
  expected_close_date: string | null;
  source: string | null;
  segment: string | null;
  segments?: string[];
  stage_id: string | null;
  notes: string | null;
  loss_reason: string | null;
  created_by: string | null;
  responsible_id: string | null;
  pipeline_id: string;
  created_at: string;
  updated_at: string;
  crm_label_ids?: string[];
  crm_checklists?: unknown;
  assignees?: AdminLeadAssignee[];
}

export interface AdminLeadAssignee {
  user_id: string;
  is_primary: boolean;
}

type AdminLeadMutationInput = Partial<AdminLead> & {
  assignee_user_ids?: string[];
};

const NO_ADMIN_PIPELINES: AdminCrmPipeline[] = [];

export function useAdminCrmPipelines() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-crm-pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_crm_pipelines')
        .select('*')
        .order('position');
      if (error) throw error;
      return (data || []) as unknown as AdminCrmPipeline[];
    },
  });

  const pipelines = query.data ?? NO_ADMIN_PIPELINES;
  const defaultPipeline = pipelines.find((pipeline) => pipeline.is_default) ?? pipelines[0] ?? null;

  const createPipeline = useMutation({
    mutationFn: async (input: { name: string; color?: string }) => {
      const nextPosition = pipelines.length > 0
        ? Math.max(...pipelines.map((pipeline) => pipeline.position)) + 1
        : 0;
      const { data, error } = await supabase
        .from('admin_crm_pipelines')
        .insert({ name: input.name, color: input.color ?? '#2563EB', position: nextPosition, is_default: pipelines.length === 0 })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AdminCrmPipeline;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-crm-pipelines'] });
      toast({ title: 'Funil criado!' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao criar funil', description: getErrorMessage(error) }),
  });

  const updatePipeline = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; color?: string; position?: number }) => {
      const { data, error } = await supabase
        .from('admin_crm_pipelines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AdminCrmPipeline;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-crm-pipelines'] }),
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao atualizar funil', description: getErrorMessage(error) }),
  });

  const setDefaultPipeline = useMutation({
    mutationFn: async (id: string) => {
      const current = pipelines.find((pipeline) => pipeline.is_default && pipeline.id !== id);
      if (current) {
        const { error } = await supabase
          .from('admin_crm_pipelines')
          .update({ is_default: false })
          .eq('id', current.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from('admin_crm_pipelines')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-crm-pipelines'] });
      toast({ title: 'Funil padrão atualizado!' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao definir funil padrão', description: getErrorMessage(error) }),
  });

  const reorderPipelines = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, position) =>
          supabase.from('admin_crm_pipelines').update({ position }).eq('id', id),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-crm-pipelines'] }),
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao reordenar funis', description: getErrorMessage(error) }),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      if (pipelines.length <= 1) throw new Error('LAST_ADMIN_PIPELINE');
      const pipeline = pipelines.find((item) => item.id === id);
      if (pipeline?.is_default) {
        const next = pipelines.find((item) => item.id !== id);
        if (next) {
          const { error: clearError } = await supabase
            .from('admin_crm_pipelines')
            .update({ is_default: false })
            .eq('id', pipeline.id);
          if (clearError) throw clearError;
          const { error } = await supabase
            .from('admin_crm_pipelines')
            .update({ is_default: true })
            .eq('id', next.id);
          if (error) throw error;
        }
      }
      const { error } = await supabase.from('admin_crm_pipelines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-crm-pipelines'] });
      toast({ title: 'Funil excluído!' });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'Não foi possível excluir o funil',
      description: error instanceof Error && error.message === 'LAST_ADMIN_PIPELINE'
        ? 'Crie outro funil antes de excluir o único existente.'
        : 'Remova ou mova as etapas e oportunidades deste funil antes de excluí-lo.',
    }),
  });

  return {
    pipelines,
    defaultPipeline,
    isLoading: query.isLoading,
    createPipeline,
    updatePipeline,
    setDefaultPipeline,
    reorderPipelines,
    deletePipeline,
  };
}

export interface AdminLeadInteraction {
  id: string;
  lead_id: string;
  interaction_type: string;
  description: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_by: string | null;
  created_at: string;
  /** Nome de quem registrou (resolvido via profiles). Pode ser null (sistema). */
  author_name?: string | null;
}

export const ADMIN_LEAD_SOURCES = [
  'Tráfego Pago',
  'Site/Google',
  'Facebook/Instagram',
  'ChatGPT/IAs',
  'Indicação',
  'BNI',
  'Parceiro',
  'Feira/Evento',
  'Outro',
];

export const ADMIN_INTERACTION_TYPES = [
  { value: 'ligacao', label: 'Ligação', icon: '📞' },
  { value: 'email', label: 'E-mail', icon: '📧' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'reuniao', label: 'Reunião', icon: '🤝' },
  { value: 'demonstracao', label: 'Demonstração', icon: '🖥️' },
  { value: 'proposta', label: 'Proposta Enviada', icon: '📄' },
  { value: 'outro', label: 'Outro', icon: '📝' },
];

export function useAdminCrmStages(pipelineId?: string | null) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-crm-stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_crm_stages' as any)
        .select('*')
        .order('position');
      if (error) throw error;
      return (data || []) as unknown as AdminCrmStage[];
    },
  });

  const createStage = useMutation({
    mutationFn: async (input: { name: string; color?: string; icon?: string | null; position?: number; is_won?: boolean; is_lost?: boolean; pipeline_id?: string }) => {
      const payload = pipelineId && !input.pipeline_id ? { ...input, pipeline_id: pipelineId } : input;
      const { data, error } = await supabase.from('admin_crm_stages' as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crm-stages'] }); toast({ title: 'Etapa criada!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AdminCrmStage> & { id: string }) => {
      const { error } = await supabase.from('admin_crm_stages' as any).update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crm-stages'] }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_crm_stages' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crm-stages'] }); toast({ title: 'Etapa removida!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  /**
   * Reordena o funil a partir da lista COMPLETA de ids na ordem nova (mesma
   * assinatura do `reorderStages` do CRM do tenant). Recebe a lista inteira de
   * propósito: gravar posição a partir de uma lista parcial (ex.: com etapas
   * escondidas pela busca) embaralharia o funil de todo mundo.
   */
  const reorderStages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, position) =>
          supabase.from('admin_crm_stages' as any).update({ position }).eq('id', id),
        ),
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crm-stages'] }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const allStages = query.data || [];
  const stages = pipelineId ? allStages.filter((stage) => stage.pipeline_id === pipelineId) : allStages;
  const getStageHex = (stageId: string | null) => stages.find(s => s.id === stageId)?.color || '#6B7280';

  return { stages, allStages, isLoading: query.isLoading, createStage, updateStage, deleteStage, reorderStages, getStageHex };
}

export function useAdminLeads() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_leads' as any)
        .select('*, admin_lead_assignees(user_id, is_primary)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown as Array<AdminLead & { admin_lead_assignees?: AdminLeadAssignee[] }>).map((lead) => {
        const assignees = [...(lead.admin_lead_assignees ?? [])].sort(
          (a, b) => Number(b.is_primary) - Number(a.is_primary),
        );
        const { admin_lead_assignees: _relation, ...rest } = lead;
        return {
          ...rest,
          segments: lead.segments?.length
            ? lead.segments
            : lead.segment
              ? [lead.segment]
              : [],
          assignees: assignees.length > 0
            ? assignees
            : lead.responsible_id
              ? [{ user_id: lead.responsible_id, is_primary: true }]
              : [],
        };
      });
    },
  });

  const createLead = useMutation({
    mutationFn: async (input: AdminLeadMutationInput) => {
      // `title` é explícito no formulário. O fallback protege importações e
      // integrações antigas que ainda criem oportunidades sem esse campo.
      const autoTitle =
        (input.title?.trim?.() || '') ||
        input.company_name?.trim() ||
        input.contact_name?.trim() ||
        input.phone?.trim() ||
        'Lead sem identificação';
      const { assignee_user_ids = [], assignees: _assignees, ...leadInput } = input;
      const payload = {
        ...leadInput,
        title: autoTitle,
        responsible_id: assignee_user_ids[0] ?? null,
      };
      const { data, error } = await supabase.from('admin_leads' as any).insert(payload).select().single();
      if (error) throw error;
      const createdLead = data as unknown as AdminLead;
      const { error: assigneesError } = await supabase.rpc('set_admin_lead_assignees', {
        _lead_id: createdLead.id,
        _user_ids: assignee_user_ids,
      });
      if (assigneesError) throw assigneesError;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead criado!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...input }: AdminLeadMutationInput & { id: string }) => {
      // Snapshot do estágio ANTES do update. Este é o ÚNICO caminho de escrita
      // de `admin_leads.stage_id` no painel (arrastar no kanban, Ganhar/Perder
      // no modal e o form de edição passam todos por aqui), então centralizar
      // o registro de histórico aqui garante que nenhum caminho fica de fora.
      // Lê do cache de `admin-leads`, que já está carregado pra desenhar a tela.
      const { assignee_user_ids, assignees: _assignees, ...leadInput } = input;
      const isStageUpdate = 'stage_id' in leadInput;
      const nextStageId = leadInput.stage_id as string | null | undefined;
      const previousStageId = isStageUpdate
        ? ((qc.getQueryData<AdminLead[]>(['admin-leads']) || []).find(l => l.id === id)?.stage_id ?? null)
        : null;

      // `.single()` evita falso positivo: PostgREST não considera "0 linhas"
      // erro em update/delete comuns (ex.: RLS ou registro removido em outra
      // aba). O CRUD só confirma sucesso quando a oportunidade foi encontrada.
      const { error } = await supabase
        .from('admin_leads' as any)
        .update(leadInput)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;

      if (assignee_user_ids) {
        const { error: assigneesError } = await supabase.rpc('set_admin_lead_assignees', {
          _lead_id: id,
          _user_ids: assignee_user_ids,
        });
        if (assigneesError) throw assigneesError;
      }

      // Só grava quando o estágio de fato mudou — soltar o card na mesma coluna
      // ou salvar o form sem mexer no estágio não pode virar ruído no histórico.
      // Falha aqui NÃO derruba o update (que já foi commitado acima): pro
      // usuário o card já mudou de coluna de qualquer jeito.
      if (isStageUpdate && shouldLogStageChange(previousStageId, nextStageId)) {
        try {
          const idsToFetch = previousStageId ? [previousStageId, nextStageId] : [nextStageId];
          const { data: stagesData } = await supabase
            .from('admin_crm_stages' as any)
            .select('id, name')
            .in('id', idsToFetch);
          const nameById = new Map(
            ((stagesData || []) as unknown as { id: string; name: string }[]).map(s => [s.id, s.name]),
          );

          const { data: userData } = await supabase.auth.getUser();
          // O histórico registra a troca de etapa; o funil é inferido pela
          // própria etapa e fica preservado no snapshot do lead.
          await supabase.from('admin_lead_interactions' as any).insert({
            lead_id: id,
            interaction_type: STAGE_CHANGE_INTERACTION_TYPE,
            description: buildStageChangeDescription({
              from_stage_id: previousStageId,
              from_stage_name: previousStageId ? nameById.get(previousStageId) ?? null : null,
              to_stage_id: nextStageId,
              to_stage_name: nameById.get(nextStageId) ?? null,
            }),
            created_by: userData.user?.id,
          });
        } catch (logError) {
          console.error('Falha ao registrar mudança de estágio no histórico do lead', logError);
        }
      }

      return { id, loggedStageChange: isStageUpdate && shouldLogStageChange(previousStageId, nextStageId) };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      qc.invalidateQueries({ queryKey: ['admin-lead', result.id] });
      if (result?.loggedStageChange) {
        qc.invalidateQueries({ queryKey: ['admin-lead-interactions', result.id] });
      }
      toast({ title: 'Lead atualizado!' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  /**
   * Grava SÓ `notes`, em silêncio (sem toast). É o que o autosave de
   * "Observações" do modal de detalhe usa: com `updateLead` o usuário levaria
   * um toast "Lead atualizado!" a cada 800ms de digitação. Espelha o
   * `updateLeadNotes` do CRM do tenant.
   */
  const updateLeadNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string | null }) => {
      const { error } = await supabase
        .from('admin_leads' as any)
        .update({ notes })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      qc.invalidateQueries({ queryKey: ['admin-lead', variables.id] });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('admin_leads' as any)
        .delete()
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      qc.removeQueries({ queryKey: ['admin-lead', id] });
      toast({ title: 'Lead removido!' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const leads = query.data || [];

  const stats = {
    total: leads.length,
    totalValue: leads.reduce((s, l) => s + Number(l.value || 0), 0),
  };

  return { leads, isLoading: query.isLoading, createLead, updateLead, updateLeadNotes, deleteLead, stats };
}

/**
 * Carrega um único lead por id (pra abrir o AdminLeadDetailModal a partir de um
 * contexto que não tem a lista completa em mãos — ex.: a tarefa de follow-up).
 */
export function useAdminLead(leadId?: string) {
  const query = useQuery({
    queryKey: ['admin-lead', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_leads' as any)
        .select('*')
        .eq('id', leadId!)
        .maybeSingle();
      if (error) throw error;
      const lead = (data as unknown as AdminLead) || null;
      if (!lead) return null;
      return {
        ...lead,
        segments: lead.segments?.length
          ? lead.segments
          : lead.segment
            ? [lead.segment]
            : [],
      };
    },
    enabled: !!leadId,
  });

  return { lead: query.data ?? null, isLoading: query.isLoading };
}

export function useAdminLeadInteractions(leadId?: string) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-lead-interactions', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_lead_interactions' as any)
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as AdminLeadInteraction[];

      // Resolve o nome de quem registrou (profiles.user_id → full_name).
      // Inclui os comentários gravados pela trigger ao resolver um follow-up.
      const userIds = [...new Set(rows.map(r => r.created_by).filter((v): v is string => !!v))];
      if (userIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);
      const nameByUser = new Map<string, string>(
        (profiles || []).map(p => [p.user_id, p.full_name]),
      );
      return rows.map(r => ({
        ...r,
        author_name: r.created_by ? nameByUser.get(r.created_by) ?? null : null,
      }));
    },
    enabled: !!leadId,
  });

  // Realtime: comentário gravado pela trigger (ou em outra aba) ao resolver um
  // follow-up revalida a lista de interações deste lead na hora.
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`admin-lead-interactions-${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_lead_interactions', filter: `lead_id=eq.${leadId}` },
        () => qc.invalidateQueries({ queryKey: ['admin-lead-interactions', leadId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, qc]);

  const createInteraction = useMutation({
    mutationFn: async (input: Partial<AdminLeadInteraction>) => {
      const { data, error } = await supabase.from('admin_lead_interactions' as any).insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-lead-interactions', leadId] }); toast({ title: 'Interação registrada!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  return { interactions: query.data || [], isLoading: query.isLoading, createInteraction };
}
