import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FinancialPattern = {
  description: string; category?: string; category_label?: string;
  customer_id?: string; supplier_id?: string; cost_center_id?: string;
  party_label?: string; cost_center_label?: string; counterparty?: string;
  account_id?: string; account_label?: string; payment_method?: string;
  uses: number; last_used: string;
};
export type SmartFillValues = Record<string, string | null | undefined>;
export function useFinancialSmartFill({ scope = 'tenant', context, direction, prefix, enabled }: {
  scope?: 'tenant' | 'admin'; context: 'bill' | 'movement'; direction: 'entrada' | 'saida'; prefix: string; enabled: boolean;
}) {
  const normalized = prefix.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  const [sessionVersion, setSessionVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; patterns: FinancialPattern[]; loading: boolean }>({ key: '', patterns: [], loading: false });
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => setSessionVersion(value => value + 1));
    return () => data.subscription.unsubscribe();
  }, []);
  const valid = normalized.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && normalized.length <= 240;
  const key = JSON.stringify([scope, context, direction, normalized, sessionVersion]);
  useEffect(() => {
    if (!enabled || !valid) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setResult({ key, patterns: [], loading: true });
      try {
        const { data, error } = await (supabase as any).rpc(scope === 'admin' ? 'admin_suggest_financial_patterns' : 'suggest_financial_patterns', {
          p_context: context, p_direction: direction, p_prefix: normalized, p_limit: 3,
        });
        if (!cancelled) setResult({ key, patterns: !error && Array.isArray(data) ? data.slice(0, 3) : [], loading: false });
      } catch {
        if (!cancelled) setResult({ key, patterns: [], loading: false });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, enabled, valid]);
  return { patterns: enabled && valid && result.key === key ? result.patterns : [], loading: enabled && valid && result.key === key && result.loading };
}
