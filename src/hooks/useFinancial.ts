import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import { getRpcErrorMessage } from '@/hooks/useCreditCardBills';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { buildInstallmentPlan } from '@/lib/finance-installments';
import { todayInBrazil } from '@/lib/today-brazil';
import { PARTIAL_RECEIPT_CATEGORY } from '@/lib/finance-constants';

export interface TransactionCreator {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export type TransactionWithRelations = FinancialTransaction & {
  customer: any;
  account: any;
  employee: any;
  creator: TransactionCreator | null;
};

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
  /**
   * Centro de custo (obra/projeto/setor). SEMPRE opcional. Em parcelamento,
   * TODAS as parcelas herdam o mesmo centro — parcela que nasce sem ele fura
   * o relatório por centro de custo em silêncio.
   */
  cost_center_id?: string | null;
  credit_card_bill_date?: string | null;
}

/**
 * Monta as linhas de um PARCELAMENTO. Puro de propósito (sem Supabase, sem
 * React): é o ponto onde uma parcela pode nascer diferente das irmãs, e isso
 * precisa ser testável.
 *
 * Invariantes que este builder garante:
 * - TODAS as parcelas herdam os mesmos campos da mãe (`...rest`) — inclusive
 *   `cost_center_id`. Parcela sem o centro fura o relatório em silêncio.
 * - Parcela de cartão NUNCA nasce paga (quem fica paga é a FATURA). Em
 *   parcelamento não-cartão, só a 1a pode estar paga (comportamento legado).
 * - `transaction_date` = `due_date` = data da parcela (mês em que o caixa move).
 */
type InstallmentRowDraft = Omit<TransactionInput, 'installment_count'> & {
  created_by?: string;
  company_id: string;
  installment_group_id: string;
  installment_number: number;
  installment_total: number;
};

export function buildInstallmentRows(args: {
  /** Input da transação sem `installment_count`. */
  rest: Omit<TransactionInput, 'installment_count'>;
  plan: Array<{ date: string; amount: number }>;
  groupId: string;
  companyId: string;
  createdBy?: string;
  /** Despesa lançada num cartão: nenhuma parcela nasce paga. */
  isCardInstallment: boolean;
  /** Mês de fatura da parcela, a partir do vencimento dela. */
  billDateFor: (dueDate: string) => string | null | undefined;
}): { rows: InstallmentRowDraft[]; billMonths: string[] } {
  const { rest, plan, groupId, companyId, createdBy, isCardInstallment, billDateFor } = args;
  const n = plan.length;
  const rows: InstallmentRowDraft[] = [];
  const billMonths = new Set<string>();

  for (let i = 0; i < n; i++) {
    const dueDateStr = plan[i].date;
    // Cada parcela pertence à fatura do PRÓPRIO vencimento dela.
    const installmentBillDate = billDateFor(dueDateStr);
    if (installmentBillDate) billMonths.add(installmentBillDate);

    const parcelIsPaid = isCardInstallment ? false : (i === 0 ? rest.is_paid : false);
    rows.push(normalizeOptionalForeignKeys(
      {
        ...rest,
        amount: plan[i].amount,
        description: `${rest.description} (${i + 1}/${n})`,
        transaction_date: dueDateStr,
        due_date: dueDateStr,
        is_paid: parcelIsPaid,
        paid_date: parcelIsPaid ? dueDateStr : undefined,
        credit_card_bill_date: installmentBillDate ?? null,
        created_by: createdBy,
        company_id: companyId,
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: n,
      } as InstallmentRowDraft,
      // `cost_center_id` entra na lista de FKs opcionais: string vazia vinda do
      // form viraria erro de FK. O VALOR vem de `rest`, então todas as parcelas
      // carregam o mesmo centro de custo.
      ['customer_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']
    ));
  }

  return { rows, billMonths: Array.from(billMonths) };
}

/**
 * Campos da MÃE necessários pra montar as linhas filhas da baixa
 * (`markAsPaid`). Precisam vir no `.select(...)` que busca a mãe — campo que
 * não é pedido no select chega `undefined` e a herança vira no-op SILENCIOSO
 * (sem erro, sem log, só o relatório errado depois).
 */
export interface MarkAsPaidParentRow {
  id: string;
  company_id: string;
  description?: string | null;
  due_date?: string | null;
  customer_id?: string | null;
  cost_center_id?: string | null;
}

