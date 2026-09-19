import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate, Enums } from '@/integrations/supabase/types';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

/**
 * Um responsável da oportunidade (Onda C do overhaul de CRM). `is_primary`
 * espelha `leads.assigned_to` via trigger no banco — ver migration
 * 20260917150000_crm_multi_responsavel_e_visibilidade.sql.
 */
export type LeadAssignee = {
  user_id: string;
  is_primary: boolean;
  full_name: string | null;
  avatar_url: string | null;
};

export type Lead = Tables<'leads'> & {
  customers?: Partial<Tables<'customers'>> | null;
  assigned_profile?: { full_name: string; avatar_url: string | null } | null;
  /** Lista completa de responsáveis (principal + co-responsáveis), principal primeiro. */
  assignees?: LeadAssignee[];
};
export type LeadInsert = TablesInsert<'leads'>;
export type LeadUpdate = TablesUpdate<'leads'>;
export type LeadStatus = Enums<'lead_status'>;

export type LeadInteraction = Tables<'lead_interactions'> & {
  created_by_profile?: { full_name: string } | null;
};
export type LeadInteractionInsert = TablesInsert<'lead_interactions'>;

/** @deprecated Use getLeadStatusLabels(locale) para labels traduzidas. Mantido para retrocompatibilidade. */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  lead: 'Lead',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado_ganho: 'Negócio Fechado (Ganho)',
  fechado_perdido: 'Negócio Perdido',
};

/** Retorna mapa de status → label no locale solicitado. */
export function getLeadStatusLabels(locale: LocaleCode): Record<LeadStatus, string> {
  const tl = MESSAGES[locale].app.crm.leads;
  return {
    lead: tl.statusLead,
    proposta: tl.statusProposta,
    negociacao: tl.statusNegociacao,
    fechado_ganho: tl.statusFechadoGanho,
    fechado_perdido: tl.statusFechadoPerdido,
  };
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  lead: 'bg-muted-foreground text-white',
  proposta: 'bg-info text-white',
  negociacao: 'bg-warning text-white',
  fechado_ganho: 'bg-success text-white',
  fechado_perdido: 'bg-destructive text-white',
};

/** @deprecated Use getInteractionTypes(locale) para labels traduzidas. Mantido para retrocompatibilidade. */
export const INTERACTION_TYPES = [
  { value: 'ligacao', label: 'Ligação', icon: '📞' },
  { value: 'email', label: 'E-mail', icon: '📧' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'reuniao', label: 'Reunião', icon: '🤝' },
  { value: 'visita', label: 'Visita', icon: '🏢' },
  { value: 'proposta', label: 'Proposta Enviada', icon: '📄' },
  { value: 'outro', label: 'Outro', icon: '📝' },
];

