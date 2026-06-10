import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface AdminCrmStage {
  id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
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
  stage_id: string | null;
  notes: string | null;
  loss_reason: string | null;
  created_by: string | null;
  responsible_id: string | null;
  created_at: string;
  updated_at: string;
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

export function useAdminCrmStages() {
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
    mutationFn: async (input: { name: string; color?: string; position?: number; is_won?: boolean; is_lost?: boolean }) => {
      const { data, error } = await supabase.from('admin_crm_stages' as any).insert(input).select().single();
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

  const stages = query.data || [];
  const getStageHex = (stageId: string | null) => stages.find(s => s.id === stageId)?.color || '#6B7280';

  return { stages, isLoading: query.isLoading, createStage, updateStage, deleteStage, getStageHex };
}

export function useAdminLeads() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_leads' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AdminLead[];
    },
  });

  const createLead = useMutation({
    mutationFn: async (input: Partial<AdminLead>) => {
      // admin_leads.title é NOT NULL no banco, mas o formulário não pede mais
      // título explícito (UX espelhada no EcoSistema). Auto-geramos a partir do
      // que o usuário preencheu — sem migration. Se um caller futuro mandar um
      // title explícito, ele tem prioridade.
      const autoTitle =
        (input.title?.trim?.() || '') ||
        input.company_name?.trim() ||
        input.contact_name?.trim() ||
        input.phone?.trim() ||
        'Lead sem identificação';
      const payload = { ...input, title: autoTitle };
      const { data, error } = await supabase.from('admin_leads' as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead criado!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AdminLead> & { id: string }) => {
      const { error } = await supabase.from('admin_leads' as any).update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead atualizado!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_leads' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead removido!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const leads = query.data || [];

  const stats = {
    total: leads.length,
    totalValue: leads.reduce((s, l) => s + Number(l.value || 0), 0),
  };

  return { leads, isLoading: query.isLoading, createLead, updateLead, deleteLead, stats };
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
      return (data as unknown as AdminLead) || null;
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
