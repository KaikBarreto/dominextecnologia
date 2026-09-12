import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

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
 * Cobrança `refunded` NÃO conta: o dinheiro voltou, e aprovar o orçamento
 * depois de um estorno é o único cenário em que faz sentido gerar a receita.
 */
export function useQuoteChargedIds() {
  const { companyId } = useUserCompany();

  const query = useQuery({
    queryKey: ['quote-charged-ids', companyId],
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      if (!companyId) return new Set<string>();
      const { data, error } = await supabase
        .from('tenant_charges')
        .select('source_id, status')
        .eq('company_id', companyId)
        .eq('source_type', 'quote')
        .neq('status', 'refunded');
      if (error) throw error;
      return new Set(
        (data ?? [])
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
