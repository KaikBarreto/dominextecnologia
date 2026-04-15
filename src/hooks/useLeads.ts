import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate, Enums } from '@/integrations/supabase/types';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';

export type Lead = Tables<'leads'> & {
  customers?: Partial<Tables<'customers'>> | null;
  assigned_profile?: { full_name: string; avatar_url: string | null } | null;
};
export type LeadInsert = TablesInsert<'leads'>;
export type LeadUpdate = TablesUpdate<'leads'>;
export type LeadStatus = Enums<'lead_status'>;

export type LeadInteraction = Tables<'lead_interactions'> & {
  created_by_profile?: { full_name: string } | null;
};
export type LeadInteractionInsert = TablesInsert<'lead_interactions'>;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  lead: 'Lead',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado_ganho: 'Negócio Fechado (Ganho)',
  fechado_perdido: 'Negócio Perdido',
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  lead: 'bg-muted-foreground text-white',
  proposta: 'bg-info text-white',
  negociacao: 'bg-warning text-white',
  fechado_ganho: 'bg-success text-white',
  fechado_perdido: 'bg-destructive text-white',
};

export const INTERACTION_TYPES = [
  { value: 'ligacao', label: 'Ligação', icon: '📞' },
  { value: 'email', label: 'E-mail', icon: '📧' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'reuniao', label: 'Reunião', icon: '🤝' },
  { value: 'visita', label: 'Visita', icon: '🏢' },
  { value: 'proposta', label: 'Proposta Enviada', icon: '📄' },
  { value: 'outro', label: 'Outro', icon: '📝' },
];

export const LEAD_SOURCES = [
  'Indicação',
  'Site',
  'Telefone',
  'WhatsApp',
  'Google',
  'Instagram',
  'Facebook',
  'Parceiro',
  'Feira/Evento',
  'Outro',
];

export function useLeads() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          customers (id, name, phone, email),
          crm_stages (id, name, color)
        `)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;

      // Fetch assigned profiles
      const assignedIds = [...new Set((data || []).map(l => l.assigned_to).filter(Boolean))] as string[];
      let profilesMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', assignedIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
        }
      }

      return (data || []).map(lead => ({
        ...lead,
        assigned_profile: lead.assigned_to ? profilesMap[lead.assigned_to] || null : null,
      })) as unknown as (Lead & { crm_stages?: { id: string; name: string; color: string } | null })[];
    },
  });

  const createLead = useMutation({
    mutationFn: async (lead: LeadInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      const sanitized = normalizeOptionalForeignKeys(
        { ...lead, created_by: userData.user?.id },
        ['customer_id', 'assigned_to', 'stage_id']
      );
      const { data, error } = await supabase
        .from('leads')
        .insert(sanitized)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead criado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar lead', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      const sanitized = normalizeOptionalForeignKeys(updates, ['customer_id', 'assigned_to', 'stage_id']);
      const { data, error } = await supabase
        .from('leads')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead atualizado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar lead', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead removido com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover lead', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Group leads by status
  const leadsByStatus = leads.reduce((acc, lead) => {
    const status = lead.status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(lead);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  // Calculate value by status
  const valueByStatus = Object.entries(leadsByStatus).reduce((acc, [status, statusLeads]) => {
    acc[status as LeadStatus] = statusLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
    return acc;
  }, {} as Record<LeadStatus, number>);

  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);

  return {
    leads,
    isLoading,
    error,
    createLead,
    updateLead,
    deleteLead,
    leadsByStatus,
    valueByStatus,
    stats: {
      total: leads.length,
      totalValue,
    },
  };
}

export function useLeadInteractions(leadId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ['lead_interactions', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('lead_interactions')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as LeadInteraction[];
    },
    enabled: !!leadId,
  });

  const createInteraction = useMutation({
    mutationFn: async (interaction: LeadInteractionInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('lead_interactions')
        .insert({ ...interaction, created_by: userData.user?.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_interactions', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Interação registrada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar interação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  return {
    interactions,
    isLoading,
    createInteraction,
  };
}
