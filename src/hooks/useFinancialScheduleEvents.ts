import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduleOrdersWindow } from '@/hooks/useScheduleOrders';
import type { ServiceOrder } from '@/types/database';
import { fetchAllPaginated } from '@/utils/supabasePagination';

type FinancialScheduleEvent = ServiceOrder & {
  customer: NonNullable<ServiceOrder['customer']>;
  equipment: null;
  _realFinancialId?: string;
  _isFinancialEvent: true;
  _isCardBillEvent?: boolean;
  _billId?: string;
  _financialType: 'entrada' | 'saida';
  _contractId: string | null;
  _installmentGroupId: string | null;
  _assignee_user_ids: string[];
  _assignees: [];
};

/**
 * Vencimentos financeiros exibidos como tarefas na Agenda.
 *
 * Diferente do hook financeiro geral, esta consulta traz apenas a janela civil
 * que já está na tela. Assim a Agenda não baixa o histórico contábil, o resumo
 * financeiro e todas as faturas antes de mostrar o calendário.
 */
export function useFinancialScheduleEvents(window: ScheduleOrdersWindow) {
  const { hasPermission, hasRole, profile } = useAuth();
  const canView = hasPermission('fn:view_financial_schedule') || hasRole('admin');
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: ['financial-schedule-events', companyId, window.startDate, window.endDate],
    enabled: canView && !!companyId && !!window.startDate && !!window.endDate,
    queryFn: async () => {
      const [transactions, bills] = await Promise.all([
        fetchAllPaginated(() => supabase
          .from('financial_transactions')
          .select(`
            id,
            customer_id,
            transaction_type,
            amount,
            description,
            due_date,
            created_at,
            contract_id,
            installment_group_id,
            credit_card_bill_date,
            billing_reminder_resolved_at,
            customer:customers(id, name)
          `)
          .eq('is_paid', false)
          .is('parent_transaction_id', null)
          .is('cancelled_at', null)
          .is('credit_card_bill_date', null)
          .gte('due_date', window.startDate)
          .lte('due_date', window.endDate)
          .order('id')),
        fetchAllPaginated(() => supabase
          .from('credit_card_bills')
          .select('id, account_id, reference_month, due_date, status, amount_paid')
          .neq('status', 'paid')
          .gte('due_date', window.startDate)
          .lte('due_date', window.endDate)
          .order('id')),
      ]);

      const contractIds = [...new Set(
        transactions.map((transaction) => transaction.contract_id).filter((id): id is string => !!id),
      )];
      const accountIds = [...new Set(bills.map((bill) => bill.account_id))];
      const referenceMonths = [...new Set(bills.map((bill) => bill.reference_month))];

      const accountChunks: string[][] = [];
      for (let index = 0; index < accountIds.length; index += 100) {
        accountChunks.push(accountIds.slice(index, index + 100));
      }

      const billTransactionPromise = (async () => {
        if (accountChunks.length === 0 || referenceMonths.length === 0) return [];

        const rows: Array<{
          id: string;
          account_id: string | null;
          credit_card_bill_date: string | null;
          amount: number;
        }> = [];
        for (let index = 0; index < accountChunks.length; index += 4) {
          const batch = await Promise.all(
            accountChunks.slice(index, index + 4).map((ids) => fetchAllPaginated(() => supabase
              .from('financial_transactions')
              .select('id, account_id, credit_card_bill_date, amount')
              .eq('transaction_type', 'saida')
              .is('cancelled_at', null)
              .in('account_id', ids)
              .in('credit_card_bill_date', referenceMonths)
              .order('id'))),
          );
          rows.push(...batch.flat());
        }
        return rows;
      })();

      const [contracts, accounts, billTransactions] = await Promise.all([
        contractIds.length > 0
          ? fetchAllPaginated(() => supabase
              .from('contracts')
              .select('id, show_billing_in_schedule, billing_responsible_ids')
              .in('id', contractIds)
              .order('id'))
          : Promise.resolve([]),
        accountIds.length > 0
          ? fetchAllPaginated(() => supabase
              .from('financial_accounts')
              .select('id, name')
              .in('id', accountIds)
              .order('id'))
          : Promise.resolve([]),
        billTransactionPromise,
      ]);

      return {
        transactions,
        bills,
        billTransactions,
        contracts,
        accounts,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const financialEvents = useMemo(() => {
    if (!canView || !query.data) return [];

    const hiddenContractIds = new Set(
      query.data.contracts
        .filter((contract) => contract.show_billing_in_schedule === false)
        .map((contract) => contract.id),
    );
    const contractBillingMap = new Map<string, string[]>();
    for (const contract of query.data.contracts) {
      const responsibleIds = Array.isArray(contract.billing_responsible_ids)
        ? contract.billing_responsible_ids.filter((id): id is string => typeof id === 'string')
        : [];
      if (responsibleIds.length > 0) contractBillingMap.set(contract.id, responsibleIds);
    }

    const transactionEvents = query.data.transactions
      .filter((transaction) => {
        if (!transaction.due_date || transaction.credit_card_bill_date) return false;
        if (transaction.contract_id && hiddenContractIds.has(transaction.contract_id)) return false;
        return true;
      })
      .map((transaction) => {
        const isReceivable = transaction.transaction_type === 'entrada';
        const amount = Number(transaction.amount || 0).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        const label = `${isReceivable ? 'A Receber' : 'A Pagar'}: ${transaction.description} — ${amount}`;

        return {
          id: `fin-${transaction.id}`,
          _realFinancialId: transaction.id,
          order_number: 0,
          customer_id: transaction.customer_id || '',
          os_type: 'visita_tecnica',
          entry_type: 'tarefa',
          task_title: label,
          status: transaction.billing_reminder_resolved_at ? 'concluida' : 'pendente',
          scheduled_date: transaction.due_date,
          scheduled_time: '08:00',
          description: label,
          created_at: transaction.created_at,
          updated_at: transaction.created_at,
          customer: transaction.customer ?? {
            id: transaction.customer_id,
            name: isReceivable ? 'A Receber' : 'A Pagar',
          },
          equipment: null,
          _isFinancialEvent: true,
          _financialType: transaction.transaction_type,
          _contractId: transaction.contract_id || null,
          _installmentGroupId: transaction.installment_group_id || null,
          _assignee_user_ids: transaction.contract_id
            ? contractBillingMap.get(transaction.contract_id) ?? []
            : [],
          _assignees: [],
          service_type: null,
        } as unknown as FinancialScheduleEvent;
      });

    const accountNameById = new Map(query.data.accounts.map((account) => [account.id, account.name]));
    const totalByBillKey = new Map<string, number>();
    for (const transaction of query.data.billTransactions) {
      if (!transaction.account_id || !transaction.credit_card_bill_date) continue;
      const key = `${transaction.account_id}__${transaction.credit_card_bill_date}`;
      totalByBillKey.set(key, (totalByBillKey.get(key) ?? 0) + Number(transaction.amount || 0));
    }

    const billEvents = query.data.bills.flatMap((bill) => {
      const total = totalByBillKey.get(`${bill.account_id}__${bill.reference_month}`) ?? 0;
      const owed = total - Number(bill.amount_paid ?? 0);
      if (owed <= 0) return [];
      const amount = owed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const cardName = accountNameById.get(bill.account_id) || 'Cartão';
      const label = `A Pagar: Fatura ${cardName} — ${amount}`;

      return [{
        id: `bill-${bill.id}`,
        order_number: 0,
        customer_id: '',
        os_type: 'visita_tecnica',
        entry_type: 'tarefa',
        task_title: label,
        status: 'pendente',
        scheduled_date: bill.due_date,
        scheduled_time: '08:00',
        description: label,
        created_at: bill.due_date,
        updated_at: bill.due_date,
        customer: { id: '', name: 'A Pagar' },
        equipment: null,
        _isFinancialEvent: true,
        _isCardBillEvent: true,
        _billId: bill.id,
        _financialType: 'saida',
        _contractId: null,
        _installmentGroupId: null,
        _assignee_user_ids: [],
        _assignees: [],
        service_type: null,
      } as unknown as FinancialScheduleEvent];
    });

    return [...transactionEvents, ...billEvents];
  }, [canView, query.data]);

  return {
    financialEvents,
    canView,
    isLoading: query.isLoading,
  };
}
