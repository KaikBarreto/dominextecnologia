import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Histórico unificado de pagamentos de uma empresa (admin master Auctus):
 * pagamentos manuais (company_payments) + cobranças Asaas (subscription_payments).
 *
 * Regras de merge/dedup (espelho do EcoSistema, adaptado):
 * - Cobrança Asaas RECEIVED/CONFIRMED já espelhada em company_payments
 *   (mesmo asaas_payment_id) NÃO aparece — o registro manual/espelho representa ela.
 * - PENDING/OVERDUE sempre aparecem; CANCELLED aparece (esmaecida na UI).
 * - Manuais sempre aparecem.
 */

export interface UnifiedCompanyPayment {
  id: string;
  source: 'manual' | 'asaas';
  /** manual: 'primeira_venda' | 'renewal'; asaas: type da cobrança */
  type: string | null;
  amount: number;
  /** manual: sempre 'RECEIVED' (pago); asaas: status original (RECEIVED, PENDING, OVERDUE, CANCELLED...) */
  status: string;
  paymentMethod: string | null;
  /** ISO usado pra ordenação e exibição (manual: payment_date; asaas: paid_at ?? due_date ?? created_at) */
  date: string;
  invoiceUrl: string | null;
  notes: string | null;
}

export interface AdminPaymentDetailResponse {
  payment_source: 'manual' | 'asaas';
  payment_id: string;
  company_id: string;
  quality: 'exact' | 'partial' | 'legacy_unavailable';
  captured_at: string;
  snapshot: {
    plan?: { code?: string | null; label?: string | null } | null;
    billing_cycle?: string | null;
    users?: { limit?: number | null; extra?: number | null; extra_unit_price?: number | null } | null;
    modules?: Array<{
      code: string;
      name: string;
      quantity?: number | null;
      unit_price?: number | null;
      price_detail?: string | null;
    }>;
    promotions?: Array<{
      scope_type: string;
      module_code?: string | null;
      module_name?: string | null;
      quantity: number;
      standard_unit_price: number;
      promotional_unit_price: number;
      discount: number;
      billing_cycles: number;
      cycle_number: number;
      reason?: string | null;
    }>;
    installment?: { number: number; total: number; new_expires_at?: string | null } | null;
    amounts?: { paid?: number | null; subscription?: number | null; base?: number | null; discount?: number | null };
    change?: { kind?: string | null; credit_amount?: number | null; amount_due?: number | null } | null;
  };
  sale?: AdminSaleDetail | null;
}

export interface AdminSaleDetail {
  is_sale: true;
  payment: {
    id: string;
    source: 'manual' | 'asaas';
    type?: string | null;
    amount: number;
    payment_date?: string | null;
    created_at?: string | null;
    payment_method?: string | null;
    origin?: string | null;
    asaas_payment_id?: string | null;
    status?: string | null;
    due_date?: string | null;
    paid_at?: string | null;
    registered_by?: { id: string; name?: string | null } | null;
    fiscal?: SaleFiscal | null;
  };
  commercial_match_quality: 'date_amount' | 'unique_company_sale' | 'ambiguous' | 'none';
  commercial_candidate_count: number;
  commercial?: {
    id: string;
    seller: { id: string; name: string };
    sdr?: { id: string; name: string } | null;
    customer_origin?: string | null;
    commission_base?: number | null;
    paid_amount?: number | null;
    commission_amount?: number | null;
    seller_commission?: number | null;
    sdr_commission?: number | null;
    billing_cycle?: string | null;
    status?: string | null;
    released_at?: string | null;
    created_at?: string | null;
    registered_by?: { id: string; name?: string | null } | null;
  } | null;
  affiliate_commission?: {
    id: string;
    affiliate: { id: string; name: string };
    kind: string;
    base_amount: number;
    pct_applied: number;
    commission_amount: number;
    reference_month?: string | null;
    status: string;
    affiliate_payment_id?: string | null;
    created_at?: string | null;
  } | null;
  financial_match_quality: 'exact_reference' | 'legacy_unique_date_amount' | 'ambiguous' | 'none';
  financial_transaction?: {
    id: string;
    category?: string | null;
    amount: number;
    description?: string | null;
    notes?: string | null;
    transaction_date?: string | null;
    asaas_transaction_id?: string | null;
    created_at?: string | null;
    registered_by?: { id: string; name?: string | null } | null;
  } | null;
  processor?: {
    id: string;
    asaas_payment_id?: string | null;
    status?: string | null;
    amount?: number | null;
    billing_type?: string | null;
    billing_cycle?: string | null;
    payment_method?: string | null;
    due_date?: string | null;
    paid_at?: string | null;
    invoice_url?: string | null;
    created_at?: string | null;
    fiscal?: SaleFiscal | null;
  } | null;
}

interface SaleFiscal {
  status?: string | null;
  number?: string | null;
  invoice_id?: string | null;
  pdf_url?: string | null;
  xml_url?: string | null;
  error?: string | null;
}

