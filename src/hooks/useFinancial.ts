import { osBillingError } from '@/lib/osCommercial';
import { OS_COMMERCIAL_KEY } from '@/hooks/useOsCommercial';
import { assertRowsAffected, NoRowsAffectedError } from '@/lib/supabaseMutation';
import { useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invalidatePdvReportCaches, usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import { getRpcErrorMessage } from '@/hooks/useCreditCardBills';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { summarizeFinancialTransactions, type FinancialSummaryTransaction } from '@/lib/financial-summary';
import { buildInstallmentPlan } from '@/lib/finance-installments';
import { todayInTz } from '@/lib/timezone';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { PARTIAL_RECEIPT_CATEGORY } from '@/lib/finance-constants';
import { SYSTEM_CATEGORY_ROLES } from '@/lib/finance-system-categories';
import { resolveSystemCategoryNameFresh } from '@/hooks/useFinancialCategories';
import { OS_BILLING_FLAGS_KEY } from '@/hooks/useOsBillingFlags';
import { OS_BILLING_STATE_KEY } from '@/hooks/useOsBillingState';
import { OS_REVENUE_SUMMARY_KEY } from '@/hooks/useOsRevenueSummary';

/**
 * Retornos das RPCs de lote, DERIVADOS dos types gerados do banco — nunca
 * copiados à mão. `Returns` é array (as duas são `RETURNS TABLE`), então o que
 * interessa é `[number]`, a linha única.
 *
 * `already_applied` / `already_undone` valem `true` quando o mesmo lote foi
 * reenviado: nada foi reaplicado e NÃO é erro (contrato de retry idempotente).
 */
export type PayBatchResult =
  Database['public']['Functions']['pay_transactions_batch']['Returns'][number];
export type UndoGroupResult =
  Database['public']['Functions']['undo_payment_group']['Returns'][number];

export interface TransactionCreator {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export type TransactionWithRelations = FinancialTransaction & {
  customer: any;
  supplier: any;
  account: any;
  employee: any;
  creator: TransactionCreator | null;
  /** Quem marcou como pago/recebido. `null` em baixa antiga ou feita pelo sistema. */
  settledBy: TransactionCreator | null;
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
  /** Fornecedor vinculado ao lançamento. SEMPRE opcional, igual customer_id — nem toda receita/despesa tem um. */
  supplier_id?: string;
  service_order_id?: string;
  contract_id?: string;
  notes?: string;
  payment_method?: string;
  receipt_url?: string;
  installment_count?: number;
  installment_group_id?: string;
  recurrence_base_amount?: number;
  installment_number?: number;
  installment_total?: number;
  account_id?: string | null;
  /**
   * Centro de custo (obra/projeto/setor). SEMPRE opcional. Em parcelamento,
   * TODAS as parcelas herdam o mesmo centro — parcela que nasce sem ele fura
   * o relatório por centro de custo em silêncio.
   */
  cost_center_id?: string | null;
  credit_card_bill_date?: string | null;
  /**
   * Plano EXPLÍCITO de parcelas (data + valor de cada uma), vindo de fora —
   * hoje só as duplicatas do bloco `<cobr>` de uma NF-e recebida (ver
   * `LancarNotaDespesaDialog.tsx`). Quando presente e do MESMO tamanho de
   * `installment_count`, SUBSTITUI o rateio automático de
   * `buildInstallmentPlan`: cada parcela nasce com a data e o valor que a
   * fonte informou, sem redistribuir o total (a soma pode divergir do total
   * da nota por centavos — desconto, frete). Ausente = comportamento de
   * sempre (rateio mensal com clamp de fim de mês).
   */
  installmentPlan?: Array<{ date: string; amount: number }>;
}

export type FinancialSeriesScope = 'single' | 'future' | 'all_pending';

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
 * - `transaction_date` = `due_date` = data da parcela (semântica vigente das
 *   telas de movimentações e dos filtros mensais).
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

    // "Já foi pago/recebido" + parcelamento: só a PRIMEIRA parcela nasce
    // quitada. As outras são o que ainda falta entrar/sair — marcar todas
    // daria a série inteira como liquidada no dia do lançamento.
    const parcelIsPaid = isCardInstallment ? false : (i === 0 ? rest.is_paid : false);
    // A data de CAIXA é a que o usuário informou, não o vencimento da parcela.
    // Antes a parcela 1 recebia o próprio vencimento como `paid_date` e a
    // "Data do recebimento" digitada era jogada fora em silêncio — e é ela que
    // decide o MÊS no regime de Caixa da DRE, então o dinheiro caía no mês
    // errado. Fallback no vencimento pra quem não informou data nenhuma.
    const parcelPaidDate = parcelIsPaid ? (rest.paid_date || dueDateStr) : undefined;
    rows.push(normalizeOptionalForeignKeys(
      {
        ...rest,
        amount: plan[i].amount,
        description: `${rest.description} (${i + 1}/${n})`,
        transaction_date: dueDateStr,
        due_date: dueDateStr,
        is_paid: parcelIsPaid,
        paid_date: parcelPaidDate,
        credit_card_bill_date: installmentBillDate ?? null,
        created_by: createdBy,
        company_id: companyId,
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: n,
      } as InstallmentRowDraft,
      // `cost_center_id` entra na lista de FKs opcionais: string vazia vinda do
      // form viraria erro de FK. O VALOR vem de `rest`, então todas as parcelas
      // carregam o mesmo centro de custo. `supplier_id` segue a mesma regra do
      // `customer_id`: todas as parcelas herdam o mesmo vínculo da mãe.
      ['customer_id', 'supplier_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']
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
 *
 * `feeCategory` é o NOME ATUAL da categoria do papel "tarifa de recebimento",
 * resolvido por quem chama (`resolveSystemCategoryNameFresh`). Nunca chumbe o
 * literal aqui: a empresa pode ter renomeado a categoria, e o lançamento
 * precisa cair no nome que ela usa HOJE. O default existe só pra chamada
 * legada/teste e repete o nome de semente.
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
  /** Nome atual da categoria de tarifa desta empresa. */
  feeCategory?: string;
}): Record<string, any> {
  const { parent, sourceRow, cfg, paidDate, companyId, createdBy } = args;
  const feeCategory = args.feeCategory?.trim() || SYSTEM_CATEGORY_ROLES.receipt_fee.seedName;
  return normalizeOptionalForeignKeys(
    {
      transaction_type: 'saida',
      amount: cfg.fee_amount,
      description: `Tarifa do recebimento — ${sourceRow.description || parent.description || 'transação'}`,
      category: feeCategory,
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

interface UseFinancialOptions {
  /**
   * Carrega lista e resumo completos. Telas que precisam somente das mutations
   * podem desligar as duas consultas paginadas para nao disputar o carregamento
   * critico com os dados da propria tela.
   */
  loadData?: boolean;
}

export function useFinancial({ loadData = true }: UseFinancialOptions = {}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const scope = usePdvAuthorizedQueryScope();
  const readIdentity = JSON.stringify([scope.key, loadData]);
  const currentRead = useRef(readIdentity);
  currentRead.current = readIdentity;
  const canRead = loadData && scope.ready;
  const queryClient = useQueryClient();
  const osReceiptRequest = useRef<{ signature: string; args: Database['public']['Functions']['bill_os_receive_payment']['Args'] } | null>(null);
  // Fuso DA EMPRESA (company_settings.timezone). É ele que define o "hoje" das
  // datas financeiras, nunca o fuso do aparelho nem Brasília chumbado.
  const { timezone } = useAppLocaleContext();

  const invalidateAll = () => {
    // A listagem é a fonte canônica dos relatórios. Devolvemos a Promise dela
    // para que `mutateAsync` só conclua depois do refetch ativo; assim o modal
    // não fecha liberando uma exportação com o snapshot anterior à baixa.
    const transactionsRefetch = queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['portal-payments'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['contract-transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['nfse-auto-readiness'] });
    void queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    // Uma transação vinculada a OS muda os selos da lista/quadro/agenda e o
    // estado do diálogo de faturamento. Invalidamos por prefixo porque edição,
    // exclusão e operações em lote podem afetar tanto o vínculo antigo quanto
    // o novo, e reconstruir esses Maps otimisticamente seria incompleto.
    void queryClient.invalidateQueries({ queryKey: [OS_REVENUE_SUMMARY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [OS_BILLING_STATE_KEY] });
    void queryClient.invalidateQueries({ queryKey: [OS_BILLING_FLAGS_KEY] });
    void queryClient.invalidateQueries({ queryKey: [OS_COMMERCIAL_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['receivable-payments'] });
    // O Caixa inclui lançamentos financeiros avulsos no turno e o saldo do
    // cofre. Qualquer mutation financeira precisa deixá-los stale também — ao
    // voltar de outra tela, o operador não pode ver o fechamento antigo.
    void queryClient.invalidateQueries({ queryKey: ['pdv-cash-session-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['pdv-cofre-balance'] });
    void queryClient.invalidateQueries({ queryKey: ['pdv-cash-sessions-v2'] });
    void invalidatePdvReportCaches(queryClient);
    return transactionsRefetch;
  };

  const transactionsQuery = useQuery({
    queryKey: ['financial-transactions', ...scope.key, loadData],
    enabled: canRead,
    queryFn: async ({ signal }) => {
      if (!canRead) throw new Error('Aguarde a confirmação do acesso ao financeiro.');
      const data = await fetchAllPaginated<FinancialTransaction & { customer: any; supplier: any; account: any; employee: any }>(
        () => supabase
          .from('financial_transactions')
          // 🚨 O embed de `employees` só pode pedir colunas não sensíveis
          // (ver EMPLOYEE_PUBLIC_COLUMNS em useEmployees). Uma coluna de RH
          // aqui (ex.: salary) derruba a LISTA INTEIRA do financeiro para todo
          // mundo depois da migration 20261122090000. O salário da folha vem
          // de useEmployeeHrDetails, só para RH.
          .select(`
            *,
            customer:customers(id, name, document),
            supplier:suppliers(id, name, cpf_cnpj),
            account:financial_accounts(id, name, type, color),
            employee:employees(id, name, photo_url)
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

      if (signal.aborted || currentRead.current !== readIdentity) throw new Error('Consulta encerrada.');

      // O FK de created_by aponta pra auth.users, então não dá pra embutir
      // profiles no .select() do PostgREST. Resolvemos o criador em lote:
      // uma query em profiles por user_id (regra-lei: join de perfil é user_id).
      const creatorIds = [
        ...new Set(
          (data || [])
            // Inclui quem deu baixa: mesma consulta em lote, sem ida extra ao banco.
            .flatMap((t) => [t.created_by, (t as { paid_marked_by?: string | null }).paid_marked_by])
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

      if (signal.aborted || currentRead.current !== readIdentity) throw new Error('Consulta encerrada.');

      return (data || []).map((t) => ({
        ...t,
        creator: t.created_by ? creatorsMap.get(t.created_by) ?? null : null,
        settledBy: (t as { paid_marked_by?: string | null }).paid_marked_by
          ? creatorsMap.get((t as { paid_marked_by?: string | null }).paid_marked_by as string) ?? null
          : null,
      })) as TransactionWithRelations[];
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['financial-summary', ...scope.key, loadData],
    enabled: canRead,
    queryFn: async ({ signal }) => {
      if (!canRead) throw new Error('Aguarde a confirmação do acesso ao financeiro.');
      const data = await fetchAllPaginated<FinancialSummaryTransaction>(
        () => supabase
          .from('financial_transactions')
          // `transfer_pair_id` é obrigatório no select: sem ele o filtro de
          // movimento interno abaixo vira no-op silencioso.
          .select('transaction_type, amount, is_paid, transfer_pair_id, pdv_financial_role, amount_received, parent_transaction_id, category, cancelled_at')
      );
      if (signal.aborted || currentRead.current !== readIdentity) throw new Error('Consulta encerrada.');
      
      return summarizeFinancialTransactions(data ?? []);
    },
  });

  const createTransaction = useMutation({
    mutationFn: async (input: TransactionInput): Promise<{ ids: string[]; primary: FinancialTransaction | null }> => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { installment_count, installmentPlan, ...rest } = input;
      const n = installment_count && installment_count > 1 ? installment_count : 0;

      if (n > 1) {
        const groupId = crypto.randomUUID();
        // Plano de parcelamento: por padrão vem do motor puro compartilhado
        // com o preview do TransactionFormDialog e com a aprovação de
        // orçamento (datas com clamp de fim de mês + rateio com sobra na
        // última) — ver src/lib/finance-installments.ts. Fluxos que distinguem
        // a data do fato da data do vencimento (como a oportunidade ganha do
        // CRM) iniciam as parcelas pelo vencimento. Os fluxos legados, sem
        // `due_date`, continuam partindo do lançamento.
        //
        // `installmentPlan` (quando presente e do mesmo tamanho de `n`) pula
        // esse rateio: é a nota fiscal dizendo a data e o valor REAIS de cada
        // parcela (duplicatas do XML), e redistribuir isso destruiria a
        // informação que o fornecedor combinou.
        const plan = installmentPlan && installmentPlan.length === n
          ? installmentPlan.map((p, i) => ({ number: i + 1, date: p.date, amount: p.amount }))
          : buildInstallmentPlan(rest.due_date || rest.transaction_date, rest.amount, n);

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
        ['customer_id', 'supplier_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']
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
    onSuccess: async () => {
      await invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
      toast({ title: 'Transação criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar transação', description: getErrorMessage(error) });
    },
  });

  /**
   * CRIAÇÃO EM LOTE de uma SÉRIE DE REPETIÇÃO (ex.: as 48 mensalidades de um
   * contrato). Um `insert` só com N linhas, no lugar do laço que chamava
   * `createTransaction` uma vez por parcela — eram 48 idas ao servidor, 48
   * toasts e um estado meio-gravado se a 30a falhasse. Agora é atômico: ou
   * nascem as 48, ou nenhuma.
   *
   * NÃO faz parcelamento (nada é dividido) e NÃO trata cartão de crédito:
   * série de repetição é receita/despesa simples em conta. Por isso o input
   * exclui `installment_count` e `credit_card_bill_date` — quem precisa desses
   * usa `createTransaction`.
   *
   * Silencioso de propósito (sem toast): quem chama sabe o contexto e escreve
   * a mensagem no idioma do usuário.
   */
  const createTransactionsBatch = useMutation({
    mutationFn: async (
      rows: Array<Omit<TransactionInput, 'installment_count' | 'credit_card_bill_date'>>
    ): Promise<string[]> => {
      if (rows.length === 0) return [];
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      // IDs definidos no cliente preservam a correspondência posicional entre
      // ocorrência e lançamento. Isso é essencial quando o chamador cria uma
      // cobrança por vencimento; a ordem de um `RETURNING` SQL não é contrato.
      const payload = rows.map((row) =>
        normalizeOptionalForeignKeys(
          { ...row, id: crypto.randomUUID(), created_by: user?.id, company_id } as any,
          ['customer_id', 'supplier_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']
        )
      );

      const { data, error } = await supabase
        .from('financial_transactions')
        .insert(payload as any)
        .select('id');
      if (error) throw error;
      if ((data ?? []).length !== payload.length) {
        throw new Error('Não foi possível confirmar todos os lançamentos recorrentes. Atualize a lista e tente novamente.');
      }
      return payload.map((row) => row.id as string);
    },
    onSuccess: async () => {
      await invalidateAll();
    },
  });

  /**
   * EDIÇÃO EM LOTE dos lançamentos selecionados. Um `update` só com `.in(id)`.
   *
   * Só campos "planilha" (valor, conta, categoria): mexer em `is_paid` /
   * `paid_date` em massa recarimbaria o mês em que o caixa moveu, e isso tem
   * que continuar passando pela baixa individual.
   *
   * Campo ausente em `changes` = não altera (não vira `null`).
   * O `.eq('company_id')` é cinto e suspensório: a RLS já isola, isto só evita
   * que uma lista montada errada no client toque em linha de outra empresa.
   */
  const updateTransactionsBatch = useMutation({
    mutationFn: async (params: {
      ids: string[];
      changes: { amount?: number; account_id?: string | null; category?: string | null };
    }) => {
      const { ids, changes } = params;
      if (ids.length === 0) return 0;

      const patch: Record<string, any> = {};
      if (typeof changes.amount === 'number' && !Number.isNaN(changes.amount)) patch.amount = changes.amount;
      if (changes.account_id !== undefined) patch.account_id = changes.account_id || null;
      if (changes.category !== undefined) patch.category = changes.category || null;
      if (Object.keys(patch).length === 0) return 0;

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      // RLS barrando (sem permissão, lançamento do PDV) não dá erro, só altera
      // menos linhas: conferir contra o tamanho da seleção.
      return assertRowsAffected(
        await supabase
          .from('financial_transactions')
          .update(patch as any, { count: 'exact' })
          .eq('company_id', company_id)
          .in('id', ids),
        'update',
        undefined,
        new Set(ids).size,
      );
    },
    // onSettled: num lote parcialmente barrado, parte mudou; a lista precisa
    // refletir isso mesmo com o erro.
    onSettled: async () => {
      await invalidateAll();
    },
  });

  /**
   * EXCLUSÃO EM MASSA dos lançamentos selecionados.
   *
   * Repete, em lote, as MESMAS cascatas do `deleteTransaction` individual:
   *   1. pagamento de fatura de cartão (par de lançamentos) tem que ir pela RPC
   *      de estorno, uma por uma — apagar cru deixa a perna irmã órfã e o
   *      limite do cartão errado;
   *   2. filhas (recebimento parcial, tarifa do recebimento) saem junto;
   *   3. orçamento que apontava pro lançamento volta pra 'enviado'.
   * Só depois disso as linhas são apagadas — num `delete` só.
   */
  const deleteTransactionsBatch = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;

      // 1. Pagamento de fatura: estorno via RPC, individualmente. Raro nesta
      //    superfície (parcela de contrato nunca é isso), mas o lote não pode
      //    ser um caminho que corrompe o cartão em silêncio.
      const { data: rows, error: fetchErr } = await supabase
        .from('financial_transactions')
        .select('id, category, transfer_pair_id')
        .in('id', ids);
      if (fetchErr) throw fetchErr;

      const fetched = (rows ?? []) as Array<{ id: string; category: string | null; transfer_pair_id: string | null }>;

      // Pagamento de fatura ANTIGO (uma perna só, de antes da RPC) precisa do
      // caminho legado que recalcula `amount_paid` da fatura à mão. Ele não
      // cabe num lote, e apagar cru deixaria a fatura com saldo errado — então
      // o lote se recusa em vez de corromper em silêncio. Não acontece na lista
      // de parcelas de contrato (é sempre receita), é guarda pra outros usos.
      const legacyBillPayment = fetched.find(
        (r) => r.category === 'Pagamento de Fatura' && !r.transfer_pair_id
      );
      if (legacyBillPayment) {
        throw new Error(
          'Há um pagamento de fatura antigo na seleção. Exclua esse lançamento individualmente.'
        );
      }

      const billPaymentIds = fetched
        .filter((r) => r.category === 'Pagamento de Fatura' && r.transfer_pair_id)
        .map((r) => r.id);

      for (const billId of billPaymentIds) {
        const { error: revertErr } = await supabase.rpc('revert_credit_card_bill_payment' as any, {
          p_transaction_id: billId,
        });
        if (revertErr) throw revertErr;
      }

      const remaining = [...new Set(ids.filter((id) => !billPaymentIds.includes(id)))];
      if (remaining.length === 0) return ids.length;

      // 2. Filhas (recebimento parcial, tarifa): a FK é ON DELETE SET NULL,
      //    então elas não caem sozinhas. Guardamos id e mãe ANTES, porque
      //    depois do delete o vínculo vira NULL e não dá mais para achá-las.
      const { data: childRows, error: childFetchErr } = await supabase
        .from('financial_transactions')
        .select('id, parent_transaction_id')
        .in('parent_transaction_id', remaining);
      if (childFetchErr) throw childFetchErr;
      const children = (childRows ?? []) as Array<{ id: string; parent_transaction_id: string | null }>;

      // 3. As mães primeiro, conferindo. RLS (sem permissão, lançamento do PDV)
      //    não dá erro, só apaga menos linhas. O orçamento vinculado é destravado
      //    pelo gatilho reset_quote_financial_link_on_transaction_delete no
      //    próprio delete, só para as linhas que de fato saíram.
      const { error, count } = await supabase
        .from('financial_transactions')
        .delete({ count: 'exact' })
        .in('id', remaining);
      if (error) throw error;
      const deletedCount = typeof count === 'number' ? count : 0;

      // Lote parcial: descobrir quais mães continuam lá, para só apagar as
      // filhas das que saíram (as filhas da sobrevivente ficam com ela).
      let survivors = new Set<string>();
      if (deletedCount < remaining.length) {
        if (deletedCount > 0) {
          const { data: left, error: leftErr } = await supabase
            .from('financial_transactions')
            .select('id')
            .in('id', remaining);
          if (leftErr) throw leftErr;
          survivors = new Set(((left ?? []) as Array<{ id: string }>).map((row) => row.id));
        } else {
          survivors = new Set(remaining);
        }
      }

      const orphanIds = children
        .filter((child) => child.parent_transaction_id && !survivors.has(child.parent_transaction_id))
        .map((child) => child.id);
      if (orphanIds.length > 0) {
        const { error: childErr } = await supabase
          .from('financial_transactions')
          .delete()
          .in('id', orphanIds);
        if (childErr) throw childErr;
      }

      assertRowsAffected({ error: null, count }, 'delete', undefined, remaining.length);

      return ids.length;
    },
    // onSettled: num lote parcialmente barrado, parte saiu (e os estornos de
    // fatura já rodaram); a lista precisa refletir isso mesmo com o erro.
    onSettled: async () => {
      await invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...input }: TransactionInput & { id: string }) => {
      const { installment_count, ...rest } = input;
      const sanitized = normalizeOptionalForeignKeys(rest, ['customer_id', 'supplier_id', 'service_order_id', 'contract_id', 'account_id', 'cost_center_id']);

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
    onSuccess: async () => {
      await invalidateAll();
      toast({ title: 'Transação atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description: getErrorMessage(error) });
    },
  });

  const updateInstallmentGroup = useMutation({
    mutationFn: async ({ id, scope, values }: { id: string; scope: FinancialSeriesScope; values: TransactionInput }) => {
      const { data, error } = await (supabase as any).rpc('update_financial_installment_group', {
        p_id: id,
        p_scope: scope,
        p_values: values,
      });
      if (error) throw error;
      return data as { updated: number; group_id: string };
    },
    onSuccess: async () => {
      await invalidateAll();
      toast({ title: 'Parcelas atualizadas com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar parcelas', description: getRpcErrorMessage(error) });
    },
  });

  const deleteInstallmentGroup = useMutation({
    mutationFn: async ({ id, scope }: { id: string; scope: FinancialSeriesScope }) => {
      const { data, error } = await (supabase as any).rpc('delete_financial_installment_group', {
        p_id: id,
        p_scope: scope,
      });
      if (error) throw error;
      return data as { deleted: number; skipped: number; group_id: string };
    },
    onSuccess: async () => {
      await invalidateAll();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir parcelas', description: getRpcErrorMessage(error) });
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
      //
      // Ordem importa: só LEMOS a fatura aqui. O ajuste roda depois que o
      // lançamento foi de fato apagado, senão um delete barrado pela permissão
      // deixaria a fatura alterada com o pagamento ainda lá.
      let billAdjustment: { id: string; amountPaid: number; clearPaymentLink: boolean } | null = null;
      if (txn?.category === 'Pagamento de Fatura' && txn.account_id) {
        const { data: bill } = await supabase
          .from('credit_card_bills')
          .select('id, amount_paid, status, payment_transaction_id')
          .eq('payment_transaction_id', id)
          .maybeSingle();

        if (bill) {
          billAdjustment = {
            id: bill.id,
            amountPaid: Math.max(0, Number(bill.amount_paid ?? 0) - Number(txn.amount)),
            clearPaymentLink: true,
          };
        } else if (txn.credit_card_bill_date) {
          // Payment may be partial — find bill by account + period and reduce amount_paid
          const { data: billByPeriod } = await supabase
            .from('credit_card_bills')
            .select('id, amount_paid')
            .eq('account_id', txn.account_id)
            .not('status', 'eq', 'open')
            .order('reference_month', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (billByPeriod) {
            billAdjustment = {
              id: billByPeriod.id,
              amountPaid: Math.max(0, Number(billByPeriod.amount_paid ?? 0) - Number(txn.amount)),
              clearPaymentLink: false,
            };
          }
        }
      }

      // Filhas (recebimentos parciais, tarifas): a FK é ON DELETE SET NULL, então
      // elas não caem sozinhas. Guardamos os ids antes, porque depois do delete
      // da mãe o vínculo vira NULL e não dá mais para achá-las.
      const { data: children } = await supabase
        .from('financial_transactions')
        .select('id')
        .eq('parent_transaction_id', id);

      // A mãe primeiro, conferindo: RLS sem permissão (ou lançamento do PDV, que
      // a política não deixa apagar por aqui) não dá erro, só apaga zero linhas.
      // Se nada saiu, paramos antes de mexer em filhas e fatura.
      // O vínculo com orçamento é desfeito pelo gatilho
      // reset_quote_financial_link_on_transaction_delete no próprio delete.
      assertRowsAffected(
        await supabase
          .from('financial_transactions')
          .delete({ count: 'exact' })
          .eq('id', id),
        'delete',
      );

      const childIds = (children ?? []).map((child) => child.id);
      if (childIds.length > 0) {
        const { error: childError } = await supabase.from('financial_transactions').delete().in('id', childIds);
        if (childError) throw childError;
      }

      if (billAdjustment) {
        const { error: billError } = await supabase
          .from('credit_card_bills')
          .update({
            status: billAdjustment.amountPaid > 0 ? 'partial' : 'open',
            amount_paid: billAdjustment.amountPaid,
            ...(billAdjustment.clearPaymentLink ? { payment_transaction_id: null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', billAdjustment.id);
        if (billError) throw billError;
      }
    },
    onSuccess: async () => {
      await invalidateAll();
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
    /** Saldo recebido mostrado ao abrir o modal; recusa baixa com base desatualizada. */
    expectedReceived?: number;
    occurrenceAmount?: number;
    expectedOccurrenceAmount?: number;
    updateFutureOccurrences?: boolean;
  }

  const markAsPaid = useMutation({
    mutationFn: async (params: string | MarkAsPaidParams) => {
      const cfg: MarkAsPaidParams = typeof params === 'string' ? { id: params } : params;
      // `todayInTz(timezone)` e NUNCA `toISOString()`: este `paid_date` é o que
      // define o MÊS da movimentação no regime de Caixa. Baixa feita às 21h30
      // do dia 31 gravava dia 1º do mês seguinte (UTC-3) e jogava a receita
      // pro mês errado. O fuso é o DA EMPRESA: empresa em Cuiabá (UTC-4) dando
      // baixa às 23h15 do dia 30 tem que gravar dia 30, não 31 (que é o dia que
      // já virou em São Paulo).
      const paidDate = cfg.paid_date || todayInTz(timezone);

      if (cfg.occurrenceAmount !== undefined) {
        if (cfg.amountReceived !== undefined) {
          throw new Error('O ajuste de valor e o recebimento parcial devem ser confirmados separadamente.');
        }
        const { data: current, error: currentError } = await supabase
          .from('financial_transactions').select('amount, company_id').eq('id', cfg.id).single();
        if (currentError) throw currentError;
        const feeCategory = cfg.fee_amount > 0
          ? await resolveSystemCategoryNameFresh(queryClient, current.company_id, 'receipt_fee')
          : undefined;
        const { data, error } = await (supabase as any).rpc('settle_financial_occurrence', {
          p_id: cfg.id,
          p_expected_amount: cfg.expectedOccurrenceAmount ?? current.amount,
          p_occurrence_amount: cfg.occurrenceAmount,
          p_account_id: cfg.account_id,
          p_payment_method: cfg.payment_method || undefined,
          p_paid_date: paidDate,
          p_update_future: cfg.updateFutureOccurrences ?? false,
          p_fee_amount: cfg.fee_amount ?? 0,
          p_fee_category: feeCategory,
          p_notes: cfg.notes,
        });
        if (error) throw error;
        return data;
      }

      const receiptSignature = JSON.stringify([scope.key, cfg]);
      const submitOsReceipt = async () => {
        const pending = osReceiptRequest.current!;
        const { data, error } = await supabase.rpc('bill_os_receive_payment', pending.args);
        if (error) {
          // SQLSTATE confirma rollback; timeout preserva os mesmos valores e UUID.
          if (/^[A-Z0-9]{5}$/.test(error.code ?? '')) osReceiptRequest.current = null;
          throw error;
        }
        osReceiptRequest.current = null;
        return data;
      };
      // Reconciliar primeiro: o banco pode ter gravado e a resposta ter se perdido.
      if (osReceiptRequest.current?.signature === receiptSignature) return submitOsReceipt();

      // Buscar a mãe pra calcular se é parcial e usar dados (company_id, due_date, customer_id, amount).
      const { data: parent, error: parentErr } = await supabase
        .from('financial_transactions')
        // `cost_center_id` PRECISA vir aqui: as filhas (recebimento parcial e
        // tarifa) herdam dele. Campo fora do select chega `undefined` e a
        // herança falha em silêncio, sem erro nenhum.
        .select('id, company_id, amount, amount_received, due_date, description, customer_id, transaction_type, cost_center_id, service_order_id')
        .eq('id', cfg.id)
        .single();
      if (parentErr) throw parentErr;

      const totalAmount = Number(parent.amount);
      const alreadyReceived = Number((parent as any).amount_received ?? 0);
      const remaining = Number((totalAmount - alreadyReceived).toFixed(2));
      // Tolerância de 1 centavo pra diferenças de arredondamento (Math vs Postgres numeric).
      const receivingNow = cfg.amountReceived ?? remaining;
      // Uma mãe já fatiada continua tendo todas as baixas no livro de filhas,
      // inclusive a última. Cancelar uma baixa depois preserva as demais.
      if (parent.transaction_type === 'entrada' && parent.service_order_id) {
        const feeCategory = cfg.fee_amount > 0
          ? await resolveSystemCategoryNameFresh(queryClient, parent.company_id, 'receipt_fee') : undefined;
        osReceiptRequest.current = { signature: receiptSignature, args: {
          p_os_id: parent.service_order_id, p_request_id: crypto.randomUUID(), p_transaction_id: parent.id,
          p_expected_received: cfg.expectedReceived ?? alreadyReceived, p_received: receivingNow,
          p_account_id: cfg.account_id, p_method: cfg.payment_method, p_paid_date: paidDate,
          p_due_date: cfg.newDueDate, p_fee: cfg.fee_amount ?? 0, p_fee_category: feeCategory,
          p_notes: cfg.notes, p_from_finance: true,
        } };
        return submitOsReceipt();
      }
      const isPartial = parent.transaction_type === 'entrada' && receivingNow > 0 &&
        (alreadyReceived > 0 || receivingNow < remaining - 0.005);

      let dataRow: any;

      if (isPartial) {
        // === FLUXO PARCIAL ===
        // 1) Insere filha 'Recebimento parcial' (entrada, is_paid=true).
        const childPayload = buildPartialReceiptRow({
          parent: parent as any,
          cfg: { ...cfg, amountReceived: receivingNow },
          paidDate,
          createdBy: user?.id,
        });
        const { data: child, error: childErr } = await supabase
          .from('financial_transactions')
          .insert(childPayload as any)
          .select('*')
          .single();
        if (childErr) throw childErr;

        // 2) O novo vencimento da mãe vai no FIM (depois da tarifa), conferido:
        //    a RLS pode barrar o update sem erro, e o recebimento e a tarifa
        //    não podem ficar pela metade por causa disso.

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

      // Se houve tarifa, nasce a despesa na categoria do papel "tarifa de
      // recebimento" — resolvida por is_system + type + dre_group, nunca pelo
      // nome literal. Empresa que renomeou a categoria recebe o nome NOVO.
      // Em recebimento parcial: tarifa vincula à FILHA (preserva rastreamento de qual recebimento gerou).
      // Em quitação total: mantém comportamento atual (filha da mãe).
      if (cfg.fee_amount && cfg.fee_amount > 0) {
        const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
        const company_id = await getCurrentUserCompanyId();
        const feeCategory = await resolveSystemCategoryNameFresh(queryClient, company_id, 'receipt_fee');
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
          feeCategory,
        });
        const { error: feeErr } = await supabase.from('financial_transactions').insert(feePayload as any);
        if (feeErr) throw feeErr;
      }

      // Recebimento parcial com novo vencimento: só o due_date da mãe (o gatilho
      // no banco cuida do amount_received e do is_paid).
      if (isPartial && cfg.newDueDate) {
        assertRowsAffected(
          await supabase
            .from('financial_transactions')
            .update({ due_date: cfg.newDueDate } as any, { count: 'exact' })
            .eq('id', cfg.id),
          'update',
          'O recebimento parcial foi registrado, mas o novo vencimento não foi salvo: você não tem permissão para alterar esta conta. Atualize a tela e confira.',
        );
      }

      return dataRow;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast({ title: 'Recebimento confirmado!' });
    },
    onError: (error: Error, params: string | MarkAsPaidParams) => {
      // Vencimento barrado depois do recebimento parcial gravado: a lista
      // precisa mostrar o recebimento mesmo com o aviso de erro.
      if (error instanceof NoRowsAffectedError || (error as { code?: string }).code === 'OSC01') void invalidateAll();
      let description = (error as { code?: string }).code?.startsWith('OSC') ? osBillingError(error) : getErrorMessage(error);
      if (typeof params !== 'string' && params.occurrenceAmount !== undefined) {
        const message = getRpcErrorMessage(error);
        description = /\b[a-z0-9]+_[a-z0-9_]+\b/i.test(message)
          ? 'Não foi possível ajustar esta conta. Confira os vínculos e tente novamente.'
          : message;
      }
      toast({ variant: 'destructive', title: 'Erro ao atualizar transação', description });
    },
  });

  // ==========================================================================
  // QUITAÇÃO EM LOTE (contas a pagar E contas a receber)
  // ==========================================================================
  //
  // Contrato das RPCs: migrations
  // `20260924180000_pagamento_em_lote_contas_a_pagar.sql` e
  // `20260924200000_lote_trava_de_folha_e_contas_a_receber.sql`.
  //
  // As duas RPCs e a coluna `financial_transactions.payment_group_id` já estão
  // em `src/integrations/supabase/types.ts` (types regenerados depois do push),
  // então NÃO há tipagem manual aqui: o nome da RPC, os argumentos e o formato
  // do retorno vêm do tipo gerado. Se a assinatura mudar no banco e os types
  // forem regenerados, o typecheck aponta — que é exatamente o que uma
  // interface copiada à mão escondia.
  //
  // ⚠️ Via supabase-js as duas devolvem ARRAY (RETURNS TABLE), então o resultado
  // útil é sempre `data?.[0]`. Ler `data.payment_group_id` direto devolve
  // `undefined` em silêncio.

  interface PayTransactionsBatchParams {
    ids: string[];
    accountId: string;
    paymentMethod?: string;
    /** `YYYY-MM-DD`. Ausente = hoje no fuso da EMPRESA, decidido no servidor. */
    paidDate?: string;
    /**
     * Id do lote gerado NO CLIENT (`crypto.randomUUID()`), reaproveitado no
     * retry. É o que torna o botão seguro contra duplo clique e reenvio: a RPC
     * reconhece o mesmo id e devolve `already_applied` em vez de quitar de novo
     * (contrato de mutação idempotente com id gerado no client).
     */
    groupId?: string;
  }

  /**
   * Quita N contas a pagar OU N contas a receber como UM evento. Nunca as duas
   * coisas no mesmo lote — o servidor recusa a mistura, e a tela trava a
   * seleção no lado do primeiro item marcado.
   *
   * NENHUMA linha nova nasce: a RPC só marca as N como pagas sob o mesmo
   * `payment_group_id`. O "lançamento único" que bate com a linha do extrato é
   * DERIVADO (soma das linhas do grupo) — é isso que impede o saldo de contar o
   * mesmo dinheiro duas vezes, dos dois lados.
   *
   * Tudo ou nada: uma linha inelegível recusa o lote inteiro, com a mensagem já
   * em PT-BR vinda do servidor (a lista de contas problemáticas vem em
   * `details`). A tela só antecipa essas regras para desabilitar o checkbox.
   */
  const payTransactionsBatch = useMutation({
    mutationFn: async (params: PayTransactionsBatchParams): Promise<PayBatchResult> => {
      const { ids, accountId, paymentMethod, paidDate, groupId } = params;
      if (ids.length === 0) throw new Error('Selecione ao menos uma conta para quitar');

      // Argumento ausente (`undefined`) some do JSON e a RPC aplica o DEFAULT
      // dela. `null` explícito NÃO faria isso nos parâmetros opcionais, e o
      // tipo gerado já nem aceita.
      const { data, error } = await supabase.rpc('pay_transactions_batch', {
        p_transaction_ids: ids,
        p_account_id: accountId,
        p_payment_method: paymentMethod || undefined,
        // `paid_date` decide o MÊS da despesa no regime de Caixa. Quando a tela
        // manda a data, ela já veio de `todayInTz(timezone)`; quando não manda,
        // o servidor usa `company_today()`, o mesmo "hoje" no fuso da empresa.
        p_paid_date: paidDate || undefined,
        p_group_id: groupId || undefined,
      });
      if (error) throw error;

      const row = data?.[0];
      if (!row) throw new Error('A quitação em lote não retornou resultado. Tente de novo.');
      return row;
    },
    onSuccess: async () => {
      await invalidateAll();
    },
    onError: (error: Error) => {
      // A RPC devolve a mensagem pronta pro toast (PT-BR). `getRpcErrorMessage`
      // repassa pura, sem grudar o código SQL.
      toast({
        variant: 'destructive',
        title: 'Não foi possível quitar o lote',
        description: getRpcErrorMessage(error),
      });
    },
  });

  /**
   * Desfaz o lote inteiro (de contas a pagar OU a receber): as N linhas voltam
   * a pendente e perdem o carimbo. Grupo inexistente devolve
   * `already_undone: true` (retry seguro), não erro.
   */
  const undoPaymentGroup = useMutation({
    mutationFn: async (paymentGroupId: string): Promise<UndoGroupResult> => {
      const { data, error } = await supabase.rpc('undo_payment_group', {
        p_payment_group_id: paymentGroupId,
      });
      if (error) throw error;

      const row = data?.[0];
      if (!row) throw new Error('Não foi possível desfazer o lote. Tente de novo.');
      return row;
    },
    onSuccess: async () => {
      await invalidateAll();
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível desfazer o lote',
        description: getRpcErrorMessage(error),
      });
    },
  });

  // Tudo o que a query trouxe: mães E filhas (tarifa do recebimento,
  // recebimento parcial, CMV legado). É o conjunto que o DRE precisa pra fechar
  // o resultado — a tarifa da maquininha é despesa de verdade e não existe em
  // nenhuma outra linha.
  const transactionsWithChildren = canRead ? transactionsQuery.data ?? EMPTY_TRANSACTIONS : EMPTY_TRANSACTIONS;

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
    summary: canRead && summaryQuery.data ? summaryQuery.data : { totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 },
    isLoading: loadData && (!scope.ready || transactionsQuery.isLoading || summaryQuery.isLoading),
    error: canRead ? transactionsQuery.error || summaryQuery.error : null,
    refetch: () => canRead ? Promise.all([transactionsQuery.refetch(), summaryQuery.refetch()]) : Promise.resolve([]),
    createTransaction,
    /** Série de REPETIÇÃO (N lançamentos do mesmo valor) num insert só. */
    createTransactionsBatch,
    updateTransaction,
    updateInstallmentGroup,
    /** Edição em massa (valor / conta / categoria) dos ids selecionados. */
    updateTransactionsBatch,
    deleteTransaction,
    deleteInstallmentGroup,
    /** Exclusão em massa dos ids selecionados, com as cascatas do delete individual. */
    deleteTransactionsBatch,
    markAsPaid,
    /**
     * Quitação em LOTE de contas a pagar OU a receber: N contas viram UM evento
     * de caixa (mesmo `payment_group_id`), sem criar lançamento nenhum.
     */
    payTransactionsBatch,
    /** Desfaz um lote inteiro pelo `payment_group_id`. */
    undoPaymentGroup,
  };
}
