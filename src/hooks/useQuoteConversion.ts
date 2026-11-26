import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Quote } from '@/hooks/useQuotes';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import type { ApproveQuoteResult } from '@/components/financial/ApproveQuoteModal';
import { buildInstallmentPlan } from '@/lib/finance-installments';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { resolveSystemCategoryNameFresh } from '@/hooks/useFinancialCategories';
import { SERVICE_ORDER_BUDGET_KEY, SERVICE_ORDER_SERVICE_TYPES_KEY } from '@/hooks/useServiceOrderBudget';
import { SERVICE_ORDER_OPTIONS_KEY } from '@/hooks/useServiceOrderOptions';
import type { QuoteExecutionAssignment } from '@/lib/quoteServiceDistribution';
import { getQuoteCommercialTotal } from '@/lib/quote-commercial-total';
import { osBillingError } from '@/lib/osCommercial';
import { assertRowsAffected } from '@/lib/supabaseMutation';

interface ApproveQuoteParams {
  quote: Quote;
  approval: ApproveQuoteResult;
}

/** Devolvido pela mutation pra o toast saber o que dizer. */
interface ApproveQuoteOutcome {
  mode: ApproveQuoteResult['mode'];
  /** Quantas linhas de receita foram criadas (0 no modo 'apenas_aprovar'). */
  count: number;
  /** Id da linha-âncora (a receita, ou a 1a parcela). Null sem financeiro. */
  primaryId: string | null;
}

/**
 * ── Construtores PUROS das linhas geradas pela aprovação do orçamento ────────
 *
 * Ficam fora do hook de propósito: a categoria deixou de ser literal e passou a
 * vir resolvida por PAPEL (`resolveSystemCategoryNameFresh`), e é exatamente
 * esse fio que precisa de teste — renomear "Vendas de Serviços" na tela de
 * Categorias tem que fazer a receita nascer com o nome NOVO, sem tocar em mais
 * nada.
 */

/** Parcelas PENDENTES de "vou receber depois". Uma linha por item do plano. */
export function buildQuoteReceivableRows(args: {
  plan: Array<{ number: number; date: string; amount: number }>;
  quoteNumber: number | string;
  revenueCategory: string;
  customerId?: string | null;
  expectedAccountId?: string | null;
  costCenterId?: string | null;
  notes?: string | null;
  createdBy: string;
  companyId: string;
  groupId: string | null;
}): Record<string, unknown>[] {
  const { plan, quoteNumber, revenueCategory, createdBy, companyId, groupId } = args;
  const isParcelado = plan.length > 1;
  return plan.map(({ number, date, amount }) => normalizeOptionalForeignKeys(
    {
      transaction_type: 'entrada',
      amount,
      description: isParcelado
        ? `Orçamento #${quoteNumber} (${number}/${plan.length})`
        : `Orçamento #${quoteNumber}`,
      category: revenueCategory,
      customer_id: args.customerId ?? null,
      // Conta PREVISTA do recebimento. Inofensiva enquanto pendente:
      // saldo de conta só soma linha paga (useFinancialAccounts).
      account_id: args.expectedAccountId ?? null,
      // TODAS as parcelas levam o mesmo centro de custo — parcela sem ele
      // fura a quebra por centro de custo em silêncio.
      cost_center_id: args.costCenterId ?? null,
      // `transaction_date` = mês em que o caixa VAI mover, nunca a data da
      // geração (bug histórico das mensalidades de contrato).
      transaction_date: date,
      due_date: date,
      paid_date: null,
      is_paid: false,
      notes: args.notes,
      created_by: createdBy,
      company_id: companyId,
      installment_group_id: groupId,
      installment_number: isParcelado ? number : null,
      installment_total: isParcelado ? plan.length : null,
    },
    ['customer_id', 'account_id', 'cost_center_id']
  ));
}

/** Receita JÁ PAGA do modo "já recebi". */
export function buildQuoteRevenueRow(args: {
  quoteNumber: number | string;
  amount: number;
  revenueCategory: string;
  customerId?: string | null;
  accountId?: string | null;
  costCenterId?: string | null;
  paymentMethod?: string | null;
  paidDate: string;
  notes?: string | null;
  createdBy: string;
  companyId: string;
}): Record<string, unknown> {
  return normalizeOptionalForeignKeys(
    {
      transaction_type: 'entrada',
      amount: args.amount,
      description: `Orçamento #${args.quoteNumber}`,
      category: args.revenueCategory,
      customer_id: args.customerId ?? null,
      account_id: args.accountId,
      cost_center_id: args.costCenterId ?? null,
      payment_method: args.paymentMethod,
      transaction_date: args.paidDate,
      paid_date: args.paidDate,
      is_paid: true,
      notes: args.notes,
      created_by: args.createdBy,
      company_id: args.companyId,
    },
    ['customer_id', 'account_id', 'cost_center_id']
  );
}

