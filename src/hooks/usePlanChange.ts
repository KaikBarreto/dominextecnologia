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
}

/**
 * Muda o plano/módulos da assinatura SaaS do tenant via edge function
 * `change-subscription-plan` (service_role, valida posse).
 *
 * A edge decide upgrade vs downgrade vs igual server-side comparando com o valor
 * efetivo atual e aplica B1 (upgrade entra já na próxima cobrança, atualiza Asaas)
 * ou B2 (downgrade agenda o valor menor pro próximo ciclo, sem cortar acesso).
 *
 * Invalida tudo que reflete o estado da assinatura no app e no painel master.
 */
export function usePlanChange() {
  const queryClient = useQueryClient();

  return useMutation<ChangePlanResult, Error, ChangePlanInput>({
    mutationFn: async ({ companyId, planCode, billingCycle, customModules, extraUsers }) => {
      const { data, error } = await supabase.functions.invoke('change-subscription-plan', {
        body: {
          company_id: companyId,
          plan_code: planCode,
          billing_cycle: billingCycle,
          custom_modules: customModules ?? undefined,
          extra_users: extraUsers ?? undefined,
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
