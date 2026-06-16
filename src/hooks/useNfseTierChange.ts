import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChangeNfseTierInput {
  companyId: string;
  /** Nível de destino (1..4). A edge só permite upgrade (target > atual). */
  targetTier: number;
}

export interface ChangeNfseTierResult {
  ok: boolean;
  tier: number;
  new_subscription_value: number;
  asaas_updated?: boolean;
  asaas_warning?: string;
  message: string;
}

/**
 * Sobe o NÍVEL do módulo de Notas Fiscais (NFS-e) do tenant via edge function
 * `change-nfse-tier` (service_role, valida posse/super_admin).
 *
 * A edge aplica o upgrade imediatamente (cota maior já liberada), ajusta o valor da
 * assinatura (delta entre os preços dos níveis) e sincroniza o Asaas. Downgrade está
 * fora de escopo — a edge rejeita com `invalid_tier_change`. Se o módulo `nfe` não
 * estiver ativo, rejeita com `module_not_active` (é caso de contratar o módulo).
 *
 * Invalida o estado de módulos/assinatura e o medidor de cota (Fase 3).
 */
export function useNfseTierChange() {
  const queryClient = useQueryClient();

  const mutation = useMutation<ChangeNfseTierResult, Error, ChangeNfseTierInput>({
    mutationFn: async ({ companyId, targetTier }) => {
      const { data, error } = await supabase.functions.invoke('change-nfse-tier', {
        body: { company_id: companyId, target_tier: targetTier },
      });
      if (error) {
        // FunctionsHttpError → `.context` é o `Response` original; lê o corpo JSON
        // pra extrair a mensagem PT-BR do edge (ex: "não é o responsável pela
        // assinatura"). Sem isso, cairia no fallback genérico em inglês.
        const resp = (error as { context?: Response })?.context;
        let bodyMsg: string | undefined;
        try {
          const body = (await resp?.json?.()) as { message?: string; error?: string } | undefined;
          bodyMsg = body?.message || body?.error;
        } catch {
          /* corpo não-JSON — usa o fallback abaixo */
        }
        throw new Error(
          bodyMsg || error.message || 'Não foi possível atualizar o nível de Notas Fiscais.',
        );
      }
      if (data?.error) throw new Error(data.message || data.error);
      return data as ChangeNfseTierResult;
    },
    onSuccess: (_data, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['company-modules', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-modules-info', companyId] });
      queryClient.invalidateQueries({ queryKey: ['my-company'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-history'] });
      // Medidor de consumo de NFS-e (Fase 3) — atualiza o selo após o upgrade.
      queryClient.invalidateQueries({ queryKey: ['nfse-quota', companyId] });
    },
  });

  return { changeTier: mutation.mutateAsync, isChanging: mutation.isPending, result: mutation.data };
}
