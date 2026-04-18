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
      const materialItems = quoteItems.filter(i => i.item_type === 'material' && i.inventory_id);

      if (materialItems.length > 0) {
        const movements = materialItems.map(i => ({
          inventory_id: i.inventory_id!,
          service_order_id: serviceOrder.id,
          quantity: -Math.abs(i.quantity),
          movement_type: 'saida',
          notes: `Consumo do Orçamento #${quote.quote_number}`,
          created_by: user.id,
        }));
        const { error: movError } = await supabase.from('inventory_movements').insert(movements);
        if (movError) throw movError;
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
   * Approves a quote: creates revenue, CMV expenses (materials in 1 lump-sum, avulse labor),
   * fee expense, and updates the quote status.
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
      const items = quote.quote_items || [];

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

      // 2. Materials CMV — single lump-sum entry
      const materialsTotal = items
        .filter(i => i.item_type === 'material')
        .reduce((s, i) => {
          const cost = Number(i.unit_total_cost ?? 0) || Number(i.unit_price ?? 0);
          return s + cost * Number(i.quantity);
        }, 0);

      const expensesToInsert: any[] = [];

      if (materialsTotal > 0) {
        expensesToInsert.push(normalizeOptionalForeignKeys({
          transaction_type: 'saida',
          amount: materialsTotal,
          description: `CMV Materiais — Orçamento #${quote.quote_number}`,
          category: 'CMV - Materiais',
          customer_id: quote.customer_id,
          account_id: payment.account_id,
          transaction_date: payment.paid_date,
          paid_date: payment.paid_date,
          is_paid: true,
          notes: `Custo de materiais do orçamento #${quote.quote_number}`,
          created_by: user.id,
          company_id,
          parent_transaction_id: revenue.id,
        } as any, ['customer_id', 'account_id']));
      }

      // 3. Avulse labor CMV — only labor that is NOT from a registered employee
      // Heuristic: services with unit_labor_cost > 0 AND no linked employee/team.
      // Since quote_items don't carry employee linkage, we treat any explicit
      // unit_labor_cost as avulse (diária/free-lance).
      const avulseLaborTotal = items
        .filter(i => i.item_type === 'servico')
        .reduce((s, i) => {
          const cost = Number(i.unit_labor_cost ?? 0);
          return s + cost * Number(i.quantity);
        }, 0);

      if (avulseLaborTotal > 0) {
        expensesToInsert.push(normalizeOptionalForeignKeys({
          transaction_type: 'saida',
          amount: avulseLaborTotal,
          description: `Mão de obra avulsa — Orçamento #${quote.quote_number}`,
          category: 'CMV - Mão de Obra Avulsa',
          customer_id: quote.customer_id,
          account_id: payment.account_id,
          transaction_date: payment.paid_date,
          paid_date: payment.paid_date,
          is_paid: true,
          notes: `Diárias / valor avulso do orçamento #${quote.quote_number}`,
          created_by: user.id,
          company_id,
          parent_transaction_id: revenue.id,
        } as any, ['customer_id', 'account_id']));
      }

      // 4. Fee (Tarifas e Taxas)
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

      // 5. Update quote status + link
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
      toast({ title: 'Orçamento aprovado!', description: 'Receita e custos lançados no financeiro.' });
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
