import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AdminCrmStage> & { id: string }) => {
      const { error } = await supabase.from('admin_crm_stages' as any).update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crm-stages'] }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_crm_stages' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crm-stages'] }); toast({ title: 'Etapa removida!' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
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
      const { data, error } = await supabase.from('admin_leads' as any).insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead criado!' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AdminLead> & { id: string }) => {
      const { error } = await supabase.from('admin_leads' as any).update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead atualizado!' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_leads' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leads'] }); toast({ title: 'Lead removido!' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  const leads = query.data || [];

  const stats = {
    total: leads.length,
    totalValue: leads.reduce((s, l) => s + Number(l.value || 0), 0),
  };

  return { leads, isLoading: query.isLoading, createLead, updateLead, deleteLead, stats };
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
      return (data || []) as unknown as AdminLeadInteraction[];
    },
    enabled: !!leadId,
  });

  const createInteraction = useMutation({
    mutationFn: async (input: Partial<AdminLeadInteraction>) => {
      const { data, error } = await supabase.from('admin_lead_interactions' as any).insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-lead-interactions', leadId] }); toast({ title: 'Interação registrada!' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  return { interactions: query.data || [], isLoading: query.isLoading, createInteraction };
}
