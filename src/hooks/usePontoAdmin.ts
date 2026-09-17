// usePontoAdmin — camada de dados do PONTO EM GRUPO (quiosque) e do PIN por
// funcionário, consumida pelas telas de administração (Employees).
//
// Três RPCs SECURITY DEFINER já aplicadas em produção (migration
// 20260917153000_ponto_kiosk_e_pin.sql), cada uma com guard de tenant escrito
// à mão no próprio banco:
//   - get_or_create_ponto_kiosk_slug(p_company_id) → text   (idempotente)
//   - has_ponto_pin(p_employee_id)                 → boolean (só o booleano,
//     o hash bcrypt nunca sai do banco)
//   - set_ponto_pin(p_employee_id, p_pin)          → void   (NULL remove)
//
// Regra-lei nº4: componente nunca chama supabase.from(...)/rpc(...) direto —
// esta é a fronteira. Segue o mesmo padrão de useEmployees.ts.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

/**
 * Slug do link público do quiosque da empresa (`/ponto/empresa/:slug`).
 * Gerado sob demanda (primeira chamada cria, as seguintes devolvem o mesmo).
 * `enabled` evita disparar a RPC antes do diálogo abrir.
 */
export function useKioskSlug(enabled: boolean) {
  const { companyId } = useUserCompany();

  return useQuery({
    queryKey: ['ponto-kiosk-slug', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_or_create_ponto_kiosk_slug', {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data as string;
    },
    enabled: enabled && !!companyId,
    // Idempotente no banco: uma vez emitido, o slug nunca muda.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

/** Só o booleano: existe PIN cadastrado pra este funcionário? */
export function useHasPontoPin(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ['has-ponto-pin', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_ponto_pin', {
        p_employee_id: employeeId!,
      });
      if (error) throw error;
      return !!data;
    },
    enabled: !!employeeId,
    staleTime: 0,
  });
}

/** Define (4 ou 6 dígitos) ou remove (pin=null) o PIN do funcionário. */
export function useSetPontoPin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, pin }: { employeeId: string; pin: string | null }) => {
      const { error } = await supabase.rpc('set_ponto_pin', {
        p_employee_id: employeeId,
        p_pin: pin,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['has-ponto-pin', variables.employeeId] });
    },
  });
}