const getAdminPaymentDetail = (
  functionName: 'get_admin_payment_detail',
  args: { p_company_id: string; p_payment_source: 'manual' | 'asaas'; p_payment_id: string },
): Promise<{ data: AdminPaymentDetailResponse | null; error: unknown }> =>
  supabase.rpc(functionName, args) as unknown as Promise<{
    data: AdminPaymentDetailResponse | null;
    error: unknown;
  }>;

export interface RegisterCompanyPaymentInput {
  amount: number;
  /** 'YYYY-MM-DD' */
  paymentDate: string;
  type: 'venda' | 'renovacao';
  paymentMethod: string;
  notes?: string;
  cpfCnpj?: string;
  closerId?: string;
}

const RPC_ERROR_MESSAGES: Record<string, string> = {
  acesso_negado: 'Você não tem permissão para realizar esta ação.',
  pagamento_duplicado: 'Pagamento idêntico registrado há menos de 1 minuto.',
  tipo_invalido: 'Tipo de pagamento inválido.',
  valor_invalido: 'Informe um valor maior que zero.',
  empresa_nao_encontrada: 'Empresa não encontrada.',
  pagamento_nao_encontrado: 'Pagamento não encontrado. Atualize a página e tente novamente.',
  pagamento_asaas_nao_excluivel: 'Cobranças do Asaas não podem ser excluídas por aqui.',
  pagamento_promocional_nao_e_ultimo: 'Este pagamento consumiu uma condição promocional e só pode ser excluído depois dos pagamentos posteriores.',
};

/** Traduz erros das RPCs de pagamento pra PT-BR sem expor detalhe técnico. */
export function mapPaymentRpcError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? '';
  for (const [key, friendly] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(key)) return friendly;
  }
  return getErrorMessage(error);
}

