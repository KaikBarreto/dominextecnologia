import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Histórico de pagamentos da assinatura SaaS (Auctus) para o TENANT logado.
 *
 * Lê apenas `subscription_payments` — a RLS já restringe à própria empresa
 * (company_id = empresa do usuário). NÃO lê `company_payments` (admin-only no
 * Dominex), então não há dedup entre tabelas como no EcoSistema.
 *
 * Hook é a fronteira do Supabase: a página nunca chama `supabase.from(...)`.
 */

export type SubscriptionPaymentStatus =
  | 'PENDING'
  | 'OVERDUE'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'CANCELLED'
  | string;

export type SubscriptionPaymentBillingType =
  | 'PIX'
  | 'BOLETO'
  | 'CREDIT_CARD'
  | string;

export type SubscriptionPaymentType = 'primeira_venda' | 'renovacao' | string;

export interface SubscriptionPaymentHistoryItem {
  id: string;
  amount: number;
  status: SubscriptionPaymentStatus;
  billingType: SubscriptionPaymentBillingType | null;
  billingCycle: string | null;
  type: SubscriptionPaymentType | null;
  /** Data de referência para exibição/ordenação: paid_at quando pago, senão created_at. */
  date: string;
  createdAt: string;
  paidAt: string | null;
  dueDate: string | null;
  invoiceUrl: string | null;
}

interface UseSubscriptionPaymentHistoryOptions {
  /**
   * Empresa do tenant. Se a página já resolveu (ex.: Billing.tsx), passe aqui
   * pra evitar um segundo lookup em profiles. Se omitido, o hook resolve
   * sozinho via auth + profiles.
   */
  companyId?: string | null;
}

export function useSubscriptionPaymentHistory(
  options: UseSubscriptionPaymentHistoryOptions = {},
) {
  const { user } = useAuth();
  const { companyId: companyIdOption } = options;

  return useQuery({
    queryKey: ['subscription-payment-history', companyIdOption ?? user?.id ?? null],
    enabled: !!user && (companyIdOption !== null),
    queryFn: async (): Promise<SubscriptionPaymentHistoryItem[]> => {
      let companyId = companyIdOption ?? null;

      if (!companyId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user!.id)
          .single();
        companyId = profile?.company_id ?? null;
      }

      if (!companyId) return [];

      const { data, error } = await supabase
        .from('subscription_payments')
        .select(
          'id, amount, status, billing_type, billing_cycle, type, created_at, paid_at, due_date, invoice_url',
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        status: p.status,
        billingType: p.billing_type,
        billingCycle: p.billing_cycle,
        type: p.type,
        date: p.paid_at || p.created_at,
        createdAt: p.created_at,
        paidAt: p.paid_at,
        dueDate: p.due_date,
        invoiceUrl: p.invoice_url,
      }));
    },
  });
}