/** Despesa da tarifa do recebimento, filha da receita. */
export function buildQuoteFeeRow(args: {
  quoteNumber: number | string;
  feeAmount: number;
  feeCategory: string;
  customerId?: string | null;
  accountId?: string | null;
  costCenterId?: string | null;
  paymentMethod?: string | null;
  paidDate: string;
  createdBy: string;
  companyId: string;
  revenueId: string;
}): Record<string, unknown> {
  return normalizeOptionalForeignKeys(
    {
      transaction_type: 'saida',
      amount: args.feeAmount,
      description: `Tarifa do recebimento — Orçamento #${args.quoteNumber}`,
      category: args.feeCategory,
      customer_id: args.customerId ?? null,
      account_id: args.accountId,
      // A tarifa é despesa do MESMO fato: segue o centro de custo da receita.
      cost_center_id: args.costCenterId ?? null,
      payment_method: args.paymentMethod,
      transaction_date: args.paidDate,
      paid_date: args.paidDate,
      is_paid: true,
      created_by: args.createdBy,
      company_id: args.companyId,
      parent_transaction_id: args.revenueId,
    },
    ['customer_id', 'account_id', 'cost_center_id']
  );
}

export function useQuoteConversion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { locale } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.finance.approveQuote.toast;

  const pendingApproval = useRef<{ signature: string; id: string; args: { p_quote_id: string; p_mode: string; p_rows: Json; p_fee: number; p_fee_category: string | null } } | null>(null);

  const invalidateAll = () => {
    for (const key of ['os-commercial-document', 'os-billing-state', 'os-billing-flags', 'os-revenue-summary', 'nfse-auto-readiness']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_OPTIONS_KEY] });
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['portal-payments'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
  };

  const convertToServiceOrder = useMutation({
    mutationFn: async ({
      quote,
      execution,
      showValues = false,
    }: {
      quote: Quote;
      execution: QuoteExecutionAssignment[];
      showValues?: boolean;
    }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      if (quote.converted_to_os_id) throw new Error('Orçamento já foi convertido');
      const { data, error } = await supabase.rpc('generate_service_order_from_quote_prepared', {
        p_quote_id: quote.id,
        p_show_values: showValues,
        p_execution: execution as unknown as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_BUDGET_KEY] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_SERVICE_TYPES_KEY] });
      toast({ title: 'OS gerada com sucesso!', description: 'Serviços e valores foram copiados. A execução segue os equipamentos e checklists escolhidos.' });
    },
    onError: (e: unknown) => {
      toast({ variant: 'destructive', title: 'Não foi possível gerar a OS', description: (e as { code?: string })?.code === 'OSC03' ? 'Confira os equipamentos e checklists escolhidos. Eles precisam estar disponíveis nesta empresa e pertencer ao cliente.' : 'Não foi possível gerar a OS. Confira seu acesso e se o orçamento continua aprovado antes de tentar novamente.' });
    },
  });

  /**
   * Aprova o orçamento em um de três modos (o padrão vem de
   * `company_settings.quote_approval_revenue_mode`):
   *
   * - `apenas_aprovar` — muda apenas o status comercial; sem financeiro.
   * - `recebido`  — comportamento histórico: receita já PAGA (entra no saldo da
   *                 conta na hora) + a despesa da tarifa do recebimento como
   *                 linha filha.
   * - `a_receber` — gera N parcelas PENDENTES em Contas a Receber. O cliente dá
   *                 a baixa conforme o dinheiro entra. NENHUMA tarifa aqui:
   *                 tarifa é fato do RECEBIMENTO e é informada na baixa de cada
   *                 parcela (o ReceivePaymentModal de Contas a Receber já tem o
   *                 campo). Cobrar a tarifa na aprovação debitaria a conta por
   *                 um dinheiro que ainda nem entrou.
   *
   * Em nenhum dos modos gera lançamento de custo (CMV de material / mão de obra
   * avulsa): o custo do orçamento é demonstrativo. Ver comentário no item 2.
   */
  const approveQuoteFinancial = useMutation({
    mutationFn: async ({ quote, approval }: ApproveQuoteParams): Promise<ApproveQuoteOutcome> => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      if (quote.financial_generated_at && pendingApproval.current?.args.p_quote_id !== quote.id) {
        throw new Error('Lançamentos financeiros já foram gerados para este orçamento');
      }

      // Aprovação comercial sem antecipar o fato financeiro. Os filtros
      // adicionais tornam a operação concorrente segura: se outro usuário
      // faturou ou converteu o orçamento enquanto o modal estava aberto, a
      // atualização afeta zero linhas e não apaga nem mascara o novo estado.
      if (approval.mode === 'apenas_aprovar') {
        const { data: approved, error: approvalError } = await supabase
          .from('quotes')
          .update({ status: 'aprovado' })
          .eq('id', quote.id)
          .in('status', ['rascunho', 'enviado'])
          .is('financial_generated_at', null)
          .is('financial_transaction_id', null)
          .is('converted_to_os_id', null)
          .select('id')
          .maybeSingle();

        if (approvalError) throw approvalError;
        if (!approved) {
          throw new Error('O orçamento foi alterado. Atualize a tela antes de aprovar novamente.');
        }

        return { mode: 'apenas_aprovar', count: 0, primaryId: null };
      }

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const grossAmount = getQuoteCommercialTotal(quote);
      const category = await resolveSystemCategoryNameFresh(queryClient, company_id, 'service_revenue');
      const fee = approval.mode === 'recebido' ? approval.fee_amount ?? 0 : 0;
      const feeCategory = fee > 0
        ? await resolveSystemCategoryNameFresh(queryClient, company_id, 'receipt_fee') : null;
      const signature = JSON.stringify([company_id, user.id, quote.id, grossAmount, approval]);
      if (pendingApproval.current?.signature !== signature) {
        let rows: Record<string, unknown>[];
        if (approval.mode === 'a_receber') {
          if (!approval.first_due_date) throw new Error('Informe o primeiro vencimento');
          const plan = buildInstallmentPlan(approval.first_due_date, grossAmount,
            Math.min(60, Math.max(1, Math.floor(approval.installments ?? 1))));
          rows = buildQuoteReceivableRows({ plan, quoteNumber: quote.quote_number, revenueCategory: category,
            customerId: quote.customer_id, expectedAccountId: approval.expected_account_id,
            costCenterId: approval.cost_center_id, notes: approval.notes, createdBy: user.id, companyId: company_id,
            groupId: null });
        } else {
          rows = [buildQuoteRevenueRow({ quoteNumber: quote.quote_number, amount: grossAmount,
            revenueCategory: category, customerId: quote.customer_id, accountId: approval.account_id,
            costCenterId: approval.cost_center_id, paymentMethod: approval.payment_method,
            paidDate: approval.paid_date!, notes: approval.notes, createdBy: user.id, companyId: company_id })];
        }
        pendingApproval.current = { signature, id: crypto.randomUUID(), args: {
          p_quote_id: quote.id, p_mode: approval.mode, p_rows: rows as unknown as Json, p_fee: fee, p_fee_category: feeCategory,
        } };
      }
      const { data, error } = await supabase.rpc('approve_quote_financial_atomic', {
        ...pendingApproval.current.args, p_request_id: pendingApproval.current.id,
      });
      if (error) {
        if (/^[A-Z0-9]{5}$/.test(error.code ?? '')) pendingApproval.current = null;
        throw error;
      }
      pendingApproval.current = null;
      return data as unknown as ApproveQuoteOutcome;
    },
    onSuccess: (outcome) => {
      invalidateAll();
      const description = outcome.mode === 'apenas_aprovar'
        ? tq.approvedOnly
        : outcome.mode === 'recebido'
          ? tq.revenuePosted
          : outcome.count > 1
            ? tq.receivableMulti.replace('{count}', String(outcome.count))
            : tq.receivableSingle;
      toast({ title: tq.approvedTitle, description });
    },
    onError: (e: unknown) => {
      toast({ variant: 'destructive', title: tq.errorTitle, description: osBillingError(e) });
    },
  });

  return {
    convertToServiceOrder,
    approveQuoteFinancial,
    isConverting: convertToServiceOrder.isPending,
    isApproving: approveQuoteFinancial.isPending,
  };
}
