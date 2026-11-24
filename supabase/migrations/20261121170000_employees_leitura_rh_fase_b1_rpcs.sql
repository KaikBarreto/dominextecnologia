-- ============================================================================
-- RLS 21/11/2026, item 3 (FASE B, parte 1 de 2, ADITIVA): leitura de RH em employees
-- ============================================================================
-- Por quê:
--   Depois da fase A (20261121160200) a ESCRITA de employees ficou restrita, mas
--   a LEITURA continua aberta para a empresa inteira: qualquer usuário logado lê
--   salário, custo mensal, CPF, PIX, endereço, dependentes e CNPJ do prestador
--   por select('*'). A fase B fecha isso em 2 passos:
--     B1 (ESTA migration): cria os caminhos novos de leitura. Não tira nada de
--        ninguém; pode ir para produção antes do front.
--     B2 (20261122090000): tira o SELECT das colunas sensíveis de authenticated.
--        SÓ depois que o front novo estiver no ar há pelo menos 1 dia.
--
-- Decisão de produto (Tech Lead): quem orça vê o CUSTO-HORA do técnico, nunca o
-- salário. Por isso há duas RPCs com públicos diferentes.
--
-- Classificação das 35 colunas vivas de public.employees (information_schema,
-- 21/11/2026). "(?)" = classificação duvidosa, decidir com Plataforma/PM.
--
--   NÃO SENSÍVEIS (17) - continuam legíveis pela empresa toda na fase B2:
--     id, name, position, photo_url, is_active, created_at, updated_at,
--     user_id, company_id, ponto_slug, ponto_enabled, cbo, matricula,
--     email              (?) e-mail de login vinculado; a tela Usuários (quem
--                            gerencia usuários, não só RH) lê e grava.
--     hire_date          (?) dado funcional, não pessoal; aparece no card.
--     employment_regime  (?) CLT/PJ/informal; separa as listas de RH.
--     public_short_code  (?) código do link público (DISC); já é exposto no link.
--
--   SENSÍVEIS (18) - só via get_employees_hr (RH) na fase B2:
--     Dado pessoal:   cpf, address, pix_key, dependents_count,
--                     phone (?) contato pessoal; fora do RH ninguém lê de employees.
--     Remuneração:    salary, monthly_cost, monthly_cost_breakdown,
--                     vt_enabled, vt_monthly_value,
--                     payment_frequency, payment_day_type, payment_day,
--                     payment_day_2, payment_weekday (?) calendário de pagamento,
--                     não valor; agrupado em remuneração.
--     Fiscal do PJ:   pj_cnpj, pj_legal_name,
--                     pj_is_mei (?) só um booleano, mas é situação fiscal da pessoa.
--   Não existem colunas de RG, banco/agência ou nascimento em employees.
--
-- O que faz:
--   1. get_employees_hr(p_ids): linha completa (SETOF employees) dos funcionários
--      da empresa do chamador, só para can_manage_employees e membro ativo.
--      Sem permissão: 42501 com mensagem em PT-BR.
--   2. get_employee_hourly_costs(p_ids): custo-hora por funcionário para qualquer
--      membro ativo da empresa. Fórmula idêntica à da calculadora de mão de obra
--      (src/components/service-orders/LaborCalculatorModal.tsx:242 e :104/:110,
--      jornada de src/hooks/useEmployeeWorkHours.ts:55-62, chamado com null):
--        custo_mensal = COALESCE(monthly_cost, salary, 0)           (?? do JS)
--        horas_mes    = time_settings da empresa com default_in E default_out:
--                         round(max(minutos(out) - minutos(in) - COALESCE(break,0), 0) / 60 * 22)
--                       senão 176
--                       (minutos = hora*60 + minuto; segundos ignorados, como o split(':') do front)
--        custo_hora   = custo_mensal / horas_mes, ou 0 se horas_mes <= 0
--      A jornada individual (time_schedules) NÃO entra: a calculadora chama
--      useEmployeeWorkHours(null), então usa só a da empresa.
--   3. compute_payroll_periods: lia salary como SECURITY INVOKER e tinha EXECUTE
--      para authenticated. Único chamador é generate_payroll_for_employee (DEFINER,
--      dono postgres); front e edges não chamam. Fica EXECUTE só service_role.
--   4. Achado lateral, mesma família: generate_payroll_for_employee(uuid,integer)
--      (sobrecarga de 2 argumentos) é DEFINER, sem checagem de empresa, e tinha
--      EXECUTE para authenticated: qualquer logado gerava lançamento de folha para
--      funcionário de QUALQUER empresa. Único chamador é a edge generate-payroll
--      (service_role). Fica EXECUTE só service_role, igual à de 3 argumentos.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT. Pode rodar 2x.
-- Depois de aplicar: regenerar src/integrations/supabase/types.ts.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- 1. Leitura completa para RH -------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employees_hr(p_ids uuid[] DEFAULT NULL)
 RETURNS SETOF public.employees
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
BEGIN
  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.user_id = v_uid
     AND p.is_active;

  IF v_uid IS NULL
     OR v_company IS NULL
     OR NOT public.can_manage_employees(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para ver os dados de RH dos funcionários.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT e.*
      FROM public.employees e
     WHERE e.company_id = v_company
       AND (p_ids IS NULL OR e.id = ANY (p_ids))
     ORDER BY e.name, e.id;
END;
$function$;

COMMENT ON FUNCTION public.get_employees_hr(uuid[]) IS
  'RH: linha completa (salário, CPF, PIX...) dos funcionários da empresa do chamador. '
  'Exige can_manage_employees e perfil ativo; senão 42501. p_ids NULL = todos (ativos e arquivados).';

REVOKE ALL ON FUNCTION public.get_employees_hr(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employees_hr(uuid[]) TO authenticated, service_role;

-- 2. Custo-hora para quem orça ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_hourly_costs(p_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(employee_id uuid, hourly_cost numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_company       uuid;
  v_monthly_hours numeric;
BEGIN
  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.user_id = v_uid
     AND p.is_active;

  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Sem acesso aos custos de mão de obra desta empresa.'
      USING ERRCODE = '42501';
  END IF;

  -- Jornada da empresa, igual a useEmployeeWorkHours(null) passos 2 e 3.
  SELECT round(
           greatest(
             (extract(hour FROM ts.default_out)::int * 60 + extract(minute FROM ts.default_out)::int)
           - (extract(hour FROM ts.default_in)::int  * 60 + extract(minute FROM ts.default_in)::int)
           - COALESCE(ts.default_break_min, 0),
             0
           )::numeric * 22 / 60
         )
    INTO v_monthly_hours
    FROM public.time_settings ts
   WHERE ts.company_id = v_company
     AND ts.default_in IS NOT NULL
     AND ts.default_out IS NOT NULL;

  v_monthly_hours := COALESCE(v_monthly_hours, 176);

  RETURN QUERY
    SELECT e.id,
           CASE WHEN v_monthly_hours > 0
                THEN COALESCE(e.monthly_cost, e.salary, 0) / v_monthly_hours
                ELSE 0::numeric
           END
      FROM public.employees e
     WHERE e.company_id = v_company
       AND (CASE WHEN p_ids IS NULL THEN e.is_active ELSE e.id = ANY (p_ids) END)
     ORDER BY e.name, e.id;
END;
$function$;

COMMENT ON FUNCTION public.get_employee_hourly_costs(uuid[]) IS
  'Custo-hora (COALESCE(monthly_cost, salary, 0) / horas-mês da jornada da empresa, padrão 176h) '
  'dos funcionários da empresa do chamador. Qualquer membro ativo. Nunca devolve salário. '
  'p_ids NULL = só ativos; com p_ids = esses ids da empresa.';

REVOKE ALL ON FUNCTION public.get_employee_hourly_costs(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_hourly_costs(uuid[]) TO authenticated, service_role;

-- 3. compute_payroll_periods: só servidor ---------------------------------------
REVOKE ALL ON FUNCTION public.compute_payroll_periods(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_payroll_periods(uuid, date, date) TO service_role;

-- 4. generate_payroll_for_employee de 2 argumentos: só servidor -------------------
REVOKE ALL ON FUNCTION public.generate_payroll_for_employee(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_payroll_for_employee(uuid, integer) TO service_role;

-- Conferência: nada disso pode sobrar executável por anon; folha fora de authenticated.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_employees_hr(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_employee_hourly_costs(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.compute_payroll_periods(uuid,date,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.generate_payroll_for_employee(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_employees_hr(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_employee_hourly_costs(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.generate_payroll_for_employee(uuid,integer,date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.generate_payroll_for_employee(uuid,integer)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'employees fase B1: privilégios de EXECUTE fora do esperado';
  END IF;
  RAISE NOTICE 'employees fase B1: RPCs criadas e privilégios conferidos';
END $$;

COMMIT;
