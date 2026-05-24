import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que orquestra "Zerar Sistema" — feature destrutiva da aba Empresa.
 *
 * Pipeline:
 *  1. `reset_system_audit_start(p_company_id, p_options)` → retorna `audit_id`.
 *  2. Loop sequencial de `reset_system_step(p_company_id, p_step, p_audit_id)`
 *     respeitando a ordem do plano §6.3 (FK dependencies).
 *  3. `queryClient.invalidateQueries()` (sem filtro) ao fim — reset radical.
 *
 * Erros: re-throw com `step` anexado pro toast da UI dizer "Erro na etapa X".
 *
 * Plano: docs/planos/2026-05-23-zerar-sistema.md §6.3
 * Permission spec: docs/planos/2026-05-23-zerar-sistema-permissions.md
 */

export interface ResetOptions {
  delete_customers: boolean;
  delete_equipment: boolean;
  delete_quotes: boolean;
  delete_contracts: boolean;
  delete_service_orders: boolean;
  delete_materials: boolean;
  delete_stock: boolean;
  delete_financial_movements: boolean;
  delete_financial_categories: boolean;
  delete_employees: boolean;
  delete_custom_configs: boolean;
}

export type ResetStep =
  | 'service_orders'
  | 'contracts'
  | 'quotes'
  | 'equipment'
  | 'custom_configs'
  | 'financial_movements'
  | 'financial_categories'
  | 'employees'
  | 'stock'
  | 'materials'
  | 'customers';

/**
 * Ordem de execução (do plano §6.3 — RESPEITAR esta ordem por causa de FKs).
 * Cada par mapeia o step ao flag correspondente em `ResetOptions`.
 */
const PIPELINE: ReadonlyArray<{ step: ResetStep; flag: keyof ResetOptions }> = [
  { step: 'service_orders', flag: 'delete_service_orders' },
  { step: 'contracts', flag: 'delete_contracts' },
  { step: 'quotes', flag: 'delete_quotes' },
  { step: 'equipment', flag: 'delete_equipment' },
  { step: 'custom_configs', flag: 'delete_custom_configs' },
  { step: 'financial_movements', flag: 'delete_financial_movements' },
  { step: 'financial_categories', flag: 'delete_financial_categories' },
  { step: 'employees', flag: 'delete_employees' },
  { step: 'stock', flag: 'delete_stock' },
  { step: 'materials', flag: 'delete_materials' },
  { step: 'customers', flag: 'delete_customers' },
];

export interface ResetStepError extends Error {
  step?: ResetStep;
  code?: string;
}

export interface UseResetSystemReturn {
  reset: (companyId: string, options: ResetOptions) => Promise<void>;
  isLoading: boolean;
  currentStep: ResetStep | null;
  currentStepIndex: number;
  totalSteps: number;
  error: ResetStepError | null;
}

export function useResetSystem(): UseResetSystemReturn {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<ResetStep | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [totalSteps, setTotalSteps] = useState<number>(0);

  const mutation = useMutation({
    mutationFn: async ({
      companyId,
      options,
    }: {
      companyId: string;
      options: ResetOptions;
    }) => {
      // Filtra steps marcados, mantendo a ordem do PIPELINE (FK-safe).
      const stepsToRun = PIPELINE.filter((p) => options[p.flag]);

      if (stepsToRun.length === 0) {
        throw new Error('Selecione pelo menos um item pra apagar.');
      }

      setTotalSteps(stepsToRun.length);
      setCurrentStepIndex(-1);
      setCurrentStep(null);

      // 1. Audit start — registra a tentativa antes de qualquer DELETE.
      const { data: auditId, error: auditError } = await supabase.rpc(
        'reset_system_audit_start',
        {
          p_company_id: companyId,
          p_options: options as unknown as Record<string, unknown>,
        },
      );

      if (auditError) {
        const err: ResetStepError = new Error(auditError.message);
        err.code = (auditError as { code?: string }).code;
        throw err;
      }

      if (!auditId) {
        throw new Error('Não foi possível iniciar a auditoria. Tente novamente.');
      }

      // 2. Loop sequencial dos steps (FK order). Cada step é idempotente.
      for (let i = 0; i < stepsToRun.length; i++) {
        const { step } = stepsToRun[i];
        setCurrentStepIndex(i);
        setCurrentStep(step);

        const { error: stepError } = await supabase.rpc('reset_system_step', {
          p_audit_id: auditId as string,
          p_company_id: companyId,
          p_step: step,
        });

        if (stepError) {
          const err: ResetStepError = new Error(stepError.message);
          err.code = (stepError as { code?: string }).code;
          err.step = step;
          throw err;
        }
      }

      return { auditId: auditId as string, stepsRun: stepsToRun.length };
    },
    onSettled: () => {
      // Reset local state independente de sucesso/erro pra não ficar travado.
      setCurrentStep(null);
      setCurrentStepIndex(-1);
      setTotalSteps(0);
    },
    onSuccess: () => {
      // Reset radical — invalida TUDO. Mais seguro que tentar enumerar queryKeys.
      queryClient.invalidateQueries();
    },
  });

  const reset = useCallback(
    async (companyId: string, options: ResetOptions) => {
      await mutation.mutateAsync({ companyId, options });
    },
    [mutation],
  );

  return {
    reset,
    isLoading: mutation.isPending,
    currentStep,
    currentStepIndex,
    totalSteps,
    error: (mutation.error as ResetStepError) ?? null,
  };
}
