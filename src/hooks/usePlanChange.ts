import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChangePlanInput {
  companyId: string;
  /** 'start' | 'avancado' | 'master' | 'personalizado' */
  planCode: string;
  billingCycle: 'monthly' | 'yearly';
  /** Só no personalizado: lista de module_codes escolhidos (basic é garantido server-side). */
  customModules?: string[];
  /** Só no personalizado: nº de usuários extras. */
  extraUsers?: number;
  /** Nível de NFS-e escolhido quando o plano personalizado inclui o módulo. */
  nfseTier?: number;
  confirm?: boolean;
}

export interface ChangePlanResult {
  success: boolean;
  change_kind: 'upgrade' | 'downgrade' | 'igual';
  message: string;
  new_value?: number;
  scheduled_value?: number;
  current_value?: number;
  max_users?: number;
  modules?: string[];
  asaas_updated?: boolean;
  asaas_warning?: string | null;
  requires_payment?: boolean;
  change_request_id?: string;
  checkout_url?: string;
  amount_due?: number;
  credit_amount?: number;
  remaining_ratio?: number;
  next_renewal_at?: string;
  dry_run?: boolean;
  target_monthly_value?: number;
  target_plan_code?: string;
  target_billing_cycle?: 'monthly' | 'yearly';
  target_max_users?: number;
  target_modules?: string[];
  /**
   * Pendências de gravação NÃO-fatais na edge (ex.: o histórico da assinatura não
   * gravou). O valor/plano já foi aplicado; isto existe pra que "sucesso com
   * pendência" não se confunda com sucesso limpo. Diagnóstico, não copy de tela:
   * a edge só inclui a chave quando há algo a avisar.
   */
  warnings?: string[];
}

/**
 * Muda o plano/módulos da assinatura SaaS do tenant via edge function
 * `change-subscription-plan` (service_role, valida posse).
 *
 * A edge decide upgrade vs downgrade vs igual server-side comparando com o valor
 * efetivo atual. Upgrade ativo gera uma cotação proporcional e segue para o
 * checkout; downgrade agenda o alvo para o próximo ciclo, sem cortar acesso.
 *
 * Invalida tudo que reflete o estado da assinatura no app e no painel master.
 */
export function usePlanChange() {
  const queryClient = useQueryClient();

  return useMutation<ChangePlanResult, Error, ChangePlanInput>({
    mutationFn: async ({ companyId, planCode, billingCycle, customModules, extraUsers, nfseTier, confirm }) => {
      const { data, error } = await supabase.functions.invoke('change-subscription-plan', {
        body: {
          company_id: companyId,
          plan_code: planCode,
          billing_cycle: billingCycle,
          custom_modules: customModules ?? undefined,
          extra_users: extraUsers ?? undefined,
          nfse_tier: nfseTier ?? undefined,
          confirm: confirm === true,
        },
      });
      if (error) {
        // A edge devolve { error: "<mensagem PT-BR>" } em falhas de validação/permissão.
        const ctxMsg = (error as { context?: { error?: string } })?.context?.error;
        throw new Error(ctxMsg || error.message || 'Não foi possível atualizar o plano.');
      }
      if (data?.error) throw new Error(data.error);
      return data as ChangePlanResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-company'] });
      queryClient.invalidateQueries({ queryKey: ['company-modules'] });
      queryClient.invalidateQueries({ queryKey: ['company-modules-info'] });
      queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-modules'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-history'] });
      queryClient.invalidateQueries({ queryKey: ['admin-company'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies-list'] });
    },
  });
}
