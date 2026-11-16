import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

export type PdvModuleFeature = 'returns' | 'after_sale';

/** Availability is resolved by the server; a rollout row is never entitlement. */
export function isPdvModuleFeatureEnabled(payload: unknown, companyId: string | null | undefined, feature: PdvModuleFeature): boolean {
  if (!companyId || !payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  return value.company_id === companyId && value.module_available === true && value[feature] === true;
}

export function usePdvModuleFeature(companyId: string | null | undefined, feature: PdvModuleFeature, queryRoot: readonly string[]) {
  const scope = usePdvAuthorizedQueryScope();
  const ready = Boolean(companyId) && scope.ready;
  const signature = JSON.stringify([scope.key, companyId, feature, ready]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  const isCurrent = () => ready && token.mounted && current.current === token;
  const query = useQuery({
    queryKey: [...queryRoot, ...scope.key, 'module-feature', companyId, feature, token.epoch],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('pdv_get_module_features_v3' as never).abortSignal(signal);
      if (!isCurrent() || signal.aborted) throw new Error('O contexto do PDV mudou.');
      if (error) throw new Error('Não foi possível conferir os recursos disponíveis do PDV.');
      return isPdvModuleFeatureEnabled(data, companyId, feature);
    },
    enabled: ready, staleTime: 0, gcTime: 0, placeholderData: () => undefined,
    refetchInterval: 60_000,
  });
  return { ...query, data: isCurrent() && !query.isError ? query.data : false };
}