/** Retorna lista de tipos de interação com labels no locale solicitado. */
export function getInteractionTypes(locale: LocaleCode) {
  const tl = MESSAGES[locale].app.crm.leads;
  return [
    { value: 'ligacao', label: tl.interactionLigacao, icon: '📞' },
    { value: 'email', label: tl.interactionEmail, icon: '📧' },
    { value: 'whatsapp', label: tl.interactionWhatsapp, icon: '💬' },
    { value: 'reuniao', label: tl.interactionReuniao, icon: '🤝' },
    { value: 'visita', label: tl.interactionVisita, icon: '🏢' },
    { value: 'proposta', label: tl.interactionProposta, icon: '📄' },
    { value: 'outro', label: tl.interactionOutro, icon: '📝' },
  ] as const;
}

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
          customers (id, name, phone, celular, email, document),
          crm_stages (id, name, color),
          lead_assignees (user_id, is_primary)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for both the legacy assigned_to and every co-responsável
      // em lead_assignees — junta tudo num único round trip. lead_assignees não
      // tem FK pra profiles (aponta pra auth.users), então o join precisa ser
      // manual, igual já era feito pra assigned_profile.
      const assignedIds = new Set<string>();
      (data || []).forEach((l: any) => {
        if (l.assigned_to) assignedIds.add(l.assigned_to);
        (l.lead_assignees || []).forEach((la: any) => assignedIds.add(la.user_id));
      });
      let profilesMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      if (assignedIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', [...assignedIds]);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
        }
      }

      return (data || []).map((lead: any) => {
        const assignees: LeadAssignee[] = (lead.lead_assignees || [])
          .map((la: any) => ({
            user_id: la.user_id,
            is_primary: la.is_primary,
            full_name: profilesMap[la.user_id]?.full_name ?? null,
            avatar_url: profilesMap[la.user_id]?.avatar_url ?? null,
          }))
          // Principal primeiro, resto por nome — UI sempre mostra o principal em destaque.
          .sort((a: LeadAssignee, b: LeadAssignee) => {
            if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
            return (a.full_name || '').localeCompare(b.full_name || '');
          });
        return {
          ...lead,
          assigned_profile: lead.assigned_to ? profilesMap[lead.assigned_to] || null : null,
          assignees,
        };
      }) as unknown as (Lead & { crm_stages?: { id: string; name: string; color: string } | null })[];
    },
  });

  // Substitui a lista de responsáveis de um lead (delete + insert completo).
  // Escrevemos SÓ em lead_assignees, nunca em leads.assigned_to ao mesmo tempo
  // — é o caminho de escrita escolhido pra não brigar com o trigger de espelho
  // (leads_sync_primary_assignee / lead_assignees_sync_to_lead, ver migration
  // 20260917150000): o AFTER trigger de lead_assignees propaga o `is_primary`
  // pra leads.assigned_to sozinho assim que a lista é gravada.
  //
  // DELETE+INSERT client-side aqui é seguro (ao contrário do incidente PMOC
  // documentado — replace_children_via_rpc_nao_client_delete_insert): a RLS de
  // lead_assignees usa a MESMA função (can_access_lead) no USING do DELETE e
  // no WITH CHECK do INSERT, então não existe a assimetria "delete casa 0,
  // insert sempre passa" — se o ator não pode acessar o lead, o INSERT falha
  // alto (RLS violation), nunca fica quieto enquanto o delete não apaga nada.
  const replaceLeadAssignees = async (leadId: string, assigneeUserIds: string[]) => {
    const { error: deleteError } = await supabase
      .from('lead_assignees')
      .delete()
      .eq('lead_id', leadId);
    if (deleteError) throw deleteError;

    if (assigneeUserIds.length > 0) {
      const { error: insertError } = await supabase.from('lead_assignees').insert(
        // Convenção da tela (LeadFormDialog): o primeiro selecionado é o principal.
        assigneeUserIds.map((uid, idx) => ({ lead_id: leadId, user_id: uid, is_primary: idx === 0 }))
      );
      if (insertError) throw insertError;
    }
  };

  const createLead = useMutation({
    mutationFn: async ({ assignee_user_ids, ...lead }: LeadInsert & { assignee_user_ids?: string[] }) => {
      const { data: userData } = await supabase.auth.getUser();
      const leadFields: LeadInsert = { ...lead, created_by: userData.user?.id };
      if (assignee_user_ids !== undefined) {
        // A lista de responsáveis manda: assigned_to nasce vazio e o trigger do
        // banco preenche a partir do principal quando lead_assignees é gravado.
        delete leadFields.assigned_to;
      }
      const sanitized = normalizeOptionalForeignKeys(
        leadFields,
        ['customer_id', 'assigned_to', 'stage_id']
      );
      const { data, error } = await supabase
        .from('leads')
        .insert(sanitized)
        .select()
        .single();

      if (error) throw error;

      if (assignee_user_ids !== undefined) {
        await replaceLeadAssignees(data.id, assignee_user_ids);
      }

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
    mutationFn: async ({ id, assignee_user_ids, ...updates }: LeadUpdate & { id: string; assignee_user_ids?: string[] }) => {
      const updateFields: LeadUpdate = { ...updates };
      if (assignee_user_ids !== undefined) {
        delete updateFields.assigned_to;
      }
      const sanitized = normalizeOptionalForeignKeys(updateFields, ['customer_id', 'assigned_to', 'stage_id']);
      const { data, error } = await supabase
        .from('leads')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (assignee_user_ids !== undefined) {
        await replaceLeadAssignees(id, assignee_user_ids);
      }

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

  // Assumir a oportunidade (fila "sem responsável", Onda C — correção da fila).
  // Escreve direto em leads.assigned_to (caminho legado): o trigger
  // leads_sync_primary_assignee espelha pra lead_assignees sozinho. É o mesmo
  // caminho de escrita que updateLead usa quando assignee_user_ids não é
  // passado, só que aqui o alvo é sempre o próprio usuário logado.
  const claimLead = useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Usuário não autenticado');
      const { data, error } = await supabase
        .from('leads')
        .update({ assigned_to: uid })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: 'Oportunidade assumida!',
        description: 'Ela saiu da fila compartilhada e agora aparece só pra você.',
      });
    },
    onError: (error) => {
      toast({ title: 'Erro ao assumir oportunidade', description: getErrorMessage(error), variant: 'destructive' });
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
    claimLead,
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
