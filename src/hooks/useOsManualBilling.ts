import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useAuth } from '@/contexts/AuthContext';
import { resolveSystemCategoryNameFresh } from '@/hooks/useFinancialCategories';
import type { ReceivePaymentResult } from '@/components/financial/ReceivePaymentModal';
import { OS_COMMERCIAL_KEY } from './useOsCommercial';
import type { OsReceivable } from '@/lib/osCommercial';

export function useOsManualBilling(osId: string, enabled: boolean) {
  const { companyId } = useUserCompany();
  const { user } = useAuth();
  const client = useQueryClient();
  const request = useRef<{ signature: string; id: string; args: Record<string, unknown> } | null>(null);
  const complementRequest = useRef<{ signature: string; id: string; args: Record<string, unknown> } | null>(null);
  const query = useQuery({ queryKey: ['service-orders', 'receivables', companyId, user?.id, osId], enabled: enabled && !!companyId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_os_manual_receivables', { p_os_id: osId });
      if (error) throw error;
      return data as unknown as OsReceivable[];
    } });
  const invalidate = () => Promise.all([
    ['quotes'], ['service-orders'], ['service-order-budget'], [OS_COMMERCIAL_KEY, osId],
    ['financial-transactions'], ['financial-summary'], ['portal-payments'], ['account-balances'], ['dashboard-stats'],
    ['os-billing-state'], ['os-billing-flags'], ['os-revenue-summary'],
    ['pdv-cofre-balance'], ['pdv-cash-session-detail'], ['pdv-cash-sessions-v2'], ['nfse-auto-readiness'],
  ].map(queryKey => client.invalidateQueries({ queryKey })));
  const complement = async (total: number, billed: number, dueDate: string) => {
    if (!companyId || !user) throw new Error('Sessão indisponível.');
    const category = await resolveSystemCategoryNameFresh(client, companyId, 'service_revenue');
    const signature = JSON.stringify([companyId, user.id, osId, total, billed, dueDate]);
    if (complementRequest.current?.signature !== signature) complementRequest.current = {
      signature, id: crypto.randomUUID(), args: { p_os_id: osId, p_expected_total: total, p_expected_billed: billed, p_due_date: dueDate, p_category: category },
    };
    const { data, error } = await supabase.rpc('complement_os_manual_billing', {
      ...complementRequest.current.args, p_request_id: complementRequest.current.id,
    } as { p_os_id: string; p_request_id: string; p_expected_total: number; p_expected_billed: number; p_due_date: string; p_category: string });
    if (error) {
      if (/^[A-Z0-9]{5}$/.test(error.code ?? '')) complementRequest.current = null;
      throw error;
    }
    complementRequest.current = null;
    await invalidate();
    return data;
  };
  const receive = async (total: number, payment: ReceivePaymentResult | null, dueDate: string, parent?: NonNullable<typeof query.data>[number]) => {
    if (!companyId || !user) throw new Error('Sessão indisponível.');
    const [category, feeCategory] = await Promise.all([
      resolveSystemCategoryNameFresh(client, companyId, 'service_revenue'),
      payment?.fee_amount ? resolveSystemCategoryNameFresh(client, companyId, 'receipt_fee') : Promise.resolve(null),
    ]);
    const args = { p_os_id: osId, p_total: total, p_transaction_id: parent?.id ?? null,
      p_expected_received: parent?.amount_received ?? null,
      p_received: payment ? payment.amount_received ?? (parent ? parent.amount - parent.amount_received : total) : 0,
      p_account_id: payment?.account_id ?? null, p_method: payment?.payment_method ?? null,
      p_paid_date: payment?.paid_date ?? null, p_due_date: payment?.new_due_date ?? dueDate,
      p_category: category, p_fee: payment?.fee_amount ?? 0, p_fee_category: feeCategory, p_notes: payment?.notes ?? null };
    // A atualização do saldo após timeout não muda o pedido que está sendo
    // reconciliado. Reenvia os mesmos valores e a mesma base confirmada.
    const { p_expected_received: _expected, p_category: _category, p_fee_category: _feeCategory, ...intent } = args;
    const signature = JSON.stringify([companyId, user.id, intent]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID(), args };
    const { data, error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>)('bill_os_receive_payment', { ...request.current.args, p_request_id: request.current.id });
    if (error) {
      // Código SQL conhecido confirma rollback; falha de transporte mantém o pedido.
      if (/^[A-Z0-9]{5}$/.test((error as { code?: string }).code ?? '')) request.current = null;
      throw error;
    }
    request.current = null;
    await invalidate();
    return data;
  };
  return { ...query, receive, complement };
}
