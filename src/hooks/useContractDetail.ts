import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Contract } from './useContracts';

export function useContractDetail(contractId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract-detail', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          customers (id, name, document, phone),
          contract_items (id, contract_id, equipment_id, item_name, item_description, form_template_id, sort_order, equipment:equipment(id, name, brand, model)),
          contract_occurrences (id, contract_id, scheduled_date, service_order_id, status, occurrence_number, service_orders:service_orders(id, order_number, status, scheduled_date))
        `)
        .eq('id', contractId!)
        .single();

      if (error) throw error;
      return data as unknown as Contract;
    },
  });

  const updateOccurrenceStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('contract_occurrences')
        .update({ status } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Ocorrência atualizada!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  // Computed stats
  const occurrences = contract?.contract_occurrences || [];
  const totalOccurrences = occurrences.length;
  const completedOccurrences = occurrences.filter(o => o.status === 'completed').length;
  const nextOccurrence = occurrences
    .filter(o => o.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())[0];

  return {
    contract,
    isLoading,
    updateOccurrenceStatus,
    stats: {
      totalOccurrences,
      completedOccurrences,
      progressPercent: totalOccurrences > 0 ? Math.round((completedOccurrences / totalOccurrences) * 100) : 0,
      nextOccurrence,
    },
  };
}
