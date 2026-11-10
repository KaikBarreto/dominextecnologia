import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { isLiveChargeStatus } from '@/lib/contract-installment-charge';

export const QUOTE_CHARGED_IDS_QUERY_KEY = ['quote-charged-ids'] as const;

/**
 * IDs de orçamento que já têm cobrança gerada via Asaas
 * (`tenant_charges.source_type = 'quote'`).
 *
 * Existe pra fechar a metade de INTERFACE do buraco de contagem dupla: hoje é
 * possível gerar uma cobrança a partir de um orçamento (RPC
 * `create_tenant_charge_receivable`, via edge `tenant-asaas-create-charge`) e
 * DEPOIS aprovar o mesmo orçamento em modo "a receber"
 * (`useQuoteConversion.approveQuoteFinancial`) — os dois caminhos não se
 * enxergam, e o resultado é a mesma venda contada duas vezes no financeiro.
 *
 * A UI só bloqueia hoje a ordem inversa (aprovar → cobrar, via
 * `quotes.financial_generated_at`). Este hook cobre a ordem que faltava
 * (cobrar → aprovar). A trava DEFINITIVA precisa ser no banco, na própria RPC
 * `create_tenant_charge_receivable` — ver comentário em `Quotes.tsx`.
 *
 * Cobrança MORTA não conta: o dinheiro voltou (ou nunca veio), e aprovar o
 * orçamento depois disso é o cenário em que faz sentido gerar a receita.
 *
 * 🐛 O filtro antigo era `.neq('status', 'refunded')` e **nunca filtrava nada**:
 * `tenant_charges.status` guarda o valor CRU do Asaas, em MAIÚSCULO
 * (`REFUNDED`, `CANCELLED`, `CONFIRMED`…); `'refunded'` minúsculo é o status
 * NORMALIZADO da UI (`src/utils/tenantChargeStatus.ts`). Resultado: um
 * orçamento cuja cobrança foi estornada seguia marcado como "já cobrado" pra
 * sempre, exatamente o oposto do que o parágrafo acima promete.
 *
 * A filtragem agora é client-side por `isLiveChargeStatus`, o MESMO conjunto
 * de "cobrança morta" que a edge usa no dedupe (`DEDUPE_DEAD_STATUSES`) e que
 * o banco usa no trigger anti-contagem-dupla da OS. São três camadas que
 * precisam andar juntas: não mude uma sem as outras.
 */
export function useQuoteChargedIds() {
  const { companyId } = useUserCompany();

  const query = useQuery({
    queryKey: [...QUOTE_CHARGED_IDS_QUERY_KEY, companyId],
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      if (!companyId) return new Set<string>();
      const { data, error } = await supabase
        .from('tenant_charges')
        .select('source_id, status')
        .eq('company_id', companyId)
        .eq('source_type', 'quote');
      if (error) throw error;
      return new Set(
        (data ?? [])
          // Filtro no client (e não no PostgREST) porque o conjunto morto tem 4
          // valores e grafias (`CANCELLED`/`CANCELED`), e `isLiveChargeStatus`
          // já normaliza caixa e espaço. Uma fonte só pra essa regra.
          .filter((r) => isLiveChargeStatus(r.status))
          .map((r) => r.source_id)
          .filter((id): id is string => !!id),
      );
    },
  });

  return {
    chargedQuoteIds: query.data ?? new Set<string>(),
    isLoading: query.isLoading,
  };
}
