import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { QuoteCostComposition } from '@/components/quotes/QuoteServiceCostEditor';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface CatalogCostSnapshot {
  serviceId: string;
  composition: QuoteCostComposition;
}

export function useSaveQuoteServiceCosts() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (snapshots: CatalogCostSnapshot[]) => {
      for (const snapshot of snapshots) {
        const { error } = await supabase.rpc('save_service_cost_composition_from_quote', {
          _service_id: snapshot.serviceId,
          _hourly_rate: snapshot.composition.labor.hourlyRate,
          _hours: snapshot.composition.labor.hours,
          _resources: snapshot.composition.resources as unknown as Json,
          _supplies: snapshot.composition.supplies as unknown as Json,
        });
        if (error) throw error;
      }
    },
    // Cada serviço é salvo atomicamente, mas um lote pode falhar após salvar
    // os anteriores. Atualizar também no erro evita exibir o catálogo antigo.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['service-costs'] });
      queryClient.invalidateQueries({ queryKey: ['service-materials'] });
      queryClient.invalidateQueries({ queryKey: ['service-cost-resources'] });
      queryClient.invalidateQueries({ queryKey: ['service-gifts'] });
      queryClient.invalidateQueries({ queryKey: ['service-cost-breakdown'] });
    },
  });

  return mutation;
}
