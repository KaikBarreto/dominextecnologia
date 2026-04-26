import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import { fetchAllPaginated } from '@/utils/supabasePagination';

export interface TransactionInput {
  transaction_type: TransactionType;
  category?: string;
  description: string;
  amount: number;
  transaction_date: string;
  due_date?: string;
  paid_date?: string;
  is_paid?: boolean;
  customer_id?: string;
  service_order_id?: string;
  contract_id?: string;
  notes?: string;
  payment_method?: string;
  receipt_url?: string;
  installment_count?: number;
  account_id?: string | null;
  credit_card_bill_date?: string | null;
}

export function useFinancial() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['contract-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
  };

  const transactionsQuery = useQuery({
    queryKey: ['financial-transactions'],
    queryFn: async () => {
      const data = await fetchAllPaginated<FinancialTransaction & { customer: any; account: any; employee: any }>(
        () => supabase
          .from('financial_transactions')
          .select(`
            *,
            customer:customers(id, name),
            account:financial_accounts(id, name, type, color),
            employee:employees(id, name, salary, photo_url)
          `)
          .order('transaction_date', { ascending: false })
      );
      return data;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const data = await fetchAllPaginated<{ transaction_type: string; amount: number; is_paid: boolean }>(
        () => supabase
          .from('financial_transactions')
          .select('transaction_type, amount, is_paid')
      );
      
      const summary = {
        totalEntradas: 0,
        totalSaidas: 0,
        saldo: 0,
        aPagar: 0,
        aReceber: 0,
      };

      data?.forEach((t) => {
        if (t.transaction_type === 'entrada') {
          if (t.is_paid) {
            summary.totalEntradas += Number(t.amount);
          } else {
            summary.aReceber += Number(t.amount);
          }
        } else {
          if (t.is_paid) {
            summary.totalSaidas += Number(t.amount);
          } else {
            summary.aPagar += Number(t.amount);
          }
        }
      });

      summary.saldo = summary.totalEntradas - summary.totalSaidas;
      
      return summary;
    },
  });

  const createTransaction = useMutation({
    mutationFn: async (input: TransactionInput) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { installment_count, ...rest } = input;
      const n = installment_count && installment_count > 1 ? installment_count : 0;

      if (n > 1) {
        const groupId = crypto.randomUUID();
        const perInstallment = Math.round((rest.amount / n) * 100) / 100;
        const baseDate = new Date(rest.transaction_date + 'T12:00:00');
        const rows = [];

        // For card accounts, compute the bill date per installment from its due date
        const isCardInstallment = !!rest.credit_card_bill_date && rest.transaction_type === 'saida';
        let cardAccount: { id: string; closing_day?: number | null; payment_due_days?: number | null; type: string } | null = null;
        if (isCardInstallment && rest.account_id) {
          const { data } = await supabase
            .from('financial_accounts')
            .select('id, closing_day, payment_due_days, type')
            .eq('id', rest.account_id)
            .single();
          cardAccount = data?.type === 'cartao' ? data : null;
        }

        const { computeBillDate, computeBillDates } = await import('@/hooks/useCreditCardBills');
        const billMonthsToCreate = new Set<string>();

        for (let i = 0; i < n; i++) {
          const dueDate = new Date(baseDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          const dueDateStr = dueDate.toISOString().split('T')[0];

          // Each installment belongs to its own bill month based on its own due date
          const installmentBillDate = cardAccount
            ? computeBillDate(cardAccount, dueDateStr)
            : rest.credit_card_bill_date ?? undefined;

          if (installmentBillDate) billMonthsToCreate.add(installmentBillDate);

          const sanitized = normalizeOptionalForeignKeys(
            {
              ...rest,
              amount: i === n - 1 ? Math.round((rest.amount - perInstallment * (n - 1)) * 100) / 100 : perInstallment,
              description: `${rest.description} (${i + 1}/${n})`,
              transaction_date: dueDateStr,
              due_date: dueDateStr,
              is_paid: i === 0 ? rest.is_paid : false,
              paid_date: i === 0 && rest.is_paid ? dueDateStr : undefined,
              credit_card_bill_date: installmentBillDate ?? null,
              created_by: user?.id,
              company_id,
              installment_group_id: groupId,
              installment_number: i + 1,
              installment_total: n,
            },
            ['customer_id', 'service_order_id', 'contract_id', 'account_id']
          );
          rows.push(sanitized);
        }

        const { error } = await supabase.from('financial_transactions').insert(rows as any);
        if (error) throw error;

        // Upsert a bill record for each unique month touched by installments
        if (cardAccount && billMonthsToCreate.size > 0) {
          for (const month of billMonthsToCreate) {
            const { closing_date, due_date } = computeBillDates(cardAccount, month);
            await supabase.from('credit_card_bills').upsert({
              company_id,
              account_id: cardAccount.id,
              reference_month: month,
              closing_date,
              due_date,
              status: 'open',
              amount_paid: 0,
            }, { onConflict: 'account_id,reference_month', ignoreDuplicates: true });
          }
        }

        return null;
      }

      const sanitized = normalizeOptionalForeignKeys(
        { ...rest, created_by: user?.id, company_id },
        ['customer_id', 'service_order_id', 'contract_id', 'account_id']
      );

      const { data, error } = await supabase
        .from('financial_transactions')
        .insert(sanitized as any)
        .select()
        .single();

      if (error) throw error;

      // If this is a credit card expense, auto-create the bill record
      if (rest.credit_card_bill_date && rest.account_id && rest.transaction_type === 'saida') {
        const { data: account } = await supabase
          .from('financial_accounts')
          .select('id, closing_day, payment_due_days, type')
          .eq('id', rest.account_id)
          .single();
        if (account?.type === 'cartao') {
          const { computeBillDates } = await import('@/hooks/useCreditCardBills');
          const { closing_date, due_date } = computeBillDates(account, rest.credit_card_bill_date);
          await supabase
            .from('credit_card_bills')
            .upsert({
              company_id,
              account_id: rest.account_id,
              reference_month: rest.credit_card_bill_date,
              closing_date,
              due_date,
              status: 'open',
              amount_paid: 0,
            }, { onConflict: 'account_id,reference_month', ignoreDuplicates: true });
        }
      }

      return data;
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
      toast({ title: 'Transação criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar transação', description: getErrorMessage(error) });
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...input }: TransactionInput & { id: string }) => {
      const { installment_count, ...rest } = input;
      const sanitized = normalizeOptionalForeignKeys(rest, ['customer_id', 'service_order_id', 'contract_id', 'account_id']);

      // Detect transition paid -> unpaid: also unmark linked children (tarifas, CMV)
      const { data: existing } = await supabase
        .from('financial_transactions')
        .select('is_paid')
        .eq('id', id)
        .maybeSingle();
      const wasPaidNowUnpaid = existing?.is_paid && rest.is_paid === false;

      const { data, error } = await supabase
        .from('financial_transactions')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      if (wasPaidNowUnpaid) {
        await supabase
          .from('financial_transactions')
          .update({ is_paid: false, paid_date: null } as any)
          .eq('parent_transaction_id', id);
      }

      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Transação atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description: getErrorMessage(error) });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      // Fetch the transaction before deleting so we can react to its category/amount
      const { data: txn } = await supabase
        .from('financial_transactions')
        .select('category, amount, account_id, credit_card_bill_date')
        .eq('id', id)
        .maybeSingle();

      // If this is a credit card bill payment, revert the corresponding bill
      if (txn?.category === 'Pagamento de Fatura' && txn.account_id) {
        // Find bill that references this payment transaction
        const { data: bill } = await supabase
          .from('credit_card_bills')
          .select('id, amount_paid, status, payment_transaction_id')
          .eq('payment_transaction_id', id)
          .maybeSingle();

        if (bill) {
          const newAmountPaid = Math.max(0, Number(bill.amount_paid ?? 0) - Number(txn.amount));
          await supabase
            .from('credit_card_bills')
            .update({
              status: newAmountPaid > 0 ? 'partial' : 'open',
              amount_paid: newAmountPaid,
              payment_transaction_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', bill.id);
        } else {
          // Payment may be partial — find bill by account + period and reduce amount_paid
          if (txn.credit_card_bill_date) {
            const { data: billByPeriod } = await supabase
              .from('credit_card_bills')
              .select('id, amount_paid')
              .eq('account_id', txn.account_id)
              .not('status', 'eq', 'open')
              .order('reference_month', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (billByPeriod) {
              const newAmountPaid = Math.max(0, Number(billByPeriod.amount_paid ?? 0) - Number(txn.amount));
              await supabase
                .from('credit_card_bills')
                .update({
                  status: newAmountPaid > 0 ? 'partial' : 'open',
                  amount_paid: newAmountPaid,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', billByPeriod.id);
            }
          }
        }
      }

      // Cascade delete children + clear quote link if root
      await supabase.from('financial_transactions').delete().eq('parent_transaction_id', id);
      await supabase
        .from('quotes')
        .update({ financial_transaction_id: null, financial_generated_at: null, status: 'enviado' } as any)
        .eq('financial_transaction_id', id);
      const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
      toast({ title: 'Transação excluída com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir transação', description: getErrorMessage(error) });
    },
  });

  interface MarkAsPaidParams {
    id: string;
    account_id?: string;
    payment_method?: string;
    paid_date?: string;
    fee_amount?: number;
    notes?: string;
    customer_id?: string | null;
  }

  const markAsPaid = useMutation({
    mutationFn: async (params: string | MarkAsPaidParams) => {
      const cfg: MarkAsPaidParams = typeof params === 'string' ? { id: params } : params;
      const paidDate = cfg.paid_date || new Date().toISOString().split('T')[0];

      const updatePayload: any = { is_paid: true, paid_date: paidDate };
      if (cfg.account_id) updatePayload.account_id = cfg.account_id;
      if (cfg.payment_method) updatePayload.payment_method = cfg.payment_method;

      const { data, error } = await supabase
        .from('financial_transactions')
        .update(updatePayload)
        .eq('id', cfg.id)
        .select('*, transaction_type, description')
        .single();
      if (error) throw error;

      // If a fee was reported, create a "Tarifas e Taxas" expense
      if (cfg.fee_amount && cfg.fee_amount > 0) {
        const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
        const company_id = await getCurrentUserCompanyId();
        const feePayload = normalizeOptionalForeignKeys({
          transaction_type: 'saida',
          amount: cfg.fee_amount,
          description: `Tarifa do recebimento — ${data.description || 'transação'}`,
          category: 'Tarifas e Taxas',
          customer_id: cfg.customer_id ?? (data as any).customer_id ?? null,
          account_id: cfg.account_id,
          payment_method: cfg.payment_method,
          transaction_date: paidDate,
          paid_date: paidDate,
          is_paid: true,
          notes: cfg.notes,
          created_by: user?.id,
          company_id,
          parent_transaction_id: data.id,
        } as any, ['customer_id', 'account_id']);
        const { error: feeErr } = await supabase.from('financial_transactions').insert(feePayload as any);
        if (feeErr) throw feeErr;
      }

      return data;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Recebimento confirmado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description: getErrorMessage(error) });
    },
  });

  return {
    transactions: transactionsQuery.data ?? [],
    summary: summaryQuery.data ?? { totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 },
    isLoading: transactionsQuery.isLoading || summaryQuery.isLoading,
    error: transactionsQuery.error || summaryQuery.error,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    markAsPaid,
  };
}
