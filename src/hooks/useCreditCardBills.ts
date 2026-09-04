import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
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
 * Retorno da RPC `pay_credit_card_bill` (contrato fechado com o banco).
 * O servidor decide `paid` x `partial` e devolve as DUAS pernas criadas:
 * a saída na conta que pagou e a entrada no cartão (a que devolve o limite).
 */
export interface PayBillResult {
  bill_id: string;
  status: 'paid' | 'partial';
  amount_paid: number;
  bill_total: number;
  paid_at: string | null;
  transfer_pair_id: string;
  payment_transaction_id: string;
  card_leg_transaction_id: string;
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
 * Comparação em America/Sao_Paulo: a fatura está FECHADA quando hoje já alcançou
 * a data de fechamento (INCLUSIVE o próprio dia). Só segue `open`/em acumulação
 * o ciclo cujo fechamento ainda está no futuro.
 *
 * Por que o próprio dia já conta como fechado: `computeBillDate` (acima) manda a
 * compra feita NO dia do fechamento pra fatura SEGUINTE. Com `closing_day = 20`,
 * a fatura de referência 2026-09-01 acumula de 20/08 a 19/09 — no dia 20/09 ela
 * está completa, nenhuma compra nova cai nela. Mesma régua nas três superfícies:
 * a RPC do banco, este status exibido e a trava do botão de pagar.
 */
export function effectiveBillStatus(bill: Pick<CreditCardBill, 'status' | 'closing_date'>): string {
  if (bill.status !== 'open') return bill.status;
  if (!bill.closing_date) return bill.status;
  // closing_date e "hoje" são ambos YYYY-MM-DD no fuso do Brasil → compara lexical.
  return todayInSaoPaulo() >= bill.closing_date ? 'closed' : 'open';
}

/**
 * Mensagem de erro de RPC de REGRA DE NEGÓCIO (as de fatura de cartão).
 *
 * Essas funções levantam `RAISE EXCEPTION` com texto já em PT-BR e informativo
 * ("Esta fatura ainda não fechou. O pagamento é liberado a partir de
 * 20/09/2026."). O `getErrorMessage` genérico concatena
 * `message | details | hint | code`, o que faria o usuário ler
 * "...a partir de 20/09/2026. | P0001". Quando o erro é exatamente a exceção
 * levantada pela função (SQLSTATE P0001 = raise_exception), mostramos a
 * mensagem do servidor pura. Qualquer outro erro (rede, RLS, constraint) segue
 * pelo tratamento genérico de sempre.
 */
export function getRpcErrorMessage(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && typeof e === 'object' && e.code === 'P0001' && typeof e.message === 'string' && e.message.trim()) {
    return e.message.trim();
  }
  return getErrorMessage(error);
}

export function useCreditCardBills(accountId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { locale, currency } = useAppLocaleContext();
  const tCard = MESSAGES[locale].app.finance.creditCard;

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

      // Pagar fatura é operação de DUAS pernas e precisa ser atômica:
      //   1) `saida` na conta/caixa que paga (dinheiro saindo de verdade);
      //   2) `entrada` na conta do CARTÃO — é ESTA que devolve o limite
      //      disponível (`cardBillTotals` soma saídas e subtrai entradas).
      // Antes eram dois `await` soltos contra o PostgREST (insert do lançamento
      // + update da fatura). Se o segundo falhasse (rede, aba fechada, RLS), o
      // dinheiro já tinha saído do banco e a fatura continuava em aberto — o
      // usuário pagava de novo e saía em dobro. A RPC faz `SELECT ... FOR UPDATE`
      // na fatura e grava as duas pernas + o status numa transação só.
      //
      // O client não calcula mais nada: `company_id` sai da própria fatura e o
      // servidor decide `paid` x `partial` (e valida fatura fechada / valor
      // maior que o restante, devolvendo mensagem já em PT-BR).
      const { data, error } = await supabase.rpc('pay_credit_card_bill' as any, {
        p_bill_id: bill.id,
        p_payment_account_id: paymentAccountId,
        p_payment_date: paymentDate,
        p_amount: amountToPay,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data as unknown as PayBillResult;
    },
    onSuccess: (result) => {
      invalidateAll();
      const isFull = result?.status === 'paid';
      const remaining = Math.max(0, Number(result?.bill_total ?? 0) - Number(result?.amount_paid ?? 0));
      toast({
        title: isFull ? tCard.payToastPaidTitle : tCard.payToastPartialTitle,
        description: isFull
          ? tCard.payToastPaidDescription
          : tCard.payToastPartialDescription.replace('{amount}', formatMoney(remaining, currency, locale)),
      });
    },
    onError: (e: Error) => {
      // A RPC levanta EXCEPTION com mensagem já em PT-BR e informativa
      // ("Esta fatura ainda não fechou. O pagamento é liberado a partir de ...").
      // Repassar o texto do servidor, sem trocar por genérico.
      toast({ variant: 'destructive', title: tCard.payToastErrorTitle, description: getRpcErrorMessage(e) });
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
