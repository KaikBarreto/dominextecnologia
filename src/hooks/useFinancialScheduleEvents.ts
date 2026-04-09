import { useMemo } from 'react';
import { useFinancial } from '@/hooks/useFinancial';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

/**
 * Returns financial transactions (unpaid contas) as pseudo-ServiceOrders (entry_type: 'tarefa')
 * so they can be displayed in the schedule calendar.
 * Only returns data if user has 'fn:view_financial_schedule' permission.
 * Respects the contract-level `show_billing_in_schedule` toggle.
 */
export function useFinancialScheduleEvents() {
  const { hasPermission, hasRole } = useAuth();
  const canView = hasPermission('fn:view_financial_schedule') || hasRole('admin');

  const { transactions } = useFinancial();

  // Fetch contracts with billing visibility disabled
  const { data: hiddenContractIds = [] } = useQuery({
    queryKey: ['contracts-billing-hidden'],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase
        .from('contracts')
        .select('id')
        .eq('show_billing_in_schedule', false);
      return (data || []).map(c => c.id);
    },
    staleTime: 60_000,
  });

  const financialEvents = useMemo(() => {
    if (!canView) return [];

    return transactions
      .filter((t) => {
        if (t.is_paid || !t.due_date) return false;
        // Hide billing from contracts that have the toggle disabled
        if (t.contract_id && hiddenContractIds.includes(t.contract_id)) return false;
        return true;
      })
      .map((t) => {
        const isReceivable = t.transaction_type === 'entrada';
        const amount = Number(t.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        return {
          id: `fin-${t.id}`,
          order_number: 0,
          customer_id: t.customer_id || '',
          os_type: 'visita_tecnica',
          entry_type: 'tarefa',
          status: 'pendente',
          scheduled_date: t.due_date!,
          scheduled_time: '08:00',
          description: `${isReceivable ? '💰 A Receber' : '📋 A Pagar'}: ${t.description} — ${amount}`,
          created_at: t.created_at,
          updated_at: t.created_at,
          customer: {
            id: t.customer_id,
            name: `${isReceivable ? '💰 A Receber' : '📋 A Pagar'}`,
          },
          equipment: null,
          _isFinancialEvent: true,
          _financialType: t.transaction_type,
          service_type: {
            id: `fin-${t.transaction_type}`,
            name: isReceivable ? 'A Receber' : 'A Pagar',
            color: isReceivable ? '#22c55e' : '#ef4444',
          },
        } as any;
      });
  }, [canView, transactions, hiddenContractIds]);

  return { financialEvents, canView };
}
