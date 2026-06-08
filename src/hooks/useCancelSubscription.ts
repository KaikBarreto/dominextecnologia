import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CancelSubscriptionInput {
  companyId: string;
  reason: string;
  reasonDetails?: string | null;
}

/**
 * Cancela a recorrência da assinatura SaaS Auctus de uma empresa.
 *
 * Chama as DUAS edge functions em sequência (igual ao fluxo de referência):
 *  1. `cancel-asaas-subscription` — para a recorrência na Asaas (sub_* / aut_*),
 *     zera companies.asaas_subscription_id e registra em
 *     subscription_cancellation_requests. NÃO corta o acesso na hora:
 *     o cliente mantém acesso até subscription_expires_at.
 *  2. `cancel-pending-asaas-payments` — apaga cobranças PENDING/OVERDUE futuras
 *     pra evitar PIX automático saindo depois.
 *
 * Ambas validam server-side (própria empresa OU super_admin via has_role).
 * A função 2 é best-effort: se falhar, o cancelamento da recorrência (passo 1)
 * já garante que não haverá renovação — não fingimos sucesso só nela.
 */
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, reason, reasonDetails }: CancelSubscriptionInput) => {
      // 1. Para a recorrência (e registra o pedido de cancelamento server-side).
      const { error: cancelError } = await supabase.functions.invoke('cancel-asaas-subscription', {
        body: {
          company_id: companyId,
          reason,
          reason_details: reasonDetails || null,
        },
      });
      if (cancelError) throw cancelError;

      // 2. Limpa cobranças pendentes/futuras. Best-effort: erro aqui não derruba o fluxo.
      try {
        const { error: pendingError } = await supabase.functions.invoke('cancel-pending-asaas-payments', {
          body: { company_id: companyId },
        });
        if (pendingError) {
          console.warn('Falha ao limpar cobranças pendentes (seguindo fluxo):', pendingError);
        }
      } catch (err) {
        console.warn('Falha ao limpar cobranças pendentes (seguindo fluxo):', err);
      }
    },
    onSuccess: () => {
      // Invalida tudo que reflete o estado da assinatura no app e no painel master.
      queryClient.invalidateQueries({ queryKey: ['my-company'] });
      queryClient.invalidateQueries({ queryKey: ['company-trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['company-modules'] });
      queryClient.invalidateQueries({ queryKey: ['admin-company'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies-list'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-history'] });
    },
  });
}
