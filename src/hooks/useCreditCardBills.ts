import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import type { CreditCardBill } from '@/types/database';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import { format, addDays, setDate, addMonths, startOfMonth } from 'date-fns';

export type { CreditCardBill };

export interface CreditCardBillWithTransactions extends CreditCardBill {
  transactions?: {
    id: string;
    description: string;
    amount: number;
    transaction_date: string;
    category?: string;
    is_paid: boolean;
  }[];
  total_amount?: number;
}

export interface PayBillInput {
  bill: CreditCardBillWithTransactions;
  paymentAccountId: string;
  paymentDate: string;
  amountToPay: number;
  notes?: string;
}

/**
 * Given a card account and a transaction date, compute which bill month
 * the transaction belongs to (as first day of that month, YYYY-MM-DD).
 */
export function computeBillDate(account: Pick<FinancialAccount, 'closing_day'>, transactionDate: string): string {
  const closingDay = account.closing_day ?? 10;
  const txDate = new Date(transactionDate + 'T12:00:00');
  const txDay = txDate.getDate();

  if (txDay <= closingDay) {
    return format(startOfMonth(txDate), 'yyyy-MM-dd');
  } else {
    return format(startOfMonth(addMonths(txDate, 1)), 'yyyy-MM-dd');
  }
}

/**
 * Given a card account and a reference_month (first day of month),
 * compute the closing_date and due_date.
 */
export function computeBillDates(
  account: Pick<FinancialAccount, 'closing_day' | 'payment_due_days'>,
  referenceMonth: string
): { closing_date: string; due_date: string } {
  const closingDay = account.closing_day ?? 10;
  const paymentDueDays = account.payment_due_days ?? 10;

  const refDate = new Date(referenceMonth + 'T12:00:00');
  const closingDate = setDate(refDate, closingDay);
  const dueDate = addDays(closingDate, paymentDueDays);

  return {
    closing_date: format(closingDate, 'yyyy-MM-dd'),
    due_date: format(dueDate, 'yyyy-MM-dd'),
  };
}

export function useCreditCardBills(accountId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
  };

  const billsQuery = useQuery({
    queryKey: ['credit-card-bills', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const [billsResult, txnsResult] = await Promise.all([
        supabase
          .from('credit_card_bills')
          .select('*')
          .eq('account_id', accountId!)
          .order('reference_month', { ascending: false }),
        supabase
          .from('financial_transactions')
          .select('id, description, amount, transaction_date, category, is_paid, credit_card_bill_date')
          .eq('account_id', accountId!)
          .eq('transaction_type', 'saida')
          .not('credit_card_bill_date', 'is', null)
          .order('transaction_date', { ascending: false }),
      ]);

      if (billsResult.error) throw billsResult.error;

      const txnsByMonth: Record<string, typeof txnsResult.data> = {};
      for (const t of (txnsResult.data ?? [])) {
        if (!t.credit_card_bill_date) continue;
        (txnsByMonth[t.credit_card_bill_date] ??= []).push(t);
      }

      return (billsResult.data as CreditCardBill[]).map((bill) => {
        const transactions = txnsByMonth[bill.reference_month] ?? [];
        const total_amount = transactions.reduce((s, t) => s + Number(t.amount), 0);
        return { ...bill, transactions, total_amount } as CreditCardBillWithTransactions;
      });
    },
  });

  const getOrCreateBill = useMutation({
    mutationFn: async ({
      account,
      referenceMonth,
    }: {
      account: FinancialAccount;
      referenceMonth: string;
    }) => {
      const { closing_date, due_date } = computeBillDates(account, referenceMonth);

      const { data: existing } = await supabase
        .from('credit_card_bills')
        .select('*')
        .eq('account_id', account.id)
        .eq('reference_month', referenceMonth)
        .maybeSingle();

      if (existing) return existing as CreditCardBill;

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const { data, error } = await supabase
        .from('credit_card_bills')
        .insert({
          company_id,
          account_id: account.id,
          reference_month: referenceMonth,
          closing_date,
          due_date,
          status: 'open',
          amount_paid: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CreditCardBill;
    },
    onSuccess: () => invalidateAll(),
  });

  const payBill = useMutation({
    mutationFn: async ({ bill, paymentAccountId, paymentDate, amountToPay, notes }: PayBillInput) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const billTotal = Number(bill.total_amount ?? 0);
      const previouslyPaid = Number(bill.amount_paid ?? 0);
      const remaining = billTotal - previouslyPaid;
      const isFullPayment = amountToPay >= remaining - 0.01;

      // Create payment transaction (saida from bank/caixa account)
      const { data: paymentTxn, error: txnErr } = await supabase
        .from('financial_transactions')
        .insert({
          transaction_type: 'saida',
          description: `Pagamento de fatura — ${bill.reference_month}`,
          amount: amountToPay,
          transaction_date: paymentDate,
          paid_date: paymentDate,
          is_paid: true,
          account_id: paymentAccountId,
          category: 'Pagamento de Fatura',
          notes: notes || null,
          created_by: user.id,
          company_id,
        })
        .select()
        .single();
      if (txnErr) throw txnErr;

      const newAmountPaid = previouslyPaid + amountToPay;
      const newStatus = isFullPayment ? 'paid' : 'partial';

      const { error: billErr } = await supabase
        .from('credit_card_bills')
        .update({
          status: newStatus,
          amount_paid: newAmountPaid,
          payment_transaction_id: isFullPayment ? paymentTxn.id : bill.payment_transaction_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bill.id);
      if (billErr) throw billErr;

      return paymentTxn;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Pagamento registrado!', description: 'Fatura atualizada com sucesso.' });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao pagar fatura', description: getErrorMessage(e) });
    },
  });

  return {
    bills: billsQuery.data ?? [],
    isLoading: billsQuery.isLoading,
    getOrCreateBill,
    payBill,
  };
}
