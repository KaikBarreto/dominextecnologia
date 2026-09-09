import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Quote } from '@/hooks/useQuotes';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import type { ReceivePaymentResult } from '@/components/financial/ReceivePaymentModal';

interface ApproveQuoteParams {
  quote: Quote;
  payment: ReceivePaymentResult;
}

export function useQuoteConversion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
   * Aprova o orçamento: cria a receita, a despesa da tarifa do recebimento
   * (quando houver) e atualiza o status do orçamento.
   *
   * Não gera lançamento de custo (CMV de material / mão de obra avulsa): o custo
   * do orçamento é demonstrativo. Ver comentário no item 2 abaixo.
   */
  const approveQuoteFinancial = useMutation({
    mutationFn: async ({ quote, payment }: ApproveQuoteParams) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      if (quote.financial_generated_at) {
        throw new Error('Lançamentos financeiros já foram gerados para este orçamento');
      }

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const grossAmount = Number(quote.final_price ?? quote.total_value ?? 0);

      // 1. Revenue (entrada)
      const revenuePayload = normalizeOptionalForeignKeys(
        {
          transaction_type: 'entrada',
          amount: grossAmount,
          description: `Orçamento #${quote.quote_number}`,
          category: 'Vendas de Serviços',
          customer_id: quote.customer_id,
          account_id: payment.account_id,
          payment_method: payment.payment_method,
          transaction_date: payment.paid_date,
          paid_date: payment.paid_date,
          is_paid: true,
          notes: payment.notes,
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
      // `payment.account_id`: essas duas são movimento de caixa de verdade.
      const expensesToInsert: any[] = [];

      // 3. Tarifa do recebimento (Tarifas e Taxas)
      if (payment.fee_amount > 0) {
        expensesToInsert.push(normalizeOptionalForeignKeys({
          transaction_type: 'saida',
          amount: payment.fee_amount,
          description: `Tarifa do recebimento — Orçamento #${quote.quote_number}`,
          category: 'Tarifas e Taxas',
          customer_id: quote.customer_id,
          account_id: payment.account_id,
          payment_method: payment.payment_method,
          transaction_date: payment.paid_date,
          paid_date: payment.paid_date,
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

      return revenue;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Orçamento aprovado!', description: 'Receita lançada no financeiro.' });
    },
    onError: (e: any) => {
      toast({ variant: 'destructive', title: 'Erro ao aprovar', description: getErrorMessage(e) });
    },
  });

  return {
    convertToServiceOrder,
    approveQuoteFinancial,
    isConverting: convertToServiceOrder.isPending,
    isApproving: approveQuoteFinancial.isPending,
  };
}
