-- ============================================================================
-- generate_payroll_for_employee: aceitar a data "hoje" resolvida pelo chamador
--
-- POR QUE: a sessao Postgres roda em UTC, entao CURRENT_DATE aqui e o dia do
-- servidor, nao o dia da empresa. Desde que o sistema passou a respeitar
-- company_settings.timezone, a edge generate-payroll agrupa funcionarios por
-- empresa e calcula o dia local de cada uma. Ela consegue esticar o FIM da
-- janela via p_lookahead_days, mas nao consegue mover o INICIO. Quando o dia
-- local da empresa esta ATRAS do dia do servidor, uma folha que vence
-- exatamente "hoje na empresa" fica de fora e so nasce na rodada seguinte.
-- Hoje isso nao acontece so porque o cron roda as 07:00 UTC (04:00 no Brasil),
-- horario em que o desvio e zero pra todo fuso brasileiro. Ou seja, funciona
-- por coincidencia de agendamento, nao por desenho: mudar a hora do cron, ou
-- entrar cliente fora dessa faixa (ja existe empresa em Asia/Calcutta), quebra
-- em silencio.
--
-- COMO: nova assinatura (uuid, integer, date) com o corpo real, usando
-- COALESCE(p_today, CURRENT_DATE). A assinatura antiga (uuid, integer) vira um
-- wrapper fino que delega passando NULL, preservando todos os chamadores
-- atuais sem nenhum DROP.
--
-- POR QUE O TERCEIRO PARAMETRO NAO TEM DEFAULT: provado em producao
-- (sonda em pg_temp, 2026-09-17) que declarar p_today date DEFAULT NULL faz a
-- chamada de 2 argumentos virar ambigua entre as duas funcoes, tanto
-- posicional quanto por nome:
--   ERROR 42725: function ...(p_employee_id => uuid, p_lookahead_days =>
--   integer) is not unique
-- A edge chama por nome via PostgREST, entao isso derrubaria o cron da folha
-- em runtime, calado. Sem DEFAULT no terceiro parametro as duas sobrecargas
-- ficam disjuntas (2 argumentos so casa com uma, 3 so casa com a outra).
--
-- O corpo real abaixo foi extraido do catalogo vivo via pg_get_functiondef,
-- nao do arquivo 20260426010000_payroll_integration.sql. Unica alteracao
-- deliberada: CURRENT_DATE -> COALESCE(p_today, CURRENT_DATE).
--
-- Idempotente e aditiva: so CREATE OR REPLACE, GRANT e REVOKE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Implementacao real: (uuid, integer, date), sem DEFAULT no terceiro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payroll_for_employee(
  p_employee_id uuid,
  p_lookahead_days integer,
  p_today date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp record;
  p record;
  inserted_count int := 0;
  category_id uuid;
BEGIN
  SELECT id, company_id, name, salary, is_active
    INTO emp
    FROM public.employees
   WHERE id = p_employee_id;

  IF NOT FOUND OR emp.is_active = false OR emp.salary IS NULL OR emp.salary <= 0 THEN
    RETURN 0;
  END IF;

  -- Garante categoria "Folha de Pagamento" para a empresa
  SELECT id INTO category_id
    FROM public.financial_categories
   WHERE company_id = emp.company_id AND name = 'Folha de Pagamento'
   LIMIT 1;

  IF category_id IS NULL THEN
    INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system)
    VALUES (emp.company_id, 'Folha de Pagamento', 'saida', '#f59e0b', 'Users', 'opex', true)
    RETURNING id INTO category_id;
  END IF;

  FOR p IN
    -- p_today: dia ja resolvido no fuso da empresa pelo chamador.
    -- NULL cai em CURRENT_DATE (dia do servidor, UTC), que e o comportamento antigo.
    SELECT * FROM public.compute_payroll_periods(
      emp.id,
      COALESCE(p_today, CURRENT_DATE),
      COALESCE(p_today, CURRENT_DATE) + p_lookahead_days
    )
  LOOP
    BEGIN
      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount,
        transaction_date, due_date, is_paid, category,
        employee_id, payroll_period, payroll_kind
      ) VALUES (
        emp.company_id, 'saida',
        'Folha ' || emp.name || ' — ' || p.period,
        ROUND((emp.salary * p.amount_factor)::numeric, 2),
        p.due_date, p.due_date, false,
        'Folha de Pagamento',
        emp.id, p.period, 'salary'
      );
      inserted_count := inserted_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Já existe folha não-cancelada para esse período: ignora (idempotente)
      NULL;
    END;
  END LOOP;

  RETURN inserted_count;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Compatibilidade: (uuid, integer) vira wrapper fino
--    CREATE OR REPLACE na MESMA assinatura, entao os GRANTs existentes
--    (authenticated, service_role) e a revogacao de PUBLIC/anon feita em
--    20260912150000_fecha_execute_anon_rpcs_security_definer.sql continuam
--    valendo por construcao. Nada de DROP.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payroll_for_employee(
  p_employee_id uuid,
  p_lookahead_days integer DEFAULT 35
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.generate_payroll_for_employee(p_employee_id, p_lookahead_days, NULL::date);
END
$$;

-- ---------------------------------------------------------------------------
-- 3) ACL da assinatura NOVA
--    Funcao nova nasce com EXECUTE pra PUBLIC, e o default ACL deste projeto
--    ainda alcanca anon. A revogacao da migration 20260912150000 e por
--    assinatura exata, entao NAO cobre (uuid, integer, date): repor aqui.
--    Sem authenticated de proposito. O wrapper e SECURITY DEFINER, entao quem
--    chama a de 2 argumentos executa a interna como o dono (postgres) e nao
--    precisa de EXECUTE proprio. Menos superficie exposta no PostgREST.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sig text;
BEGIN
  v_sig := to_regprocedure('public.generate_payroll_for_employee(uuid,integer,date)')::text;

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'generate_payroll_for_employee(uuid,integer,date) nao existe apos o CREATE OR REPLACE';
  END IF;

  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);

  RAISE NOTICE 'ACL de % ajustada: service_role apenas', v_sig;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Documentacao
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.generate_payroll_for_employee(uuid, integer, date) IS
  'Gera as folhas pendentes de um funcionario. Implementacao real. p_today e o dia ja resolvido no fuso da empresa (company_settings.timezone) pelo chamador, normalmente a edge generate-payroll, porque a sessao Postgres roda em UTC e CURRENT_DATE aqui seria o dia do servidor, o que deixaria de fora a folha que vence hoje na empresa quando o dia local esta atras do dia do servidor. Passar NULL em p_today mantem o comportamento antigo, CURRENT_DATE. O terceiro parametro nao tem DEFAULT de proposito, para nao criar ambiguidade de sobrecarga (erro 42725) com a assinatura de 2 argumentos.';

COMMENT ON FUNCTION public.generate_payroll_for_employee(uuid, integer) IS
  'Compatibilidade. Wrapper fino que delega para generate_payroll_for_employee(uuid, integer, date) passando NULL, ou seja, CURRENT_DATE do servidor. Existe para nao quebrar chamadores que nao informam a data. Chamador novo deve usar a versao de 3 argumentos, informando o dia no fuso da empresa.';
