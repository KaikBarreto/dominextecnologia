import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Onda B da v1.9.1 — descobre se um contrato é PMOC a partir do `contract_id`.
 *
 * Use quando você só tem o `contract_id` em mãos (ex.: form de criação de OS
 * que ainda vai vincular a um contrato). Pra OS já existente, prefira
 * `useIsPmocOrder(serviceOrderId)` que já faz o join completo.
 *
 * Cache de 5 minutos. Disabled quando `contractId` é null/undefined.
 */
export interface UseIsPmocContractResult {
  isPmoc: boolean;
  isLoading: boolean;
}

const STALE_TIME_MS = 5 * 60 * 1000; // 5 min

export function useIsPmocContract(
  contractId: string | undefined | null,
): UseIsPmocContractResult {
  const query = useQuery({
    queryKey: ['is-pmoc-contract', contractId],
    enabled: !!contractId,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<{ isPmoc: boolean }> => {
      if (!contractId) return { isPmoc: false };

      const { data, error } = await supabase
        .from('contracts')
        .select('is_pmoc')
        .eq('id', contractId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { isPmoc: false };

      const c = data as unknown as { is_pmoc?: boolean | null };
      return { isPmoc: c.is_pmoc === true };
    },
  });

  return {
    isPmoc: query.data?.isPmoc ?? false,
    isLoading: query.isLoading,
  };
}
