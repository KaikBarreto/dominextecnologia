import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Atividades (snapshot do plano) de um conjunto de OSs — agrupadas por
 * `service_order_id`. Usado na aba Ocorrências do detalhe de contrato pra
 * mostrar QUAIS serviços cada visita carrega + seu selo de frequência.
 *
 * Escopo: SEMPRE uma lista limitada de OSs (as do contrato aberto). NÃO
 * estender a query principal de `useContracts` com isso — ela roda pra TODOS
 * os contratos da lista e viraria N+1. RLS de `service_order_activities` já
 * filtra por company_id (tenant); o `.in('service_order_id', ...)` fecha o
 * escopo no contrato.
 */
export interface ServiceOrderActivity {
  id: string;
  service_order_id: string;
  description: string;
  section: string | null;
  component: string | null;
  freq_code: string | null;
  freq_months: number | null;
  sort_order: number;
}

/** M/T/S/A/E → label curto. Default: o próprio código (ou vazio). */
export function freqCodeShortLabel(freqCode: string | null | undefined): string | null {
  if (!freqCode) return null;
  const map: Record<string, string> = {
    M: 'Mensal',
    T: 'Trimestral',
    S: 'Semestral',
    A: 'Anual',
    E: 'Eventual',
  };
  return map[freqCode] ?? freqCode;
}

export function useServiceOrderActivities(serviceOrderIds: string[]) {
  // Chave estável (ordenada) pra cache não invalidar por ordem.
  const ids = [...serviceOrderIds].filter(Boolean).sort();

  const { data, isLoading } = useQuery({
    queryKey: ['service-order-activities', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_order_activities')
        .select('id, service_order_id, description, section, component, freq_code, freq_months, sort_order')
        .in('service_order_id', ids)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceOrderActivity[];
    },
  });

  // Agrupado por service_order_id pra consulta O(1) no render.
  const byOrderId = new Map<string, ServiceOrderActivity[]>();
  for (const a of data ?? []) {
    const arr = byOrderId.get(a.service_order_id) ?? [];
    arr.push(a);
    byOrderId.set(a.service_order_id, arr);
  }

  return { activitiesByOrderId: byOrderId, isLoading };
}
