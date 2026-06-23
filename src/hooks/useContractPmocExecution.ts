import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Execução de conformidade PMOC POR TAREFA de um contrato — fronteira do
 * Supabase pra a aba "Histórico PMOC" do detalhe de contrato.
 *
 * Lê a VIEW `public.contract_activity_execution` (Fase 2): security_invoker,
 * só authenticated, tenant-safe (RLS das tabelas-base já filtra por company_id).
 * Cada linha = uma tarefa do checklist PMOC executada numa visita, com carimbo
 * de quando/quem respondeu e o status de conformidade.
 *
 * A view NÃO está tipada no `types.ts` gerado → consumimos via
 * `.from('contract_activity_execution' as any)` com cast pro tipo local abaixo.
 * Como é prova de cumprimento da Planilha PMOC, só faz sentido em contrato PMOC
 * (gateado por `isPmoc` no `enabled`).
 */
export interface ContractActivityExecutionRow {
  company_id: string;
  contract_id: string;
  contract_name: string | null;
  service_order_id: string;
  order_number: number | null;
  scheduled_date: string | null;
  visit_conformity: string | null;
  activity_id: string;
  plan_activity_id: string | null;
  contract_item_id: string | null;
  equipment_id: string | null;
  equipment_name: string | null;
  section: string | null;
  component: string | null;
  description: string;
  freq_code: string | null;
  is_measurement: boolean | null;
  measured_value: string | null;
  unit: string | null;
  conformity_status: 'conforme' | 'nao_conforme' | 'na' | null;
  sort_order: number | null;
  responded_at: string | null;
  responded_by: string | null;
  responded_by_name: string | null;
}

export function useContractPmocExecution(
  contractId: string | undefined,
  isPmoc: boolean,
) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['contract-pmoc-execution', contractId],
    // Só roda pra contrato PMOC com id resolvido — é prova da Planilha PMOC.
    enabled: !!contractId && isPmoc,
    queryFn: async () => {
      const { data, error } = await supabase
        // View sem tipo no types.ts → cast obrigatório.
        .from('contract_activity_execution' as any)
        .select('*')
        .eq('contract_id', contractId as string)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContractActivityExecutionRow[];
    },
  });

  return { rows: data ?? [], isLoading, isError };
}
