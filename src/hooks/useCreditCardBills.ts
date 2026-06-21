import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import type { CreditCardBill } from '@/types/database';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import { format, addDays, setDate, addMonths, startOfMonth, getDaysInMonth } from 'date-fns';

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
 *
 * Regra de mercado: o próprio dia de fechamento já entra na próxima fatura.
 * Ex.: closing_day=20 → compra dia 19 cai no mês corrente, dia 20 vai para o
 * mês seguinte. Confirmado pelo cliente Glacial Cold (mai/2026).
 */
export function computeBillDate(account: Pick<FinancialAccount, 'closing_day'>, transactionDate: string): string {
  const closingDay = account.closing_day ?? 10;
  const txDate = new Date(transactionDate + 'T12:00:00');
  // Clamp to actual days in the transaction's month (handles months shorter than closing_day)
  const effectiveClosingDay = Math.min(closingDay, getDaysInMonth(txDate));
  const txDay = txDate.getDate();

  if (txDay < effectiveClosingDay) {
    return format(startOfMonth(txDate), 'yyyy-MM-dd');
  } else {
    return format(startOfMonth(addMonths(txDate, 1)), 'yyyy-MM-dd');
  }
}

/**
 * Given a card account and a reference_month (first day of month),
 * compute the closing_date and due_date.
 *
 * Prefers account.due_day (calendar day) over payment_due_days (day offset).
 * When due_day < closing_day the due date falls in the month following closing.
 */
export function computeBillDates(
  account: Pick<FinancialAccount, 'closing_day' | 'payment_due_days' | 'due_day'>,
  referenceMonth: string
): { closing_date: string; due_date: string } {
  const closingDay = account.closing_day ?? 10;
  const refDate = new Date(referenceMonth + 'T12:00:00');
  // Clamp to actual days in the reference month (handles closing_day 29-31 in short months)
  const effectiveClosingDay = Math.min(closingDay, getDaysInMonth(refDate));
  const closingDate = setDate(refDate, effectiveClosingDay);

  let dueDate: Date;
  if (account.due_day) {
    if (account.due_day > effectiveClosingDay) {
      const effectiveDueDay = Math.min(account.due_day, getDaysInMonth(refDate));
      dueDate = setDate(refDate, effectiveDueDay);
    } else {
      const nextMonth = addMonths(refDate, 1);
      const effectiveDueDay = Math.min(account.due_day, getDaysInMonth(nextMonth));
      dueDate = setDate(nextMonth, effectiveDueDay);
    }
  } else {
    dueDate = addDays(closingDate, account.payment_due_days ?? 10);
  }

  return {
    closing_date: format(closingDate, 'yyyy-MM-dd'),
    due_date: format(dueDate, 'yyyy-MM-dd'),
  };
}

/**
 * "Hoje" em America/Sao_Paulo (UTC-3), como string YYYY-MM-DD. Comparar datas de
 * fechamento/vencimento (que são date puro, sem hora) sempre no fuso do Brasil —
 * usar `new Date()` direto pegaria o fuso do dispositivo/UTC e erraria a virada
 * do dia (régua de timezone do Dominex).
 */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Status EXIBIDO da fatura. No banco a fatura nasce `open` e só muda quando é
 * paga (`partial`/`paid`) — não existe transição automática pra `closed`. Logo,
 * uma fatura cujo dia de fechamento já passou continuaria gravada como `open`.
 * Aqui derivamos o status visível: `open` + fechamento já passado → `closed`.
 * `partial`/`paid` são do agregado e não mudam (o que importa é se foi paga).
 *
 * Comparação em America/Sao_Paulo: a fatura está FECHADA quando hoje > a data de
 * fechamento (o ciclo corrente, cujo fechamento ainda é hoje ou no futuro, segue
 * `open`/em acumulação).
 */
export function effectiveBillStatus(bill: Pick<CreditCardBill, 'status' | 'closing_date'>): string {
  if (bill.status !== 'open') return bill.status;
  if (!bill.closing_date) return bill.status;
  // closing_date e "hoje" são ambos YYYY-MM-DD no fuso do Brasil → compara lexical.
  return todayInSaoPaulo() > bill.closing_date ? 'closed' : 'open';
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
          .order('due_date', { ascending: true }),
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

      // Ordem final: faturas em aberto/parcial/fechada por due_date ASC,
      // pagas vão pro fim. CEO quer próximas vencer no topo. v1.9.15.
      const enriched = (billsResult.data as CreditCardBill[]).map((bill) => {
        const transactions = txnsByMonth[bill.reference_month] ?? [];
        const total_amount = transactions.reduce((s, t) => s + Number(t.amount), 0);
        return { ...bill, transactions, total_amount } as CreditCardBillWithTransactions;
      });
      enriched.sort((a, b) => {
        const aPriority = a.status === 'paid' ? 1 : 0;
        const bPriority = b.status === 'paid' ? 1 : 0;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.due_date.localeCompare(b.due_date);
      });
      return enriched;
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

/**
 * Variante do hook que carrega TODAS as faturas de TODOS os cartões do tenant.
 * Usado pela tela Contas a Pagar pra agrupar despesas de cartão em linhas-de-fatura
 * (em vez de mostrar cada despesa individualmente). RLS na tabela cuida do escopo.
 *
 * Reaproveita o `payBill` do hook principal — basta o caller chamar
 * `useCreditCardBills(account_id)` quando precisar disparar o pagamento.
 * v1.9.15 — refactor cartão/faturas.
 */
export function useAllCreditCardBills() {
  const billsQuery = useQuery({
    queryKey: ['credit-card-bills', 'all'],
    queryFn: async () => {
      const [billsResult, txnsResult] = await Promise.all([
        supabase
          .from('credit_card_bills')
          .select('*')
          .order('due_date', { ascending: true }),
        supabase
          .from('financial_transactions')
          .select('id, description, amount, transaction_date, category, is_paid, credit_card_bill_date, account_id')
          .eq('transaction_type', 'saida')
          .not('credit_card_bill_date', 'is', null),
      ]);

      if (billsResult.error) throw billsResult.error;

      // Index por (account_id + reference_month) — o mesmo cartão pode ter
      // várias faturas (uma por mês). Sem agrupamento por conta, duas faturas
      // de cartões diferentes no mesmo mês colapsariam.
      const txnsByKey: Record<string, Array<{
        id: string;
        description: string;
        amount: number;
        transaction_date: string;
        category?: string;
        is_paid: boolean;
        credit_card_bill_date: string | null;
        account_id: string | null;
      }>> = {};
      for (const t of (txnsResult.data ?? [])) {
        if (!t.credit_card_bill_date || !t.account_id) continue;
        const key = `${t.account_id}__${t.credit_card_bill_date}`;
        (txnsByKey[key] ??= []).push(t);
      }

      const enriched = (billsResult.data as CreditCardBill[]).map((bill) => {
        const key = `${bill.account_id}__${bill.reference_month}`;
        const transactions = txnsByKey[key] ?? [];
        const total_amount = transactions.reduce((s, t) => s + Number(t.amount), 0);
        return { ...bill, transactions, total_amount } as CreditCardBillWithTransactions;
      });

      // Mesma ordem do hook por conta: abertas/parciais/fechadas primeiro,
      // pagas no fim. Tudo ASC por due_date.
      enriched.sort((a, b) => {
        const aPriority = a.status === 'paid' ? 1 : 0;
        const bPriority = b.status === 'paid' ? 1 : 0;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.due_date.localeCompare(b.due_date);
      });
      return enriched;
    },
  });

  return {
    bills: billsQuery.data ?? [],
    isLoading: billsQuery.isLoading,
  };
}