/** Parte do input da baixa que as filhas copiam. */
export interface MarkAsPaidChildConfig {
  customer_id?: string | null;
  account_id?: string | null;
  payment_method?: string;
  notes?: string;
}

/**
 * Linha filha "Recebimento parcial". Puro de propósito (sem Supabase, sem
 * React): é aqui que a filha pode nascer sem o centro de custo da mãe e furar
 * a quebra por centro em silêncio.
 *
 * Invariantes:
 * - herda `cost_center_id` da mãe; mãe sem centro produz `null` (nunca
 *   `undefined`, nunca `''` — string vazia é erro de FK no banco);
 * - `transaction_date` = data do pagamento (mês em que o caixa moveu);
 * - a filha nasce PAGA (é o dinheiro que entrou agora), a mãe segue em aberto.
 */
export function buildPartialReceiptRow(args: {
  parent: MarkAsPaidParentRow;
  cfg: MarkAsPaidChildConfig & { amountReceived?: number };
  paidDate: string;
  createdBy?: string;
}): Record<string, any> {
  const { parent, cfg, paidDate, createdBy } = args;
  return normalizeOptionalForeignKeys(
    {
      transaction_type: 'entrada',
      amount: cfg.amountReceived,
      description: `Recebimento parcial — ${parent.description || 'transação'}`,
      category: PARTIAL_RECEIPT_CATEGORY,
      customer_id: cfg.customer_id ?? parent.customer_id ?? null,
      account_id: cfg.account_id,
      cost_center_id: parent.cost_center_id ?? null,
      payment_method: cfg.payment_method,
      transaction_date: paidDate,
      due_date: parent.due_date ?? paidDate,
      paid_date: paidDate,
      is_paid: true,
      notes: cfg.notes,
      created_by: createdBy,
      company_id: parent.company_id,
      parent_transaction_id: parent.id,
    } as any,
    ['customer_id', 'account_id', 'cost_center_id']
  );
}

/**
 * Linha filha "Tarifa do recebimento". Puro de propósito.
 *
 * `sourceRow` é a linha que ORIGINOU a tarifa: em recebimento parcial é a
 * própria filha parcial (a tarifa é neta da mãe), em quitação total é a mãe
 * atualizada. Por isso o centro de custo herda de `sourceRow` com fallback na
 * mãe — o par tarifa/recebimento tem que cair no MESMO centro, senão a receita
 * entra numa obra e o custo dela em nenhuma.
 */
export function buildReceiptFeeRow(args: {
  parent: MarkAsPaidParentRow;
  sourceRow: {
    id: string;
    description?: string | null;
    customer_id?: string | null;
    cost_center_id?: string | null;
  };
  cfg: MarkAsPaidChildConfig & { fee_amount?: number };
  paidDate: string;
  companyId: string;
  createdBy?: string;
}): Record<string, any> {
  const { parent, sourceRow, cfg, paidDate, companyId, createdBy } = args;
  return normalizeOptionalForeignKeys(
    {
      transaction_type: 'saida',
      amount: cfg.fee_amount,
      description: `Tarifa do recebimento — ${sourceRow.description || parent.description || 'transação'}`,
      category: 'Tarifas e Taxas',
      customer_id: cfg.customer_id ?? sourceRow.customer_id ?? parent.customer_id ?? null,
      account_id: cfg.account_id,
      cost_center_id: sourceRow.cost_center_id ?? parent.cost_center_id ?? null,
      payment_method: cfg.payment_method,
      transaction_date: paidDate,
      paid_date: paidDate,
      is_paid: true,
      notes: cfg.notes,
      created_by: createdBy,
      company_id: companyId,
      parent_transaction_id: sourceRow.id,
    } as any,
    ['customer_id', 'account_id', 'cost_center_id']
  );
}

/**
 * Referência estável pra lista vazia. `?? []` criaria um array novo a cada
 * render enquanto a query não resolve, invalidando o `useMemo` que deriva as
 * raízes sem necessidade.
 */
