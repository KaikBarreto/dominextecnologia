import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Gasto operacional pago diretamente pelo cliente.
 *
 * Este registro existe apenas para preservar o histórico na ficha do cliente:
 * ele NÃO é uma `financial_transaction` e, portanto, não movimenta conta, caixa,
 * banco, contas a pagar nem DRE da empresa.
 */
export interface CustomerPaidExpense {
  id: string;
  company_id: string;
  customer_id: string;
  description: string;
  amount: number;
  expense_date: string;
  category: string | null;
  notes: string | null;
  created_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerPaidExpenseInput {
  description: string;
  amount: number;
  expense_date: string;
  category?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerPaidExpenseInput extends CustomerPaidExpenseInput {
  id: string;
}

type CustomerPaidExpenseInsert = Pick<
  CustomerPaidExpense,
  | 'company_id'
  | 'customer_id'
  | 'description'
  | 'amount'
  | 'expense_date'
  | 'category'
  | 'notes'
  | 'created_by'
>;

type CustomerPaidExpensePatch = Partial<Pick<
  CustomerPaidExpense,
  | 'description'
  | 'amount'
  | 'expense_date'
  | 'category'
  | 'notes'
  | 'voided_at'
  | 'voided_by'
  | 'updated_at'
>>;

interface UntypedTableResult<T> {
  data: T | null;
  error: unknown;
}

/** Builder mínimo para manter toda a fronteira Supabase tipada neste hook. */
interface CustomerPaidExpensesBuilder<T> extends PromiseLike<UntypedTableResult<T>> {
  select(columns?: string): CustomerPaidExpensesBuilder<CustomerPaidExpense[]>;
  insert(values: CustomerPaidExpenseInsert): CustomerPaidExpensesBuilder<CustomerPaidExpense[]>;
  update(values: CustomerPaidExpensePatch): CustomerPaidExpensesBuilder<CustomerPaidExpense[]>;
  eq(column: string, value: string): CustomerPaidExpensesBuilder<T>;
  is(column: string, value: null): CustomerPaidExpensesBuilder<T>;
  order(column: string, options: { ascending: boolean }): CustomerPaidExpensesBuilder<T>;
  single(): CustomerPaidExpensesBuilder<CustomerPaidExpense>;
}

function customerPaidExpensesTable(): CustomerPaidExpensesBuilder<CustomerPaidExpense[]> {
  return supabase.from('customer_paid_expenses' as never) as unknown as CustomerPaidExpensesBuilder<CustomerPaidExpense[]>;
}

const queryKeyFor = (customerId: string | undefined) => [
  'customer-paid-expenses',
  customerId ?? 'unresolved',
] as const;

function normalizeExpenseInput(input: CustomerPaidExpenseInput): CustomerPaidExpenseInput {
  const description = input.description.trim();
  if (!description) throw new Error('Informe a descrição do gasto.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)) {
    throw new Error('Informe uma data válida para o gasto.');
  }

  return {
    description,
    amount: Number(input.amount.toFixed(2)),
    expense_date: input.expense_date,
    category: input.category?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

/**
 * Fronteira Supabase dos gastos pagos pelo cliente.
 *
 * O cast fica restrito ao builder mínimo acima; o restante do app consome os
 * tipos locais estritos deste arquivo.
 */
export function useCustomerPaidExpenses(customerId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = queryKeyFor(customerId);

  const expensesQuery = useQuery({
    queryKey,
    enabled: !!customerId,
    queryFn: async () => {
      if (!customerId) return [];

      const { data, error } = await customerPaidExpensesTable()
        .select('*')
        .eq('customer_id', customerId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as CustomerPaidExpense[];
    },
  });

  const createExpense = useMutation({
    mutationFn: async (input: CustomerPaidExpenseInput) => {
      if (!customerId) throw new Error('Cliente não identificado. Atualize a página e tente novamente.');

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const normalized = normalizeExpenseInput(input);
      const payload = {
        company_id,
        customer_id: customerId,
        description: normalized.description,
        amount: normalized.amount,
        expense_date: normalized.expense_date,
        category: normalized.category ?? null,
        notes: normalized.notes ?? null,
        created_by: user?.id ?? null,
      };

      const { data, error } = await customerPaidExpensesTable()
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data as unknown as CustomerPaidExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Gasto pago pelo cliente registrado!' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível registrar o gasto',
        description: getErrorMessage(error),
      });
    },
  });

  const updateExpense = useMutation({
    mutationFn: async ({ id, ...input }: UpdateCustomerPaidExpenseInput) => {
      if (!customerId) throw new Error('Cliente não identificado. Atualize a página e tente novamente.');

      const normalized = normalizeExpenseInput(input);
      const payload = {
        description: normalized.description,
        amount: normalized.amount,
        expense_date: normalized.expense_date,
        category: normalized.category ?? null,
        notes: normalized.notes ?? null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await customerPaidExpensesTable()
        .update(payload)
        .eq('id', id)
        .eq('customer_id', customerId)
        .is('voided_at', null)
        .select('*')
        .single();

      if (error) throw error;
      return data as unknown as CustomerPaidExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Gasto atualizado!' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível atualizar o gasto',
        description: getErrorMessage(error),
      });
    },
  });

  /**
   * Cancelamento lógico: a linha continua disponível para histórico e auditoria.
   * Não existe mutation de DELETE neste hook de propósito.
   */
  const voidExpense = useMutation({
    mutationFn: async (id: string) => {
      if (!customerId) throw new Error('Cliente não identificado. Atualize a página e tente novamente.');

      const now = new Date().toISOString();
      const { data, error } = await customerPaidExpensesTable()
        .update({
          voided_at: now,
          voided_by: user?.id ?? null,
          updated_at: now,
        })
        .eq('id', id)
        .eq('customer_id', customerId)
        .is('voided_at', null)
        .select('*')
        .single();

      if (error) throw error;
      return data as unknown as CustomerPaidExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Gasto cancelado e mantido no histórico.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível cancelar o gasto',
        description: getErrorMessage(error),
      });
    },
  });

  const expenses = expensesQuery.data ?? [];
  const activeExpenses = expenses.filter((expense) => !expense.voided_at);

  return {
    expenses,
    activeExpenses,
    isLoading: expensesQuery.isLoading,
    isError: expensesQuery.isError,
    error: expensesQuery.error,
    refetch: expensesQuery.refetch,
    createExpense,
    updateExpense,
    voidExpense,
  };
}
