import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
