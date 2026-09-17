import { supabase } from '@/integrations/supabase/client';

/**
 * Acesso ao vínculo `leads.won_transaction_id` — a TRAVA DE IDEMPOTÊNCIA da
 * receita gerada quando a oportunidade vai pra um estágio de ganho.
 *
 * Fica num módulo de hook (e não dentro do componente) porque componente nunca
 * fala com o Supabase direto (regra-lei nº4). É o mesmo arranjo de
 * `fetchOsRevenueTotals` em src/hooks/useOsRevenueSummary.ts: caminho
 * imperativo, chamado UMA vez, sem React Query no meio.
 *
 * Semântica da coluna (ver migration 20260917130000_leads_won_transaction_id):
 *   null      → ainda não gerou receita  → pode oferecer
 *   não-null  → já gerou                 → NÃO oferecer de novo
 *   `on delete set null` → lançamento excluído devolve a oportunidade pro
 *   estado "pode gerar", de propósito.
 */

/**
 * Lê do banco (não do cache) se esta oportunidade já gerou receita.
 *
 * Devolve `null` quando a consulta FALHA (offline, RLS, servidor fora). Isso é
 * diferente de `{ transactionId: null }`, que significa "consultei e não há
 * receita". Quem chama PRECISA distinguir: tratar falha como "não tem" abriria
 * a oferta numa oportunidade que já gerou e criaria receita duplicada.
 */
export async function fetchLeadWonTransactionId(
  leadId: string,
): Promise<{ transactionId: string | null } | null> {
  try {
    // Defense-in-depth: filtra pela própria empresa no client também. A RLS de
    // `leads` continua sendo a segurança de verdade (regra-lei nº1).
    const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
    const companyId = await getCurrentUserCompanyId();
    if (!companyId) return null;

    const { data, error } = await supabase
      .from('leads')
      .select('won_transaction_id')
      .eq('id', leadId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) return null;
    // Linha não encontrada (apagada, ou invisível pela RLS) também é "não sei":
    // sem saber, não oferecemos.
    if (!data) return null;

    return { transactionId: data.won_transaction_id ?? null };
  } catch {
    return null;
  }
}

/**
 * Grava o vínculo da receita recém-criada na oportunidade.
 *
 * Devolve `false` em QUALQUER falha, e quem chama tem que gritar. Este é o pior
 * cenário da feature: a receita já existe no Financeiro, mas a oportunidade
 * continua com `won_transaction_id = null` e, na próxima vez que alguém mexer
 * no estágio, o sistema ofereceria lançar tudo de novo — receita duplicada.
 * Silêncio aqui é bug financeiro, não detalhe de UX.
 */
export async function linkLeadWonTransaction(
  leadId: string,
  transactionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ won_transaction_id: transactionId })
      .eq('id', leadId)
      .select('id, won_transaction_id')
      .maybeSingle();

    if (error) return false;
    // Zero linhas afetadas (RLS barrou, lead apagado no meio do caminho) conta
    // como falha: o `update` "passou" sem gravar nada.
    return data?.won_transaction_id === transactionId;
  } catch {
    return false;
  }
}
