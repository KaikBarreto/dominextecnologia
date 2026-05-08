import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { computeBillDate, computeBillDates } from '@/hooks/useCreditCardBills';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import { fetchAllPaginated } from '@/utils/supabasePagination';

/**
 * Recalcula `credit_card_bill_date` de todas as despesas de um cartão segundo
 * a configuração atual da conta (closing_day/due_day). Útil após ajuste de
 * configuração ou correção de bug em `computeBillDate`.
 *
 * - **NÃO** altera `transaction_date` nem valor das transações.
 * - **Idempotente**: rodar duas vezes em sequência só altera linhas no 1º run.
 * - Recria as rows de `credit_card_bills` para os meses afetados, com
 *   `closing_date`/`due_date` atualizados via `computeBillDates`.
 *
 * Volume: client-side com chunks de UPDATE. Para >500 transações por cartão,
 * considerar mover para RPC server-side (devolver ao Tech Lead).
 */
export function useRecalculateBills() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardId: string): Promise<{ updatedCount: number; totalCount: number; monthsTouched: number }> => {
      // 1. Buscar config atual do cartão
      const { data: account, error: accErr } = await supabase
        .from('financial_accounts')
        .select('id, company_id, name, type, closing_day, payment_due_days, due_day')
        .eq('id', cardId)
        .single();
      if (accErr) throw accErr;
      if (!account || account.type !== 'cartao') {
        throw new Error('Conta inválida ou não é cartão de crédito.');
      }

      // 2. Buscar todas as transações do cartão que já tinham bill_date setado
      const transactions = await fetchAllPaginated<{
        id: string;
        transaction_date: string;
        credit_card_bill_date: string | null;
      }>(
        () => supabase
          .from('financial_transactions')
          .select('id, transaction_date, credit_card_bill_date')
          .eq('account_id', cardId)
          .eq('transaction_type', 'saida')
          .not('credit_card_bill_date', 'is', null)
      );

      const totalCount = transactions.length;
      if (totalCount === 0) {
        return { updatedCount: 0, totalCount: 0, monthsTouched: 0 };
      }

      // 3. Recomputar bill_date de cada transação. Atualizar só as que mudaram.
      const accForCompute: Pick<FinancialAccount, 'closing_day'> = {
        closing_day: account.closing_day ?? null,
      };
      const toUpdate: Array<{ id: string; newBillDate: string }> = [];
      const monthsTouched = new Set<string>();

      for (const t of transactions) {
        if (!t.transaction_date) continue;
        const newBillDate = computeBillDate(accForCompute, t.transaction_date);
        monthsTouched.add(newBillDate);
        if (newBillDate !== t.credit_card_bill_date) {
          toUpdate.push({ id: t.id, newBillDate });
        }
      }

      // 4. Aplicar updates em chunks (Supabase recomenda <= 100 por request)
      const CHUNK = 100;
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map(({ id, newBillDate }) =>
            supabase
              .from('financial_transactions')
              .update({ credit_card_bill_date: newBillDate })
              .eq('id', id)
          )
        );
      }

      // 5. Garantir/atualizar a row em credit_card_bills para cada mês tocado.
      //    Usamos upsert pra criar quem falta; depois um update pra recomputar
      //    closing_date/due_date dos meses já existentes (caso a config tenha
      //    mudado).
      const accForBillDates: Pick<FinancialAccount, 'closing_day' | 'payment_due_days' | 'due_day'> = {
        closing_day: account.closing_day ?? null,
        payment_due_days: account.payment_due_days ?? null,
        due_day: account.due_day ?? null,
      };

      for (const month of monthsTouched) {
        const { closing_date, due_date } = computeBillDates(accForBillDates, month);

        // Tenta inserir; se já existe, ignora (não toca em status/amount_paid).
        await supabase.from('credit_card_bills').upsert(
          {
            company_id: account.company_id,
            account_id: cardId,
            reference_month: month,
            closing_date,
            due_date,
            status: 'open',
            amount_paid: 0,
          },
          { onConflict: 'account_id,reference_month', ignoreDuplicates: true }
        );

        // Atualiza closing_date/due_date dos meses afetados (sem mexer status,
        // amount_paid ou payment_transaction_id — para não afetar faturas pagas).
        await supabase
          .from('credit_card_bills')
          .update({
            closing_date,
            due_date,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', cardId)
          .eq('reference_month', month);
      }

      return {
        updatedCount: toUpdate.length,
        totalCount,
        monthsTouched: monthsTouched.size,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });

      if (result.totalCount === 0) {
        toast({
          title: 'Nada para recalcular',
          description: 'Este cartão ainda não tem despesas.',
        });
      } else if (result.updatedCount === 0) {
        toast({
          title: 'Tudo certo!',
          description: `${result.totalCount} despesa(s) verificadas — todas já estavam na fatura correta.`,
        });
      } else {
        toast({
          title: 'Faturas atualizadas',
          description: `${result.updatedCount} despesa(s) reprocessadas em ${result.monthsTouched} fatura(s).`,
        });
      }
    },
    onError: (e: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao recalcular faturas',
        description: getErrorMessage(e),
      });
    },
  });
}
