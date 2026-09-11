import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Quote } from '@/hooks/useQuotes';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import type { ApproveQuoteResult } from '@/components/financial/ApproveQuoteModal';
import { buildInstallmentPlan } from '@/lib/finance-installments';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ApproveQuoteParams {
  quote: Quote;
  approval: ApproveQuoteResult;
}

/** Devolvido pela mutation pra o toast saber o que dizer. */
interface ApproveQuoteOutcome {
  mode: ApproveQuoteResult['mode'];
  /** Quantas linhas de receita foram criadas (1 no modo 'recebido'). */
  count: number;
  /** Id da linha-âncora (a receita, ou a 1a parcela). */
  primaryId: string;
}

export function useQuoteConversion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { locale } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.finance.approveQuote.toast;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
  };

  const convertToServiceOrder = useMutation({
    mutationFn: async (quote: Quote) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      if (quote.converted_to_os_id) throw new Error('Orçamento já foi convertido');

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const serviceOrderPayload = normalizeOptionalForeignKeys(
        {
          customer_id: quote.customer_id,
          service_type_id: quote.quote_items?.[0]?.service_type_id || null,
          status: 'agendada',
          total_value: quote.final_price || quote.total_value || 0,
          description: `Convertido do Orçamento #${quote.quote_number}`,
          notes: quote.notes,
          quote_id: quote.id,
          created_by: user.id,
        } as any,
        ['customer_id', 'service_type_id']
      );

      const { data: serviceOrder, error: osError } = await supabase
        .from('service_orders')
        .insert(serviceOrderPayload)
        .select()
        .single();
      if (osError) throw osError;

      const quoteItems = quote.quote_items || [];
      const materialItems = quoteItems.filter(i => i.item_type === 'material' && i.inventory_id && i.quantity > 0);

      if (materialItems.length > 0) {
        // Escreve pelo caminho atômico único (register_inventory_movement).
        // Ele resolve o estoque principal (p_stock_id NULL) e move o saldo em
        // inventory_stock_levels; inventory.quantity reflete via trigger.
        for (const i of materialItems) {
          const { error: movError } = await supabase.rpc('register_inventory_movement', {
            p_inventory_id: i.inventory_id!,
            p_movement_type: 'saida',
            p_quantity: -Math.abs(i.quantity),
            p_service_order_id: serviceOrder.id,
            p_notes: `Consumo do Orçamento #${quote.quote_number}`,
          });
          if (movError) throw movError;
        }
      }

      const { error: quoteError } = await supabase
        .from('quotes')
        .update({ converted_to_os_id: serviceOrder.id, status: 'convertido' })
        .eq('id', quote.id);
      if (quoteError) throw quoteError;

      return serviceOrder;
    },
    onSuccess: (so) => {
      invalidateAll();
      toast({ title: 'Orçamento convertido!', description: `OS criada com sucesso.` });
    },
    onError: (e: any) => {
      toast({ variant: 'destructive', title: 'Erro na conversão', description: getErrorMessage(e) });
    },
  });

  /**
   * Aprova o orçamento em UM de dois modos (o padrão vem de
   * `company_settings.quote_approval_revenue_mode`):
   *
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
      if (quote.financial_generated_at) {
        throw new Error('Lançamentos financeiros já foram gerados para este orçamento');
      }

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const grossAmount = Number(quote.final_price ?? quote.total_value ?? 0);

      // ═══════════════════════ MODO "VOU RECEBER DEPOIS" ═══════════════════════
      if (approval.mode === 'a_receber') {
        const installments = Math.min(60, Math.max(1, Math.floor(approval.installments ?? 1)));
        const firstDueDate = approval.first_due_date;
        if (!firstDueDate) throw new Error('Informe o primeiro vencimento');

        // Datas com clamp de fim de mês + rateio com a sobra na última parcela.
        // Mesmo motor do preview do modal e do parcelamento manual — as três
        // superfícies precisam mostrar/gravar exatamente os mesmos números.
        const plan = buildInstallmentPlan(firstDueDate, grossAmount, installments);
        const isParcelado = plan.length > 1;
        // Só parcelado ganha grupo. À vista, os três campos ficam NULL — é como
        // o lançamento manual nasce, e o badge "x/y" da listagem só aparece
        // quando `installment_number` existe: um "1/1" denunciaria a origem.
        const groupId = isParcelado ? crypto.randomUUID() : null;

        const rows = plan.map(({ number, date, amount }) => normalizeOptionalForeignKeys(
          {
            transaction_type: 'entrada',
            amount,
            description: isParcelado
              ? `Orçamento #${quote.quote_number} (${number}/${plan.length})`
              : `Orçamento #${quote.quote_number}`,
            category: 'Vendas de Serviços',
            customer_id: quote.customer_id,
            // Conta PREVISTA do recebimento. Inofensiva enquanto pendente:
            // saldo de conta só soma linha paga (useFinancialAccounts).
            account_id: approval.expected_account_id ?? null,
            // `transaction_date` = mês em que o caixa VAI mover, nunca a data da
            // geração (bug histórico das mensalidades de contrato).
            transaction_date: date,
            due_date: date,
            paid_date: null,
            is_paid: false,
            notes: approval.notes,
            created_by: user.id,
            company_id,
            installment_group_id: groupId,
            installment_number: isParcelado ? number : null,
            installment_total: isParcelado ? plan.length : null,
          } as any,
          ['customer_id', 'account_id']
        ));

        const { data: inserted, error: insErr } = await supabase
          .from('financial_transactions')
          .insert(rows as any)
          .select('id, installment_number');
        if (insErr) throw insErr;

        const ordered = ((inserted ?? []) as Array<{ id: string; installment_number: number | null }>)
          .slice()
          .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0));
        const primaryId = ordered[0]?.id;
        if (!primaryId) throw new Error('Nenhuma parcela foi criada');

        const { error: qErr } = await supabase
          .from('quotes')
          .update({
            status: 'aprovado',
            financial_generated_at: new Date().toISOString(),
            financial_transaction_id: primaryId,
            receivable_installments: plan.length,
            receivable_first_due_date: firstDueDate,
          } as any)
          .eq('id', quote.id);
        if (qErr) throw qErr;

        return { mode: 'a_receber', count: plan.length, primaryId };
      }

      // ═══════════════════════════ MODO "JÁ RECEBI" ════════════════════════════
      // 1. Revenue (entrada)
      const revenuePayload = normalizeOptionalForeignKeys(
        {
          transaction_type: 'entrada',
          amount: grossAmount,
          description: `Orçamento #${quote.quote_number}`,
          category: 'Vendas de Serviços',
          customer_id: quote.customer_id,
          account_id: approval.account_id,
          payment_method: approval.payment_method,
          transaction_date: approval.paid_date,
          paid_date: approval.paid_date,
          is_paid: true,
          notes: approval.notes,
          created_by: user.id,
          company_id,
        } as any,
        ['customer_id', 'account_id']
      );

      const { data: revenue, error: revErr } = await supabase
        .from('financial_transactions')
        .insert(revenuePayload)
        .select()
        .single();
      if (revErr) throw revErr;

      // 2. Custo do orçamento NÃO vira lançamento financeiro.
      //
      // Regra de produto (CEO, set/2026): o custo que aparece no orçamento é
      // DEMONSTRATIVO: serve pra calcular margem/BDI na hora de precificar, e
      // não é fato financeiro. O fato financeiro é a COMPRA do material (ou o
      // pagamento da diária), que o usuário lança à mão como despesa normal,
      // com conta, no momento em que o dinheiro realmente sai do banco.
      //
      // Por isso a aprovação não gera mais CMV de materiais nem mão de obra
      // avulsa. Antes elas nasciam como linha filha da receita e, desde a
      // 1.24.5, já vinham com `account_id: null` pra não debitar o saldo duas
      // vezes (provado contra extrato real do Mercado Pago: 8 de 8 fechamentos
      // diários batendo ao centavo sem elas). Inertes desse jeito, só apareciam
      // no diálogo de transações relacionadas e confundiam quem ia excluir a
      // receita.
      //
      // A margem/lucratividade do orçamento NÃO depende destas linhas: ela sai
      // de `quote_items` (`unit_total_cost` / `unit_labor_cost`) em
      // `QuoteFormDialog` via `useBDICalculator`. Não reintroduza sem o PM.
      //
      // A RECEITA (item 1) e a TARIFA do recebimento (item 3) continuam com
      // `approval.account_id`: essas duas são movimento de caixa de verdade.
      const expensesToInsert: any[] = [];

      // 3. Tarifa do recebimento (Tarifas e Taxas)
      if ((approval.fee_amount ?? 0) > 0) {
        expensesToInsert.push(normalizeOptionalForeignKeys({
          transaction_type: 'saida',
          amount: approval.fee_amount,
          description: `Tarifa do recebimento — Orçamento #${quote.quote_number}`,
          category: 'Tarifas e Taxas',
          customer_id: quote.customer_id,
          account_id: approval.account_id,
          payment_method: approval.payment_method,
          transaction_date: approval.paid_date,
          paid_date: approval.paid_date,
          is_paid: true,
          created_by: user.id,
          company_id,
          parent_transaction_id: revenue.id,
        } as any, ['customer_id', 'account_id']));
      }

      if (expensesToInsert.length > 0) {
        const { error: expErr } = await supabase
          .from('financial_transactions')
          .insert(expensesToInsert as any);
        if (expErr) throw expErr;
      }

      // 4. Update quote status + link
      const { error: qErr } = await supabase
        .from('quotes')
        .update({
          status: 'aprovado',
          financial_generated_at: new Date().toISOString(),
          financial_transaction_id: revenue.id,
        } as any)
        .eq('id', quote.id);
      if (qErr) throw qErr;

      return { mode: 'recebido', count: 1, primaryId: revenue.id };
    },
    onSuccess: (outcome) => {
      invalidateAll();
      const description = outcome.mode === 'recebido'
        ? tq.revenuePosted
        : outcome.count > 1
          ? tq.receivableMulti.replace('{count}', String(outcome.count))
          : tq.receivableSingle;
      toast({ title: tq.approvedTitle, description });
    },
    onError: (e: any) => {
      toast({ variant: 'destructive', title: tq.errorTitle, description: getErrorMessage(e) });
    },
  });

  return {
    convertToServiceOrder,
    approveQuoteFinancial,
    isConverting: convertToServiceOrder.isPending,
    isApproving: approveQuoteFinancial.isPending,
  };
}
