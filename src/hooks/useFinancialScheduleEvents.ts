import { useMemo } from 'react';
import { useFinancial } from '@/hooks/useFinancial';
import { useAuth } from '@/contexts/AuthContext';
import type { ServiceOrder } from '@/types/database';

/**
 * Returns financial transactions (unpaid contas) as pseudo-ServiceOrders
 * so they can be displayed in the schedule calendar.
 * Only returns data if user has 'fn:view_financial_schedule' permission.
 */
export function useFinancialScheduleEvents() {
  const { hasPermission, hasRole } = useAuth();
  const canView = hasPermission('fn:view_financial_schedule') || hasRole('admin');

  const { transactions } = useFinancial();

  const financialEvents = useMemo(() => {
    if (!canView) return [];

    // Get unpaid transactions with due_date
    return transactions
      .filter((t) => !t.is_paid && t.due_date)
      .map((t) => {
        const isReceivable = t.transaction_type === 'entrada';
        const amount = Number(t.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        return {
          id: `fin-${t.id}`,
          order_number: 0,
          customer_id: t.customer_id || '',
          os_type: 'visita_tecnica',
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
  }, [canView, transactions]);

  return { financialEvents, canView };
}
