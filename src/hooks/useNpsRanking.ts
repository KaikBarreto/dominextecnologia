import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface NpsTechnicianRank {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  nps_medio: number | null;
  media_estrelas: number | null;
  respostas: number;
  os_concluidas: number;
  taxa_resposta: number | null;
}

export interface NpsOpenDetractor {
  os_id: string;
  order_number: number;
  nps_score: number;
  comment: string | null;
  rated_at: string;
  rated_by_name: string | null;
  customer_name: string | null;
  technician_id: string | null;
  technician_name: string | null;
}

/**
 * Converte um DateRange (com from/to opcionais) em strings YYYY-MM-DD pras RPCs
 * de NPS. Quando o filtro é "Todos os tempos" (sem limites), usa uma janela
 * larga (2000-01-01 → hoje) pra cobrir todo o histórico. Não passa company_id —
 * a RPC já escopa ao tenant do usuário logado.
 */
function toRpcRange(from: Date | undefined, to: Date | undefined) {
  return {
    p_start: from ? format(from, 'yyyy-MM-dd') : '2000-01-01',
    p_end: to ? format(to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  };
}

export function useNpsTechnicianRanking(from: Date | undefined, to: Date | undefined) {
  const args = toRpcRange(from, to);
  return useQuery({
    queryKey: ['nps-technician-ranking', args.p_start, args.p_end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nps_technician_ranking', args);
      if (error) throw error;
      return (data ?? []) as NpsTechnicianRank[];
    },
  });
}

export function useNpsOpenDetractors(from: Date | undefined, to: Date | undefined) {
  const args = toRpcRange(from, to);
  return useQuery({
    queryKey: ['nps-open-detractors', args.p_start, args.p_end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nps_open_detractors', args);
      if (error) throw error;
      return (data ?? []) as NpsOpenDetractor[];
    },
  });
}
