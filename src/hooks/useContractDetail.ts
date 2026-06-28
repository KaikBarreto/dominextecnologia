import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import {
  type Contract,
  type ContractServiceOrder,
  getNextContractOS,
  isActiveContractOS,
} from './useContracts';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Detalhe de um contrato (PMOC ou comum).
 *
 * Fonte única das "visitas" = `service_orders` filtrado por `contract_id`.
 * A antiga tabela-sombra de ocorrências foi aposentada (geração eager de OS
 * desde a v1.9.12 deixou-a 1-pra-1 com service_orders). As OSs do contrato
 * são embutidas via FK `service_orders.contract_id` — mesmo padrão da aba
 * Cronograma e do hook `useContracts`.
 *
 * "Visita #N" é DERIVADA: ordena as OSs por `scheduled_date` asc e usa
 * `index + 1` (não existe `occurrence_number` em service_orders).
 */
export function useContractDetail(contractId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { updateServiceOrder } = useServiceOrders();

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract-detail', contractId],
    enabled: !!contractId,
    // Concluir/cancelar a OS acontece em OUTRA tela. Ao voltar pra cá,
    // refazemos a busca pra refletir status/progresso reais em tempo real.
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          customers (id, name, document, phone),
          responsible_technicians:responsible_technician_id (id, full_name, cft_crea, modality),
          contract_items (id, contract_id, equipment_id, environment_id, item_name, item_description, form_template_id, form_template_ids, first_os_excluded_questions, pmoc_scope, pmoc_start_visit, sort_order, equipment:equipment(id, name, brand, model)),
          contract_environments (id, company_id, contract_id, identificacao, tipo_atividade, area_climatizada_m2, ocupantes_fixos, ocupantes_flutuantes, carga_termica_tr, photo_url, sort_order),
          service_orders (id, order_number, status, scheduled_date, equipment_id)
        `)
        .eq('id', contractId!)
        .single();

      if (error) throw error;
      return data as unknown as Contract;
    },
  });

  const { data: linkedTransactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['contract-transactions', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('contract_id', contractId!)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data as any[];
    },
  });

  // "Pular" uma visita = CANCELAR a OS daquela data. Reusa a mutation de
  // update de OS (regra de negócio de OS mora no useServiceOrders) em vez de
  // escrever na antiga tabela-sombra de ocorrências (aposentada).
  const cancelOccurrenceOs = useMutation({
    mutationFn: async (serviceOrderId: string) => {
      await updateServiceOrder.mutateAsync({ id: serviceOrderId, status: 'cancelada' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Visita cancelada!' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  // Stats derivadas 100% das OSs reais do contrato.
  const contractOrders: ContractServiceOrder[] = contract?.service_orders || [];
  const totalOccurrences = contractOrders.length;
  const completedOccurrences = contractOrders.filter(o => o.status === 'concluida').length;
  // Próxima visita = OS ativa (≠ concluida/cancelada) com menor scheduled_date.
  const nextOrder = getNextContractOS(contractOrders);

  return {
    contract,
    isLoading,
    cancelOccurrenceOs,
    linkedTransactions,
    isLoadingTransactions,
    stats: {
      totalOccurrences,
      completedOccurrences,
      progressPercent: totalOccurrences > 0 ? Math.round((completedOccurrences / totalOccurrences) * 100) : 0,
      nextOccurrence: nextOrder,
    },
  };
}

// Re-export utilitário pra a tela de detalhe filtrar OS ativa sem reimportar
// de dois lugares.
export { isActiveContractOS };
