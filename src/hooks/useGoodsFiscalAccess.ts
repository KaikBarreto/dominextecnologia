import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const GOODS_FISCAL_ROOT = ['goods-fiscal'] as const;
/** O servidor decide a autorização. Identidade/permissões novas mascaram o cache no mesmo render. */
export function useGoodsFiscalAccess() {
  const { user, profile, profileLoading, permissions, roles } = useAuth();
  const companyId = profile?.user_id === user?.id ? profile?.company_id ?? null : null;
  const identity = [companyId ?? '', user?.id ?? '', [...permissions].sort().join('|'), [...roles].sort().join('|')];
  const key = [...GOODS_FISCAL_ROOT, ...identity];
  const gate = useQuery({
    queryKey: ['goods-fiscal-access', ...identity], enabled: !!user?.id && !!companyId && !profileLoading,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (name: string) => Promise<{data: unknown; error: unknown}>)('fiscal_can_emit_goods');
      if (error) throw new Error('Não foi possível verificar sua permissão fiscal.');
      return data === true;
    }, staleTime: 0, gcTime: 0, refetchOnMount: false, refetchOnWindowFocus: true, retry: false,
  });
  const allowed = !!companyId && !!user?.id && !profileLoading && gate.data === true && !gate.isError && !gate.isFetching;
  return { companyId, userId: user?.id ?? null, key, scopeId: JSON.stringify(identity), allowed, isLoading: gate.isLoading || profileLoading };
}
