import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CrmStage {
  id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmStageInsert {
  name: string;
  color?: string;
  position?: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export interface CrmStageUpdate {
  id: string;
  name?: string;
  color?: string;
  position?: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export const STAGE_COLORS = [
  { value: 'muted', label: 'Cinza', class: 'bg-muted text-muted-foreground' },
  { value: 'info', label: 'Azul', class: 'bg-info/20 text-info' },
  { value: 'warning', label: 'Amarelo', class: 'bg-warning/20 text-warning' },
  { value: 'success', label: 'Verde', class: 'bg-success/20 text-success' },
  { value: 'destructive', label: 'Vermelho', class: 'bg-destructive/20 text-destructive' },
  { value: 'primary', label: 'Primária', class: 'bg-primary/20 text-primary' },
];

export function useCrmStages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stages = [], isLoading, error } = useQuery({
    queryKey: ['crm_stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_stages')
        .select('*')
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data as CrmStage[];
    },
  });

  const createStage = useMutation({
    mutationFn: async (stage: CrmStageInsert) => {
      // Get max position
      const maxPosition = stages.length > 0 ? Math.max(...stages.map(s => s.position)) + 1 : 0;
      
      const { data, error } = await supabase
        .from('crm_stages')
        .insert({ ...stage, position: stage.position ?? maxPosition })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_stages'] });
      toast({ title: 'Estágio criado com sucesso!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao criar estágio', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, ...updates }: CrmStageUpdate) => {
      const { data, error } = await supabase
        .from('crm_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_stages'] });
      toast({ title: 'Estágio atualizado!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao atualizar estágio', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_stages')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_stages'] });
      toast({ title: 'Estágio removido!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao remover estágio', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const reorderStages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) => 
        supabase.from('crm_stages').update({ position: index }).eq('id', id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_stages'] });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao reordenar estágios', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const getStageColorClass = (color: string) => {
    const stageColor = STAGE_COLORS.find(c => c.value === color);
    return stageColor?.class || 'bg-muted text-muted-foreground';
  };

  return {
    stages,
    isLoading,
    error,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    getStageColorClass,
  };
}
