import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Onda A da v1.9.0 — descobre se uma OS pertence a contrato PMOC.
 *
 * Regra: `service_orders.contract_id → contracts.is_pmoc === true`.
 *
 * Use `useIsPmocOrder(serviceOrderId)` quando o componente só tem o id da OS.
 * Use `getIsPmocFromOrder(order)` quando o objeto já vem com join em contracts
 * (evita refetch — preferido na listagem).
 */
export interface PmocContractSummary {
  id: string;
  name: string;
  responsible_technician_id: string | null;
}

export interface UseIsPmocOrderResult {
  isPmoc: boolean;
  isLoading: boolean;
  contract: PmocContractSummary | null;
}

const STALE_TIME_MS = 5 * 60 * 1000; // 5 min

export function useIsPmocOrder(
  serviceOrderId: string | undefined | null,
): UseIsPmocOrderResult {
  const query = useQuery({
    queryKey: ['is-pmoc-order', serviceOrderId],
    enabled: !!serviceOrderId,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<{ isPmoc: boolean; contract: PmocContractSummary | null }> => {
      if (!serviceOrderId) return { isPmoc: false, contract: null };

      const { data: osData, error: osError } = await supabase
        .from('service_orders')
        .select('contract_id')
        .eq('id', serviceOrderId)
        .maybeSingle();

      if (osError) throw osError;
      const contractId = osData?.contract_id;
      if (!contractId) return { isPmoc: false, contract: null };

      const { data: contractData, error: contractError } = await supabase
        .from('contracts')
        .select('id, name, is_pmoc, responsible_technician_id')
        .eq('id', contractId)
        .maybeSingle();

      if (contractError) throw contractError;
      if (!contractData) return { isPmoc: false, contract: null };

      const c = contractData as unknown as {
        id: string;
        name: string;
        is_pmoc?: boolean | null;
        responsible_technician_id?: string | null;
      };

      return {
        isPmoc: c.is_pmoc === true,
        contract: {
          id: c.id,
          name: c.name,
          responsible_technician_id: c.responsible_technician_id ?? null,
        },
      };
    },
  });

  return {
    isPmoc: query.data?.isPmoc ?? false,
    isLoading: query.isLoading,
    contract: query.data?.contract ?? null,
  };
}

/**
 * Versão sem refetch — pra quando o objeto da OS já veio com join em contracts.
 * Use na listagem (`useServiceOrders` traz `contracts(id, is_pmoc)` no select).
 */
export function getIsPmocFromOrder(
  order:
    | {
        contracts?: { is_pmoc?: boolean | null } | null;
        contract?: { is_pmoc?: boolean | null } | null;
      }
    | null
    | undefined,
): boolean {
  if (!order) return false;
  // Aceita ambos os nomes ('contracts' = padrão Supabase quando alias não definido,
  // 'contract' = alias usado em alguns selects nossos).
  const joined = order.contracts ?? order.contract ?? null;
  return joined?.is_pmoc === true;
}
