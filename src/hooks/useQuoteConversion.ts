import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Quote } from '@/hooks/useQuotes';

export function useQuoteConversion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  const convertToServiceOrder = useMutation({
    mutationFn: async (quote: Quote) => {
      if (!user?.id || !profile?.company_id) {
        throw new Error('Usuário não autenticado');
      }

      if (quote.status !== 'aprovado') {
        throw new Error('Apenas orçamentos aprovados podem ser convertidos');
      }

      if (quote.converted_to_os_id) {
        throw new Error('Orçamento já foi convertido');
      }

      // 1. Create service order
      const { data: serviceOrder, error: osError } = await supabase
        .from('service_orders')
        .insert({
          customer_id: quote.customer_id,
          service_type_id: quote.quote_items?.[0]?.service_type_id || null,
          status: 'agendada',
          total_value: quote.final_price || quote.total_value || 0,
          description: `Convertido do Orçamento #${quote.quote_number}`,
          notes: quote.notes,
          quote_id: quote.id,
          created_by: user.id,
          company_id: profile.company_id,
        } as any)
        .select()
        .single();

      if (osError) throw osError;

      // 2. Create inventory movements for materials
      const quoteItems = quote.quote_items || [];
      const materialItems = quoteItems.filter(item => item.item_type === 'material' && item.inventory_id);

      if (materialItems.length > 0) {
        const movements = materialItems.map(item => ({
          inventory_id: item.inventory_id!,
          service_order_id: serviceOrder.id,
          quantity: -Math.abs(item.quantity), // Negative for consumption
          movement_type: 'saida',
          notes: `Consumo do Orçamento #${quote.quote_number}`,
          created_by: user.id,
        }));

        const { error: movError } = await supabase
          .from('inventory_movements')
          .insert(movements);

        if (movError) throw movError;
      }

      // 3. Update quote with conversion reference
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({ 
          converted_to_os_id: serviceOrder.id,
          status: 'convertido'
        })
        .eq('id', quote.id);

      if (quoteError) throw quoteError;

      return serviceOrder;
    },
    onSuccess: (serviceOrder) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ 
        title: 'Orçamento convertido!', 
        description: `OS #${serviceOrder.id} criada com sucesso.`
      });
    },
    onError: (error: any) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro na conversão', 
        description: error.message 
      });
    },
  });

  const createFinancialFromQuote = useMutation({
    mutationFn: async (quote: Quote) => {
      if (!user?.id) {
        throw new Error('Usuário não autenticado');
      }

      const { error } = await supabase.from('financial_transactions').insert({
        transaction_type: 'receita' as any,
        amount: quote.final_price || quote.total_value || 0,
        description: `Orçamento #${quote.quote_number}`,
        customer_id: quote.customer_id,
        is_paid: false,
        created_by: user.id,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Conta a receber gerada!' });
    },
    onError: (error: any) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao gerar financeiro', 
        description: error.message 
      });
    },
  });

  return {
    convertToServiceOrder,
    createFinancialFromQuote,
    isConverting: convertToServiceOrder.isPending,
    isCreatingFinancial: createFinancialFromQuote.isPending,
  };
}