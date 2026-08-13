import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FeatureFlagRow {
  enabled: boolean;
  contract_allowlist: string[];
}

/** Decisão pura: a flag vale pra este contrato? */
export function isFlagEnabledFor(flag: FeatureFlagRow | null, contractId: string | null | undefined): boolean {
  if (!flag) return false;
  if (flag.enabled) return true;
  if (!contractId) return false;
  return (flag.contract_allowlist ?? []).includes(contractId);
}

/** Lê uma flag do banco (cache curto). Retorna null enquanto carrega ou se ausente. */
export function useFeatureFlag(key: string) {
  return useQuery({
    queryKey: ['feature-flag', key],
    queryFn: async (): Promise<FeatureFlagRow | null> => {
      const { data, error } = await supabase
        .from('app_feature_flags' as any)
        .select('enabled, contract_allowlist')
        .eq('key', key)
        .maybeSingle();
      if (error) { console.warn('feature flag read falhou:', key, error); return null; }
      return data as FeatureFlagRow | null;
    },
    staleTime: 60_000,
  });
}
