import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

/**
 * Lista enxuta de OSs pra ESCOLHER num formulário (lançamento do Financeiro,
 * cobrança). Não serve pra listar OS na tela de OS — ali é `useServiceOrders`,
 * que traz joins pesados.
 *
 * Por que existe: até a 1.36.1 só dava pra amarrar um lançamento numa OS
 * quando o fluxo COMEÇAVA na OS. Quem lançava a receita direto pelo Financeiro
 * deixava o dinheiro solto, a OS ficava sem selo de "Faturada", e a trava de
 * contagem dupla não enxergava esse caminho — dava pra faturar a mesma OS de
 * novo sem o sistema barrar. Este seletor fecha essa porta lateral.
 *
 * Capa o histórico de propósito (as mais recentes): um tenant antigo tem
 * milhares de OSs e carregar tudo num combobox trava o formulário. A busca do
 * `SearchableSelect` é client-side em cima dessa janela.
 */

export const SERVICE_ORDER_OPTIONS_KEY = 'service-order-options';

/** Quantas OSs recentes entram no seletor. */
const JANELA = 300;

export interface ServiceOrderOption {
  id: string;
  order_number: number | null;
  scheduled_date: string | null;
  status: string | null;
  total_value: number | null;
  customer_name: string | null;
}

const SELECT = 'id, order_number, scheduled_date, status, total_value, customer:customers(name)';

function normalizar(row: any): ServiceOrderOption {
  const cliente = Array.isArray(row.customer) ? row.customer[0] : row.customer;
  return {
    id: row.id,
    order_number: row.order_number ?? null,
    scheduled_date: row.scheduled_date ?? null,
    status: row.status ?? null,
    total_value: row.total_value != null ? Number(row.total_value) : null,
    customer_name: cliente?.name ?? null,
  };
}

/**
 * @param selectedId OS já vinculada ao registro que está sendo EDITADO. Entra
 *   na lista mesmo se for antiga demais pra janela — senão, ao abrir um
 *   lançamento velho, o campo apareceria vazio e salvar apagaria o vínculo.
 */
export function useServiceOrderOptions(enabled = true, selectedId?: string | null) {
  const { companyId } = useUserCompany();

  const query = useQuery({
    queryKey: [SERVICE_ORDER_OPTIONS_KEY, companyId, selectedId ?? null],
    enabled: !!companyId && enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ServiceOrderOption[]> => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('service_orders')
        .select(SELECT)
        .eq('company_id', companyId)
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(JANELA);
      if (error) throw error;

      const lista = (data ?? []).map(normalizar);

      // A OS já vinculada tem que existir na lista, custe o que custar.
      if (selectedId && !lista.some((os) => os.id === selectedId)) {
        const { data: avulsa } = await supabase
          .from('service_orders')
          .select(SELECT)
          .eq('company_id', companyId)
          .eq('id', selectedId)
          .maybeSingle();
        if (avulsa) lista.unshift(normalizar(avulsa));
      }

      return lista;
    },
  });

  return {
    serviceOrders: query.data ?? [],
    isLoading: query.isLoading,
  };
}
