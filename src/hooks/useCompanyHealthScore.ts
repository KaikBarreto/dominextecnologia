import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyHealthData {
  company_id: string;
  company_name: string;
  subscription_status: string;
  subscription_plan: string;
  last_activity_at: string | null;
  events_7d: number;
  events_14d: number;
  events_30d: number;
  health_status: 'healthy' | 'attention' | 'at_risk' | 'inactive';
}

/**
 * Health score de todas as empresas (painel master Auctus).
 * A RPC `get_company_health_scores` já tem guard de admin server-side:
 * não-admin recebe 0 linhas (segurança não depende deste hook).
 */
export function useCompanyHealthScores() {
  return useQuery({
    queryKey: ['admin-health-scores'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_health_scores');
      if (error) throw error;
      return (data || []) as CompanyHealthData[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function getHealthBadgeConfig(status: string) {
  switch (status) {
    case 'healthy':
      return { label: 'Saudável', className: 'bg-green-500 text-white hover:bg-green-500', color: '#22c55e' };
    case 'attention':
      return { label: 'Atenção', className: 'bg-yellow-500 text-white hover:bg-yellow-500', color: '#eab308' };
    case 'at_risk':
      return { label: 'Em Risco', className: 'bg-red-500 text-white hover:bg-red-500', color: '#ef4444' };
    case 'inactive':
    default:
      return { label: 'Inativo', className: 'bg-gray-400 text-white hover:bg-gray-400', color: '#9ca3af' };
  }
}
