import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/database';

// Perfis são dados de referência compartilhados por agenda, CRM, equipes e OS.
// Alterações explícitas invalidam estas chaves; entre elas, manter o cache evita
// repetir a mesma ordenação em cada montagem de dialog/página.
const PROFILES_STALE_TIME_MS = 5 * 60 * 1000;
const PROFILE_LIST_COLUMNS =
  'id, user_id, full_name, company_id, phone, avatar_url, is_active, created_at, updated_at';

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_LIST_COLUMNS)
        .order('full_name');
      
      if (error) throw error;
      return data as Profile[];
    },
    staleTime: PROFILES_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      // Get users with 'tecnico' role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'tecnico');
      
      if (roleError) throw roleError;
      
      if (!roleData || roleData.length === 0) {
        return [];
      }

      const userIds = roleData.map(r => r.user_id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_LIST_COLUMNS)
        .in('user_id', userIds)
        .order('full_name');
      
      if (error) throw error;
      return data as Profile[];
    },
    staleTime: PROFILES_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });
}
