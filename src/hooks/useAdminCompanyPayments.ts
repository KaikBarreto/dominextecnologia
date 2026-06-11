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

export interface RegisterCompanyPaymentInput {
  amount: number;
  /** 'YYYY-MM-DD' */
  paymentDate: string;
  type: 'venda' | 'renovacao';
  paymentMethod: string;
  notes?: string;
  cpfCnpj?: string;
  closerId?: string;
  sdrId?: string;
}

const RPC_ERROR_MESSAGES: Record<string, string> = {
  acesso_negado: 'Você não tem permissão para realizar esta ação.',
  pagamento_duplicado: 'Pagamento idêntico registrado há menos de 1 minuto.',
  tipo_invalido: 'Tipo de pagamento inválido.',
  valor_invalido: 'Informe um valor maior que zero.',
  empresa_nao_encontrada: 'Empresa não encontrada.',
  pagamento_nao_encontrado: 'Pagamento não encontrado. Atualize a página e tente novamente.',
  pagamento_asaas_nao_excluivel: 'Cobranças do Asaas não podem ser excluídas por aqui.',
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
          .select('id, amount, status, billing_type, due_date, paid_at, invoice_url, type, payment_method, created_at, asaas_payment_id')
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
          status: (p.status || '').toUpperCase(),
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
        p_sdr_id: input.sdrId || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAll,
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.rpc('delete_company_payment_with_rollback', {
        p_payment_id: paymentId,
      });
      if (error) throw error;
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
