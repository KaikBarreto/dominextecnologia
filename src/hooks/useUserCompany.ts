import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the company_id of the currently authenticated user.
 * This is needed for inserting rows into tables with NOT NULL company_id.
 */
export function useUserCompany() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['user-company-id', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.company_id ?? null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10,
  });

  return {
    companyId: query.data ?? null,
    isLoading: query.isLoading,
  };
}

/**
 * Synchronous helper for use inside mutationFn — fetches company_id on demand.
 * Throws if user is not authenticated or has no company.
 */
export async function getCurrentUserCompanyId(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Usuário não autenticado');
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.company_id) {
    throw new Error('Usuário sem empresa associada. Contate o administrador.');
  }
  return data.company_id;
}
