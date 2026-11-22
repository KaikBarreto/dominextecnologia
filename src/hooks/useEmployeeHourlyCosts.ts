import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Custo-hora de cada funcionário ATIVO da empresa, pela RPC
 * `get_employee_hourly_costs` (migration 20261121170000).
 *
 * Qualquer membro da empresa pode chamar: é o que quem orça precisa ver, e
 * nunca devolve salário nem custo mensal. O banco calcula
 *   COALESCE(monthly_cost, salary, 0) / horas-mês da jornada da EMPRESA
 * (mesma conta de `useEmployeeWorkHours(null)`, padrão 176h).
 *
 * Falha (RPC ainda não aplicada, rede) devolve mapa vazio: a calculadora
 * continua funcionando com o custo digitado à mão.
 */
export function useEmployeeHourlyCosts(enabled = true) {
  const query = useQuery({
    queryKey: ['employee-hourly-costs'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_employee_hourly_costs', {});
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as { employee_id: string; hourly_cost: number | string | null }[]) {
        const value = Number(row.hourly_cost);
        if (row.employee_id && Number.isFinite(value)) map.set(row.employee_id, value);
      }
      return map;
    },
  });
  return { hourlyCosts: query.data ?? new Map<string, number>(), isLoading: query.isLoading };
}

/**
 * Custo mensal equivalente ao custo-hora do cadastro, na jornada da empresa,
 * arredondado em centavos.
 *
 * Por que voltar ao "mensal": a calculadora sempre trabalhou com custo mensal
 * ÷ horas mensais informadas. Com custo-hora h (calculado pelo banco sobre as
 * horas da empresa H), o mensal é h × H; a taxa final fica
 * h × H / horasInformadas, idêntica à conta antiga, inclusive quando o
 * usuário muda as horas mensais à mão. O arredondamento em centavos devolve o
 * valor exato gravado no cadastro (que já é em centavos) em vez de um
 * 4549,9999… vindo da divisão.
 */
export function monthlyCostFromHourly(hourlyCost: number, companyMonthlyHours: number): number {
  if (!Number.isFinite(hourlyCost) || !Number.isFinite(companyMonthlyHours) || companyMonthlyHours <= 0) return 0;
  return Math.round(hourlyCost * companyMonthlyHours * 100) / 100;
}
