import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/database';

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (error) throw error;
      return data as Profile[];
    },
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
        .select('*')
        .in('user_id', userIds)
        .order('full_name');
      
      if (error) throw error;
      return data as Profile[];
    },
  });
}

/**
 * Perfis que podem participar de equipes operacionais.
 *
 * Equipe não é sinônimo de perfil técnico: comercial, gestor e outros
 * colaboradores também podem compor uma equipe. O recorte explícito por
 * empresa complementa a RLS e a chave inclui o tenant para impedir reuso de
 * cache após uma troca de conta.
 */
export function useActiveCompanyProfiles() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: ['profiles', 'active-company', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });
}
