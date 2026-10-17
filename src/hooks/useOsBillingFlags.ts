import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { isLiveChargeStatus } from '@/lib/contract-installment-charge';
import type { OsBillingSnapshot } from '@/lib/os-billing';

/**
 * "Esta OS já foi faturada?" para uma LISTA de OSs de uma vez.
 *
 * Existe porque a RPC `os_billing_state` responde por UMA OS e serve ao
 * diálogo; usar ela pra pintar selo em lista dispararia uma chamada por linha.
 * Aqui são DUAS consultas pro lote inteiro, independente do tamanho da página.
 *
 * O resultado é um `Map<serviceOrderId, OsBillingSnapshot>` com o MESMO shape
 * que `getOsBillingStatus` consome — a regra de precedência (cobrança viva
 * ganha de receita) mora lá, testada, e não é reescrita aqui.
 *
 * Regra-lei nº4: componente nunca chama `supabase.from(...)` direto, vem por aqui.
 */

export const OS_BILLING_FLAGS_KEY = 'os-billing-flags';

export function useOsBillingFlags(serviceOrderIds: string[], enabled = true) {
  const { companyId } = useUserCompany();

  // Chave estável: ordena e junta. Sem isso, a mesma página re-renderizada numa
  // ordem diferente viraria uma query nova a cada render.
  const ids = Array.from(new Set(serviceOrderIds.filter(Boolean))).sort();

  const query = useQuery({
    queryKey: [OS_BILLING_FLAGS_KEY, companyId, ids.join(',')],
    enabled: !!companyId && enabled && ids.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, OsBillingSnapshot>> => {
      const mapa = new Map<string, OsBillingSnapshot>();
      if (!companyId || ids.length === 0) return mapa;

      const garantir = (id: string): OsBillingSnapshot => {
        const atual = mapa.get(id);
        if (atual) return atual;
        const novo: OsBillingSnapshot = {
          hasRevenue: false,
          hasCharge: false,
          revenueTotal: 0,
          chargeValue: null,
          chargeDueDate: null,
          chargeId: null,
          chargeStatus: null,
        };
        mapa.set(id, novo);
        return novo;
      };

      // O kanban mostra a lista FILTRADA inteira, não uma página — um mês cheio
      // pode passar de mil OSs. `IN (...)` com tudo de uma vez estoura o limite
      // de tamanho da URL do PostgREST, então vai em lotes. Fatiar é melhor que
      // capar: capar faria o selo sumir em silêncio justamente nas listas
      // grandes, que é onde ele mais serve.
      const LOTE = 150;
      for (let i = 0; i < ids.length; i += LOTE) {
        const fatia = ids.slice(i, i + LOTE);

        // 1) Receita lançada. Conta TUDO que é entrada não cancelada da OS,
        //    inclusive o recebível que nasceu de cobrança — é o mesmo critério
        //    do `os_billing_state`, senão o selo diria uma coisa e o diálogo
        //    outra.
        const { data: receitas, error: errReceitas } = await supabase
          .from('financial_transactions')
          .select('service_order_id, amount')
          .eq('company_id', companyId)
          .in('service_order_id', fatia)
          .eq('transaction_type', 'entrada')
          .is('cancelled_at', null);
        if (errReceitas) throw errReceitas;

        for (const linha of (receitas ?? []) as Array<{ service_order_id: string | null; amount: number | string | null }>) {
          if (!linha.service_order_id) continue;
          const snap = garantir(linha.service_order_id);
          snap.hasRevenue = true;
          snap.revenueTotal += Number(linha.amount ?? 0);
        }

        // 2) Cobrança VIVA da OS. `isLiveChargeStatus` é o mesmo conjunto de
        //    "cobrança morta" da edge (`DEDUPE_DEAD_STATUSES`) e do trigger do
        //    banco: cancelada/estornada/chargeback não conta.
        const { data: cobrancas, error: errCobrancas } = await supabase
          .from('tenant_charges')
          .select('source_id, status, value, due_date, id')
          .eq('company_id', companyId)
          .eq('source_type', 'service_order')
          .in('source_id', fatia);
        if (errCobrancas) throw errCobrancas;

        for (const c of (cobrancas ?? []) as Array<any>) {
          if (!c.source_id || !isLiveChargeStatus(c.status)) continue;
          const snap = garantir(c.source_id);
          snap.hasCharge = true;
          snap.chargeId = c.id ?? null;
          snap.chargeStatus = c.status ?? null;
          snap.chargeValue = c.value != null ? Number(c.value) : null;
          snap.chargeDueDate = c.due_date ?? null;
        }
      }

      return mapa;
    },
  });

  return {
    flags: query.data ?? new Map<string, OsBillingSnapshot>(),
    isLoading: query.isLoading,
  };
}