function toSortableDate(value: string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function useAdminCompanyPaymentDetail(
  companyId: string,
  payment: Pick<UnifiedCompanyPayment, 'id' | 'source'>,
) {
  return useQuery({
    queryKey: ['admin-payment-detail', companyId, payment.source, payment.id],
    queryFn: async (): Promise<AdminPaymentDetailResponse> => {
      const { data, error } = await getAdminPaymentDetail('get_admin_payment_detail', {
        p_company_id: companyId,
        p_payment_source: payment.source,
        p_payment_id: payment.id,
      });
      if (error) throw error;
      if (!data) throw new Error('payment_detail_not_found');
      return data;
    },
  });
}

export function useAdminCompanyPayments(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ['admin-company-payments', companyId],
    queryFn: async (): Promise<UnifiedCompanyPayment[]> => {
      const [manualRes, asaasRes] = await Promise.all([
        supabase
          .from('company_payments')
          .select('id, amount, payment_date, type, payment_method, notes, asaas_payment_id, created_at')
          .eq('company_id', companyId!)
          .order('payment_date', { ascending: false }),
        supabase
          .from('subscription_payments')
          .select('id, amount, status, billing_type, due_date, paid_at, invoice_url, type, payment_method, created_at, asaas_payment_id, pix_expiration_date')
          .eq('company_id', companyId!)
          .order('created_at', { ascending: false }),
      ]);
      if (manualRes.error) throw manualRes.error;
      if (asaasRes.error) throw asaasRes.error;

      const manual = manualRes.data ?? [];
      const asaas = asaasRes.data ?? [];

      // Cobranças Asaas já espelhadas em company_payments (LTV creditado via webhook).
      const mirroredAsaasIds = new Set(
        manual.map((p) => p.asaas_payment_id).filter(Boolean) as string[],
      );

      const manualItems: UnifiedCompanyPayment[] = manual.map((p) => ({
        id: p.id,
        source: 'manual',
        type: p.type,
        amount: Number(p.amount) || 0,
        status: 'RECEIVED',
        paymentMethod: p.payment_method,
        date: p.payment_date,
        invoiceUrl: null,
        notes: p.notes,
      }));

      const paymentDay = (value: string | null | undefined) => (value || '').slice(0, 10);
      const paidCandidates = [
        ...manual.map((p) => ({
          id: p.id,
          asaasPaymentId: p.asaas_payment_id,
          amount: Number(p.amount) || 0,
          day: paymentDay(p.payment_date),
        })),
        ...asaas
          .filter((p) => ['RECEIVED', 'CONFIRMED'].includes((p.status || '').toUpperCase()))
          .map((p) => ({
            id: p.id,
            asaasPaymentId: p.asaas_payment_id,
            amount: Number(p.amount) || 0,
            day: paymentDay(p.due_date ?? p.paid_at ?? p.created_at),
          })),
      ];

      const presentationStatus = (payment: (typeof asaas)[number]): string => {
        const rawStatus = (payment.status || 'PENDING').toUpperCase();
        if (!['PENDING', 'CREATED', 'OVERDUE'].includes(rawStatus)) return rawStatus;
        const referenceDay = paymentDay(payment.due_date ?? payment.created_at);
        const replaced = paidCandidates.some((paid) =>
          paid.id !== payment.id
          && paid.asaasPaymentId !== payment.asaas_payment_id
          && Math.abs(paid.amount - (Number(payment.amount) || 0)) <= 0.01
          && paid.day === referenceDay
        );
        if (replaced) return 'SUPERSEDED';
        if (payment.billing_type?.toUpperCase() === 'PIX'
          && payment.pix_expiration_date
          && new Date(payment.pix_expiration_date).getTime() < Date.now()) return 'EXPIRED';
        return rawStatus;
      };

      const asaasItems: UnifiedCompanyPayment[] = asaas
        .filter((p) => {
          const status = (p.status || '').toUpperCase();
          const isPaid = status === 'RECEIVED' || status === 'CONFIRMED';
          // Pago e espelhado → some (senão duplicaria o pagamento na lista).
          if (isPaid && p.asaas_payment_id && mirroredAsaasIds.has(p.asaas_payment_id)) return false;
          return true;
        })
        .map((p) => ({
          id: p.id,
          source: 'asaas' as const,
          type: p.type,
          amount: Number(p.amount) || 0,
          status: presentationStatus(p),
          paymentMethod: p.payment_method || p.billing_type,
          date: p.paid_at ?? p.due_date ?? p.created_at,
          invoiceUrl: p.invoice_url,
          notes: null,
        }));

      return [...manualItems, ...asaasItems].sort(
        (a, b) => toSortableDate(b.date) - toSortableDate(a.date),
      );
    },
    enabled: !!companyId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-company-payments', companyId] });
    queryClient.invalidateQueries({ queryKey: ['admin-company', companyId] });
    queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    queryClient.invalidateQueries({ queryKey: ['subscription_history', companyId] });
    queryClient.invalidateQueries({ queryKey: ['admin-company-subscription-promotions', companyId] });
  };

  const registerPayment = useMutation({
    mutationFn: async (input: RegisterCompanyPaymentInput) => {
      const { data, error } = await supabase.rpc('register_manual_company_payment', {
        p_company_id: companyId!,
        p_amount: input.amount,
        p_payment_date: input.paymentDate,
        p_type: input.type,
        p_payment_method: input.paymentMethod,
        p_notes: input.notes || undefined,
        p_cpf_cnpj: input.cpfCnpj || undefined,
        p_closer_id: input.closerId || undefined,
        // `p_sdr_id` não é mais enviado (CEO, 2026-10-14: fim do Closer+SDR no
        // registro de pagamento). A RPC tem `p_sdr_id uuid DEFAULT NULL`, então
        // omitir é seguro e o vendedor leva 100% da comissão da 1ª venda.
      });
      if (error) throw error;

      // O trigger do pagamento já consome a cobrança promocional de forma
      // atômica. Se isso gerou uma virada de preço, tentamos sincronizar a
      // recorrência agora; falhar aqui NÃO desfaz nem repete o pagamento.
      const { data: pendingSync, error: pendingSyncError } = await supabase
        .from('company_subscription_price_sync')
        .select('status')
        .eq('company_id', companyId!)
        .in('status', ['pending', 'failed'])
        .maybeSingle();

      let syncWarning: string | null = null;
      if (pendingSyncError) {
        syncWarning = 'O pagamento foi registrado, mas não foi possível conferir a atualização da cobrança automática.';
      } else if (pendingSync) {
        const { data: syncResult, error: syncError } = await supabase.functions.invoke(
          'sync-company-subscription-price',
          { body: { company_id: companyId } },
        );
        if (syncError || syncResult?.success === false) {
          syncWarning = syncResult?.warning
            || 'O pagamento foi registrado, mas a cobrança automática ainda precisa ser sincronizada.';
        }
      }

      return { paymentId: data, syncWarning };
    },
    onSuccess: invalidateAll,
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.rpc('delete_company_payment_with_rollback', {
        p_payment_id: paymentId,
      });
      if (error) throw error;

      const { data: pendingSync, error: pendingSyncError } = await supabase
        .from('company_subscription_price_sync')
        .select('status')
        .eq('company_id', companyId!)
        .in('status', ['pending', 'failed'])
        .maybeSingle();

      let syncWarning: string | null = null;
      if (pendingSyncError) {
        syncWarning = 'O pagamento foi excluído, mas não foi possível conferir a atualização da cobrança automática.';
      } else if (pendingSync) {
        const { data: syncResult, error: syncError } = await supabase.functions.invoke(
          'sync-company-subscription-price',
          { body: { company_id: companyId } },
        );
        if (syncError || syncResult?.success === false) {
          syncWarning = syncResult?.warning
            || 'O pagamento foi excluído, mas a cobrança automática ainda precisa ser sincronizada.';
        }
      }
      return { syncWarning };
    },
    onSuccess: invalidateAll,
  });

  return {
    payments: paymentsQuery.data ?? [],
    isLoading: paymentsQuery.isLoading,
    registerPayment,
    deletePayment,
  };
}
