import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

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
  { value: 'muted', label: 'Cinza', class: 'bg-muted-foreground text-white' },
  { value: 'info', label: 'Azul', class: 'bg-info text-white' },
  { value: 'warning', label: 'Amarelo', class: 'bg-warning text-white' },
  { value: 'success', label: 'Verde', class: 'bg-success text-white' },
  { value: 'destructive', label: 'Vermelho', class: 'bg-destructive text-white' },
  { value: 'primary', label: 'Dourado', class: 'bg-primary text-white' },
];

/** Conjunto padrão de estágios do pipeline, criado de uma vez pra empresa nova. */
export const DEFAULT_CRM_STAGES: Array<Pick<CrmStageInsert, 'name' | 'color' | 'is_won' | 'is_lost'>> = [
  { name: 'Lead', color: 'muted', is_won: false, is_lost: false },
  { name: 'Proposta', color: 'info', is_won: false, is_lost: false },
  { name: 'Negociação', color: 'warning', is_won: false, is_lost: false },
  { name: 'Fechado (Ganho)', color: 'success', is_won: true, is_lost: false },
  { name: 'Fechado (Perdido)', color: 'destructive', is_won: false, is_lost: true },
];

// Map legacy named colors to hex for badge inline styles
const LEGACY_COLOR_MAP: Record<string, string> = {
  muted: '#6B7280',
  info: '#3B82F6',
  warning: '#F59E0B',
  success: '#22C55E',
  destructive: '#EF4444',
  primary: '#00C597',
};

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
      
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('crm_stages')
        .insert({ ...stage, position: stage.position ?? maxPosition, company_id } as any)
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
        description: getErrorMessage(error),
        variant: 'destructive'
      });
    },
  });

  const seedDefaultStages = useMutation({
    mutationFn: async () => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const rows = DEFAULT_CRM_STAGES.map((stage, index) => ({
        ...stage,
        position: index,
        company_id,
      }));
      const { data, error } = await supabase
        .from('crm_stages')
        .insert(rows as any)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_stages'] });
      toast({ title: 'Estágios padrão criados!' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar estágios padrão',
        description: getErrorMessage(error),
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
        description: getErrorMessage(error),
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
        description: getErrorMessage(error),
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
        description: getErrorMessage(error),
        variant: 'destructive'
      });
    },
  });

  const getStageColorClass = (color: string) => {
    const stageColor = STAGE_COLORS.find(c => c.value === color);
    return stageColor?.class || '';
  };

  /** Returns hex color for inline styles (supports both legacy names and hex) */
  const getStageHex = (color: string): string => {
    return LEGACY_COLOR_MAP[color] || color || '#6B7280';
  };

  return {
    stages,
    isLoading,
    error,
    createStage,
    seedDefaultStages,
    updateStage,
    deleteStage,
    reorderStages,
    getStageColorClass,
    getStageHex,
  };
}
