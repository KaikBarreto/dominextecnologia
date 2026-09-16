import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Quanto de RECEITA já foi lançado contra uma Ordem de Serviço.
 *
 * Fonte: `financial_transactions.service_order_id`. É o mesmo vínculo que o
 * fluxo "receita ao finalizar a OS" grava, então a tela da OS e a pergunta do
 * fechamento leem exatamente o mesmo número.
 *
 * Fora do escopo de propósito: DESPESA da OS (material, deslocamento). Aqui só
 * entra `transaction_type = 'entrada'`.
 */
export interface OsRevenueSummary {
  /** Soma das receitas não canceladas vinculadas à OS. 0 quando não há nenhuma. */
  total: number;
  /** Quantas linhas de receita não cancelada existem. 0 quando não há nenhuma. */
  count: number;
  isLoading: boolean;
}

/** Chave raiz das queries deste hook — use pra invalidar após lançar receita. */
export const OS_REVENUE_SUMMARY_KEY = 'os-revenue-summary';

/**
 * Consulta crua, sem React Query, pra quem precisa do número UMA vez num
 * caminho imperativo (o teste de idempotência do `useOsFinishRevenuePrompt`).
 *
 * Devolve `null` quando a consulta FALHA (offline, RLS, servidor fora). Isso é
 * diferente de `{ total: 0, count: 0 }`, que significa "consultei e não há
 * receita". Quem chama precisa distinguir: tratar falha como zero abriria a
 * pergunta numa OS que já tem receita e geraria lançamento duplicado.
 */
export async function fetchOsRevenueTotals(
  serviceOrderId: string,
): Promise<{ total: number; count: number } | null> {
  try {
    // Defense-in-depth: filtra pela própria empresa no client também. A RLS
    // continua sendo a segurança de verdade (regra-lei nº1).
    const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
    const companyId = await getCurrentUserCompanyId();
    if (!companyId) return null;

    const { data, error } = await supabase
      .from('financial_transactions')
      .select('amount')
      .eq('company_id', companyId)
      .eq('service_order_id', serviceOrderId)
      .eq('transaction_type', 'entrada')
      // Receita cancelada não conta: a OS volta a poder receber lançamento.
      .is('cancelled_at', null);

    if (error) return null;

    const rows = (data ?? []) as Array<{ amount: number | string | null }>;
    return {
      total: rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      count: rows.length,
    };
  } catch {
    return null;
  }
}

export function useOsRevenueSummary(serviceOrderId?: string | null): OsRevenueSummary {
  const osId = serviceOrderId ?? null;

  const query = useQuery({
    queryKey: [OS_REVENUE_SUMMARY_KEY, osId],
    enabled: !!osId,
    queryFn: async () => {
      const totals = await fetchOsRevenueTotals(osId as string);
      // `fetchOsRevenueTotals` engole o erro pra servir o caminho imperativo.
      // Aqui a query PRECISA falhar pra o React Query não cachear um zero falso
      // como se fosse resposta boa.
      if (!totals) throw new Error('Não foi possível ler as receitas desta OS.');
      return totals;
    },
  });

  return {
    total: query.data?.total ?? 0,
    count: query.data?.count ?? 0,
    // Sem OS a query nem roda, mas o status do React Query fica 'pending' pra
    // sempre. Sem esse gate a tela mostraria spinner eterno.
    isLoading: !!osId && query.isPending,
  };
}
