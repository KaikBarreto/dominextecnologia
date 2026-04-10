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

  // Fetch contracts with billing visibility disabled + billing responsible ids
  const { data: contractsData = [] } = useQuery({
    queryKey: ['contracts-billing-config'],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase
        .from('contracts')
        .select('id, show_billing_in_schedule, billing_responsible_ids');
      return data || [];
    },
    staleTime: 60_000,
  });

  const hiddenContractIds = useMemo(() => 
    contractsData.filter(c => c.show_billing_in_schedule === false).map(c => c.id),
    [contractsData]
  );

  const contractBillingMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of contractsData) {
      if (c.billing_responsible_ids && (c.billing_responsible_ids as string[]).length > 0) {
        map[c.id] = c.billing_responsible_ids as string[];
      }
    }
    return map;
  }, [contractsData]);

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
        
        // Get billing responsible ids from contract if available
        const billingIds = t.contract_id ? (contractBillingMap[t.contract_id] || []) : [];
        
        return {
          id: `fin-${t.id}`,
          _realFinancialId: t.id,
          order_number: 0,
          customer_id: t.customer_id || '',
          os_type: 'visita_tecnica',
          entry_type: 'tarefa',
          task_title: `${isReceivable ? 'A Receber' : 'A Pagar'}: ${t.description} — ${amount}`,
          status: 'pendente',
          scheduled_date: t.due_date!,
          scheduled_time: '08:00',
          description: `${isReceivable ? 'A Receber' : 'A Pagar'}: ${t.description} — ${amount}`,
          created_at: t.created_at,
          updated_at: t.created_at,
          customer: {
            id: t.customer_id,
            name: isReceivable ? 'A Receber' : 'A Pagar',
          },
          equipment: null,
          _isFinancialEvent: true,
          _financialType: t.transaction_type,
          _contractId: t.contract_id || null,
          _installmentGroupId: t.installment_group_id || null,
          _assignee_user_ids: billingIds,
          _assignees: [],
          service_type: null,
        } as any;
      });
  }, [canView, transactions, hiddenContractIds, contractBillingMap]);

  return { financialEvents, canView };
}