const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];

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
          // 🚨 NÃO volte a filtrar `parent_transaction_id` AQUI.
          // A query traz TUDO (mães e filhas). Esconder a filha é regra de
          // APRESENTAÇÃO da listagem, não de busca: quando o corte era feito na
          // query, o DRE — que bebe da mesma fonte — parava de somar a "Tarifa
          // do recebimento" e o lucro aparecia inflado em toda venda com tarifa
          // de maquininha. Quem precisa só das raízes usa `transactions`
          // (filtrado logo abaixo); quem precisa do resultado contábil completo
          // usa `transactionsWithChildren`.
          .order('transaction_date', { ascending: false })
      );

      // O FK de created_by aponta pra auth.users, então não dá pra embutir
      // profiles no .select() do PostgREST. Resolvemos o criador em lote:
      // uma query em profiles por user_id (regra-lei: join de perfil é user_id).
      const creatorIds = [
        ...new Set(
          (data || [])
            .map((t) => t.created_by)
            .filter((v): v is string => !!v),
        ),
      ];

      const creatorsMap = new Map<string, TransactionCreator>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, avatar_url')
          .in('user_id', creatorIds);
        (profiles || []).forEach((p) => {
          creatorsMap.set(p.user_id, {
            full_name: p.full_name ?? null,
            email: p.email ?? null,
            avatar_url: p.avatar_url ?? null,
          });
        });
      }

      return (data || []).map((t) => ({
        ...t,
        creator: t.created_by ? creatorsMap.get(t.created_by) ?? null : null,
      })) as TransactionWithRelations[];
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['financial-summary'],
    queryFn: async () => {
      const data = await fetchAllPaginated<{ transaction_type: string; amount: number; is_paid: boolean; transfer_pair_id: string | null }>(
        () => supabase
          .from('financial_transactions')
          // `transfer_pair_id` é obrigatório no select: sem ele o filtro de
          // movimento interno abaixo vira no-op silencioso.
          .select('transaction_type, amount, is_paid, transfer_pair_id')
      );
      
      const summary = {
        totalEntradas: 0,
        totalSaidas: 0,
        saldo: 0,
        aPagar: 0,
        aReceber: 0,
      };

      data?.forEach((t) => {
        // Movimento interno (transferência entre contas e pagamento de fatura de
        // cartão) não é receita nem despesa: é balanço, não resultado. As duas
        // pernas do par carregam o mesmo `transfer_pair_id`; somá-las inflaria
        // Entradas e Saídas com dinheiro que só trocou de bolso. Mesmo critério
        // ESTRUTURAL usado no DRE — nunca por nome de categoria (texto livre).
        if (t.transfer_pair_id) return;
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
    mutationFn: async (input: TransactionInput): Promise<{ ids: string[]; primary: FinancialTransaction | null }> => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { installment_count, ...rest } = input;
      const n = installment_count && installment_count > 1 ? installment_count : 0;

      if (n > 1) {
        const groupId = crypto.randomUUID();
        // Plano de parcelamento (datas com clamp de fim de mês + rateio com
        // sobra na última) vem do motor puro compartilhado com o preview do
        // TransactionFormDialog e com a aprovação de orçamento — as três
        // superfícies precisam concordar. Ver src/lib/finance-installments.ts.
        const plan = buildInstallmentPlan(rest.transaction_date, rest.amount, n);

        // For card accounts, compute the bill date per installment from its due date
        const isCardInstallment = !!rest.credit_card_bill_date && rest.transaction_type === 'saida';
        let cardAccount: { id: string; closing_day?: number | null; payment_due_days?: number | null; due_day?: number | null; type: string } | null = null;
        if (isCardInstallment && rest.account_id) {
          const { data } = await supabase
            .from('financial_accounts')
            .select('id, closing_day, payment_due_days, due_day, type')
            .eq('id', rest.account_id)
            .single();
          cardAccount = data?.type === 'cartao' ? data : null;
        }

        const { computeBillDate, computeBillDates } = await import('@/hooks/useCreditCardBills');

        const { rows, billMonths } = buildInstallmentRows({
          rest,
          plan,
          groupId,
          companyId: company_id,
          createdBy: user?.id,
          isCardInstallment,
          billDateFor: (dueDate) =>
            cardAccount ? computeBillDate(cardAccount, dueDate) : rest.credit_card_bill_date ?? undefined,
        });
        const billMonthsToCreate = new Set<string>(billMonths);

        // Insert + retorna as rows criadas pra termos os IDs (em ordem de installment_number).
        const { data: insertedRows, error } = await supabase
          .from('financial_transactions')
          .insert(rows as any)
          .select('id, installment_number');
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

        const orderedIds = ((insertedRows ?? []) as Array<{ id: string; installment_number: number | null }>)
          .slice()
          .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
          .map((r) => r.id);

        return { ids: orderedIds, primary: null };
      }

      const sanitized = normalizeOptionalForeignKeys(
        { ...rest, created_by: user?.id, company_id },
        ['customer_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']
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
          .select('id, closing_day, payment_due_days, due_day, type')
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

      return { ids: [data.id], primary: data as FinancialTransaction };
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
      const sanitized = normalizeOptionalForeignKeys(rest, ['customer_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']);

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
        .select('category, amount, account_id, credit_card_bill_date, transfer_pair_id')
        .eq('id', id)
        .maybeSingle();

      // ── Pagamento de fatura FEITO PELA RPC (tem `transfer_pair_id`) ─────────
      // O pagamento é um par de lançamentos: a saída na conta que pagou e a
      // entrada no cartão (a perna que devolve o limite). Excluir só um lado
      // deixaria o outro órfão e o limite errado. A RPC de estorno recebe
      // QUALQUER uma das duas pernas, apaga as duas e recalcula
      // amount_paid/status/paid_at da fatura numa transação só.
      // `return` aqui é obrigatório: a RPC já apagou as linhas, o delete manual
      // abaixo não pode rodar em cima.
      if (txn?.category === 'Pagamento de Fatura' && txn.transfer_pair_id) {
        const { error: revertErr } = await supabase.rpc('revert_credit_card_bill_payment' as any, {
          p_transaction_id: id,
        });
        if (revertErr) throw revertErr;
        return;
      }

      // ── Compatibilidade: pagamentos ANTIGOS, de antes da RPC ───────────────
      // Existem em produção lançamentos de 'Pagamento de Fatura' sem
      // `transfer_pair_id` (uma perna só, sem a entrada no cartão). O backfill
      // do banco marca esses casos, mas não dá pra contar que já rodou —
      // enquanto houver linha sem par, o caminho legado abaixo continua sendo
      // o único jeito de estornar. É frágil de propósito (adivinha a fatura por
      // período quando não acha por payment_transaction_id); pode sumir quando
      // o backfill estiver confirmado em todos os tenants.
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
      // getRpcErrorMessage: quando o estorno vem da RPC, a mensagem do servidor
      // já é PT-BR informativa — repassar pura, sem o sufixo do código SQL.
      toast({ variant: 'destructive', title: 'Erro ao excluir transação', description: getRpcErrorMessage(error) });
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
    /** Quanto está sendo recebido neste evento. Quando ausente OU igual ao restante (amount - amount_received),
     *  o comportamento é o legado: UPDATE direto na mãe marcando is_paid=true. Zero regressão.
     *  Quando menor que o restante, cria filha 'Recebimento parcial' e atualiza apenas o due_date da mãe. */
    amountReceived?: number;
    /** Novo vencimento do saldo restante (YYYY-MM-DD). Só usado em recebimento parcial. */
    newDueDate?: string;
  }

  const markAsPaid = useMutation({
    mutationFn: async (params: string | MarkAsPaidParams) => {
      const cfg: MarkAsPaidParams = typeof params === 'string' ? { id: params } : params;
      // `todayInBrazil()` e NUNCA `toISOString()`: este `paid_date` é o que
      // define o MÊS da movimentação no regime de Caixa. Baixa feita às 21h30
      // do dia 31 gravava dia 1º do mês seguinte (UTC-3) e jogava a receita
      // pro mês errado.
      const paidDate = cfg.paid_date || todayInBrazil();

      // Buscar a mãe pra calcular se é parcial e usar dados (company_id, due_date, customer_id, amount).
      const { data: parent, error: parentErr } = await supabase
        .from('financial_transactions')
        // `cost_center_id` PRECISA vir aqui: as filhas (recebimento parcial e
        // tarifa) herdam dele. Campo fora do select chega `undefined` e a
        // herança falha em silêncio, sem erro nenhum.
        .select('id, company_id, amount, amount_received, due_date, description, customer_id, transaction_type, cost_center_id')
        .eq('id', cfg.id)
        .single();
      if (parentErr) throw parentErr;

      const totalAmount = Number(parent.amount);
      const alreadyReceived = Number((parent as any).amount_received ?? 0);
      const remaining = Number((totalAmount - alreadyReceived).toFixed(2));
      // Tolerância de 1 centavo pra diferenças de arredondamento (Math vs Postgres numeric).
      const isPartial =
        typeof cfg.amountReceived === 'number' &&
        cfg.amountReceived > 0 &&
        cfg.amountReceived < remaining - 0.005;

      let dataRow: any;

      if (isPartial) {
        // === FLUXO PARCIAL ===
        // 1) Insere filha 'Recebimento parcial' (entrada, is_paid=true).
        const childPayload = buildPartialReceiptRow({
          parent: parent as any,
          cfg,
          paidDate,
          createdBy: user?.id,
        });
        const { data: child, error: childErr } = await supabase
          .from('financial_transactions')
          .insert(childPayload as any)
          .select('*')
          .single();
        if (childErr) throw childErr;

        // 2) Atualiza apenas o due_date da mãe (trigger no banco cuida do amount_received e do is_paid).
        if (cfg.newDueDate) {
          const { error: dueErr } = await supabase
            .from('financial_transactions')
            .update({ due_date: cfg.newDueDate } as any)
            .eq('id', cfg.id);
          if (dueErr) throw dueErr;
        }

        // A "row de retorno" pra encadear a tarifa de máquina é a filha (vincula tarifa ao recebimento).
        dataRow = child;
      } else {
        // === FLUXO LEGADO (quitação total) === Zero regressão.
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
        dataRow = data;
      }

      // If a fee was reported, create a "Tarifas e Taxas" expense.
      // Em recebimento parcial: tarifa vincula à FILHA (preserva rastreamento de qual recebimento gerou).
      // Em quitação total: mantém comportamento atual (filha da mãe).
      if (cfg.fee_amount && cfg.fee_amount > 0) {
        const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
        const company_id = await getCurrentUserCompanyId();
        // Em recebimento parcial `dataRow` é a FILHA parcial (que já carrega o
        // centro de custo da mãe); em quitação total é a própria mãe. O fallback
        // em `parent` cobre a linha antiga que ainda não tinha centro.
        const feePayload = buildReceiptFeeRow({
          parent: parent as any,
          sourceRow: dataRow as any,
          cfg,
          paidDate,
          companyId: company_id,
          createdBy: user?.id,
        });
        const { error: feeErr } = await supabase.from('financial_transactions').insert(feePayload as any);
        if (feeErr) throw feeErr;
      }

      return dataRow;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Recebimento confirmado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description: getErrorMessage(error) });
    },
  });

  // Tudo o que a query trouxe: mães E filhas (tarifa do recebimento,
  // recebimento parcial, CMV legado). É o conjunto que o DRE precisa pra fechar
  // o resultado — a tarifa da maquininha é despesa de verdade e não existe em
  // nenhuma outra linha.
  const transactionsWithChildren = transactionsQuery.data ?? EMPTY_TRANSACTIONS;

  // Padrão das LISTAGENS: só as raízes. A filha aparece dentro do detalhe da
  // mãe (diálogo de transações relacionadas), nunca como linha solta. Este é o
  // corte de APRESENTAÇÃO que antes vivia — erradamente — dentro da query.
  // Mantém `transactions` com exatamente a mesma semântica de sempre, pra
  // nenhuma tela que já consome o hook mudar de comportamento.
  const rootTransactions = useMemo(
    () => transactionsWithChildren.filter((t) => !(t as any).parent_transaction_id),
    [transactionsWithChildren]
  );

  return {
    transactions: rootTransactions,
    /**
     * Mães + filhas. Use SÓ onde o número precisa fechar contabilmente (DRE).
     * Em listagem isso duplica informação: a filha já é mostrada no detalhe da
     * mãe. Em soma de "a receber", pior — a filha de recebimento parcial é
     * evento de caixa da mãe, que segue no banco com o valor cheio.
     */
    transactionsWithChildren,
    summary: summaryQuery.data ?? { totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 },
    isLoading: transactionsQuery.isLoading || summaryQuery.isLoading,
    error: transactionsQuery.error || summaryQuery.error,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    markAsPaid,
  };
}
