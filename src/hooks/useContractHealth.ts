import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Semáforo de saúde do contrato (Onda A, v1.9.0).
 *
 * Calculado por VIEW SQL `contract_health_status` (não persistido):
 * - `em_dia` (verde)             → 0 OSs atrasadas
 * - `manutencao_pendente` (amarelo) → 1 OS atrasada
 * - `necessita_atencao` (vermelho)  → 2+ OSs atrasadas
 *
 * "Atrasada" = service_orders.scheduled_date < CURRENT_DATE
 *  E status NOT IN ('concluida','cancelada').
 *
 * RLS herdada de contracts + service_orders (filtra por company_id).
 *
 * Vale pra TODO contrato, não só PMOC. PMOC só usa pra expor o semáforo no portal público.
 */
export type ContractHealthStatus = 'em_dia' | 'manutencao_pendente' | 'necessita_atencao';

export interface ContractHealthRow {
  contract_id: string;
  company_id: string;
  overdue_count: number;
  health_status: ContractHealthStatus;
}

/**
 * Carrega o semáforo de TODOS os contratos visíveis ao usuário (RLS aplica).
 * Devolve um Map<contract_id, ContractHealthRow> pra lookup O(1) na tela.
 *
 * StaleTime curto (30s) porque atraso de OS muda em tempo "operacional" —
 * técnico conclui uma OS, a saúde deveria refletir rapidinho.
 */
export function useContractHealthList() {
  const query = useQuery({
    queryKey: ['contract-health'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_health_status')
        .select('contract_id, company_id, overdue_count, health_status');

      if (error) {
        // Em pré-migration (view ainda não existe), retornamos vazio em vez de quebrar a tela.
        // Não logamos como erro destrutivo; a UI cai no fallback "em_dia" pra todo mundo.
        console.warn('[useContractHealthList] view contract_health_status indisponível:', error.message);
        return new Map<string, ContractHealthRow>();
      }

      const rows = (data ?? []) as unknown as ContractHealthRow[];
      const map = new Map<string, ContractHealthRow>();
      for (const r of rows) map.set(r.contract_id, r);
      return map;
    },
  });

  return {
    healthMap: query.data ?? new Map<string, ContractHealthRow>(),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Alias plural — `healthByContractId` é um `Record<contract_id, ContractHealthRow>`
 * (formato do briefing). Mantemos `useContractHealthList` como fonte da verdade
 * (Map é mais rápido pra lookup) e expomos esse wrapper só pra quem prefere objeto.
 */
export function useContractsHealth() {
  const { healthMap, isLoading, isError } = useContractHealthList();
  const healthByContractId: Record<string, ContractHealthRow> = {};
  for (const [id, row] of healthMap.entries()) healthByContractId[id] = row;
  return { healthByContractId, isLoading, isError };
}

/**
 * Variante pra uma linha só. Útil quando a tela exibe apenas 1 contrato (detalhe).
 */
export function useContractHealth(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['contract-health', contractId],
    enabled: !!contractId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!contractId) return null;
      const { data, error } = await supabase
        .from('contract_health_status')
        .select('contract_id, company_id, overdue_count, health_status')
        .eq('contract_id', contractId)
        .maybeSingle();
      if (error) {
        console.warn('[useContractHealth] erro ao ler view:', error.message);
        return null;
      }
      return (data ?? null) as unknown as ContractHealthRow | null;
    },
  });
}
