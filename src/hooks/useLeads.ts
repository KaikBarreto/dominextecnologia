import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate, Enums } from '@/integrations/supabase/types';

export type Lead = Tables<'leads'> & {
  customers?: Tables<'customers'> | null;
};
export type LeadInsert = TablesInsert<'leads'>;
export type LeadUpdate = TablesUpdate<'leads'>;
export type LeadStatus = Enums<'lead_status'>;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  lead: 'Lead',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado_ganho: 'Fechado (Ganho)',
  fechado_perdido: 'Fechado (Perdido)',
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  lead: 'bg-muted text-muted-foreground',
  proposta: 'bg-info/20 text-info',
  negociacao: 'bg-warning/20 text-warning',
  fechado_ganho: 'bg-success/20 text-success',
  fechado_perdido: 'bg-destructive/20 text-destructive',
};

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
          customers (id, name, phone, email)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Lead[];
    },
  });

  const createLead = useMutation({
    mutationFn: async (lead: LeadInsert) => {
      const { data, error } = await supabase
        .from('leads')
        .insert(lead)
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
      toast({ 
        title: 'Erro ao criar lead', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
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
      toast({ 
        title: 'Erro ao atualizar lead', 
        description: error.message,
        variant: 'destructive' 
      });
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
      toast({ 
        title: 'Erro ao remover lead', 
        description: error.message,
        variant: 'destructive' 
      });
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
