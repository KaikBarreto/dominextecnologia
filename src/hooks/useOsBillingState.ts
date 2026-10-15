import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OsBillingSnapshot } from '@/lib/os-billing';

/** Chave raiz da query — use pra invalidar depois de lançar receita ou gerar cobrança. */
export const OS_BILLING_STATE_KEY = 'os-billing-state';

/** Shape cru devolvido pela RPC `os_billing_state`. */
interface OsBillingStateRow {
  service_order_id: string;
  has_revenue: boolean;
  revenue_total: number | string | null;
  revenue_count: number | string | null;
  has_charge: boolean;
  charge_id: string | null;
  charge_status: string | null;
  charge_value: number | string | null;
  charge_due_date: string | null;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fonte única de "esta OS já foi faturada?" — lê a RPC `os_billing_state`, que
 * enxerga receita manual E cobrança Asaas pela mesma origem (`service_order_id`
 * / `source_type = 'service_order'`). Usada pela ação "Faturar OS" (diálogo de
 * escolha) e por quem mais precisar saber o estado de faturamento da OS.
 */
export function useOsBillingState(serviceOrderId?: string | null) {
  const osId = serviceOrderId ?? null;

  const query = useQuery({
    queryKey: [OS_BILLING_STATE_KEY, osId],
    enabled: !!osId,
    queryFn: async (): Promise<OsBillingSnapshot> => {
      // Cast do nome: a RPC existe no banco, mas o union de nomes do client
      // pode não resolvê-la em algumas regenerações (mesmo padrão de
      // useEditOsScope / useContracts).
      const { data, error } = await supabase.rpc('os_billing_state' as any, {
        _service_order_id: osId,
      });
      if (error) throw error;
      const row = data as unknown as OsBillingStateRow;
      return {
        hasRevenue: !!row?.has_revenue,
        hasCharge: !!row?.has_charge,
        revenueTotal: toNumber(row?.revenue_total),
        chargeValue: row?.charge_value != null ? toNumber(row.charge_value) : null,
        chargeDueDate: row?.charge_due_date ?? null,
        chargeId: row?.charge_id ?? null,
        chargeStatus: row?.charge_status ?? null,
      };
    },
  });

  return {
    snapshot: query.data ?? null,
    isLoading: !!osId && query.isPending,
    isError: query.isError,
  };
}
