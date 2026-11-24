-- ============================================================================
-- RLS 21/11/2026, item 3 (FASE A, só escrita): employees
-- ============================================================================
-- Por quê:
--   A política ALL "Users manage own company employees" (company_id = empresa
--   do usuário) anulava a de gestores: QUALQUER usuário logado inseria, editava
--   (salary, pix_key, cpf...) e apagava funcionário da própria empresa. A outra
--   política usava can_manage_system (fn:manage_settings), permissão errada
--   para RH; a de catálogo é fn:manage_employees.
--
-- O que faz:
--   1. Helper can_manage_employees(uid): admin/gestor, Acesso Total ('*') ou
--      fn:manage_employees ativo. SEM o "sem linha = tudo" legado.
--   2. Troca as 3 políticas por SELECT/INSERT/UPDATE/DELETE separadas:
--      - SELECT: empresa toda (+ super_admin). Leitura NÃO muda (fase B é outro projeto).
--      - INSERT/DELETE: can_manage_employees na própria empresa (+ super_admin).
--      - UPDATE: can_manage_employees OU can_manage_users na própria empresa
--        (+ super_admin); quem entra só por can_manage_users é limitado pelo
--        gatilho a user_id/email/photo_url (vínculo feito na tela Usuários).
--   3. Gatilho guard_employees_columns: impede troca de empresa e limita colunas.
--      RPC SECURITY DEFINER (archive_employee, generate_ponto_slug) passa: ela
--      roda como dono da função e já faz a própria checagem.
--   4. archive_employee passa a usar can_manage_employees (sai o fallback legado).
--   5. DECISÃO DO TECH LEAD: concede fn:manage_employees aos 4 usuários ativos
--      que hoje usam a tela Funcionários sem essa permissão (ENGETEC, CLIMATIZE,
--      Únitiz, Carlos & Arruda), para ninguém perder acesso. Os técnicos legados
--      sem linha em user_permissions perdem a edição de salário de propósito.
-- Idempotente: pode rodar 2x.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- 1. Helper --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_employees(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions
       WHERE user_id = _user_id
         AND is_active = true
         AND permissions @> '"fn:manage_employees"'::jsonb
    )
  )
$function$;

REVOKE ALL ON FUNCTION public.can_manage_employees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_employees(uuid) TO authenticated, service_role;

-- 5. Concessão aos 4 usuários (antes das políticas, para não haver janela) -------
DO $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.user_permissions up
     SET permissions = up.permissions || '["fn:manage_employees"]'::jsonb
   WHERE up.user_id IN (
           'a9a4c5de-b61e-416d-86cd-69721bb4d1b3', -- ENGETEC PROJETOS INDUSTRIA E COMERCIO
           'f1d0c69c-eb5d-4e6c-849e-0b9cd001a9f4', -- CLIMATIZE SERVIÇOS LTDA
           '688d4296-49d0-40f4-9784-9820b3279ba2', -- Únitiz Elevadores (papel financeiro)
           'd1a60085-e21e-4a12-b2ff-dbaead993e6e'  -- Carlos & Arruda Refrigeração
         )
     AND up.is_active
     AND jsonb_typeof(up.permissions) = 'array'
     AND up.permissions ? 'screen:employees'
     AND NOT up.permissions ? 'fn:manage_employees'
     AND NOT up.permissions ? '*';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'employees: fn:manage_employees concedida a % usuário(s) (esperado 4 na 1a execução)', v_n;
END $$;

-- 2. Políticas -------------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own company employees" ON public.employees;
DROP POLICY IF EXISTS "Managers can manage own company employees" ON public.employees;
DROP POLICY IF EXISTS "Employees visible to own company" ON public.employees;
DROP POLICY IF EXISTS "employees_select_own_company" ON public.employees;
DROP POLICY IF EXISTS "employees_insert_managers" ON public.employees;
DROP POLICY IF EXISTS "employees_update_managers" ON public.employees;
DROP POLICY IF EXISTS "employees_delete_managers" ON public.employees;

CREATE POLICY "employees_select_own_company"
  ON public.employees FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "employees_insert_managers"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_manage_employees(auth.uid())))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "employees_update_managers"
  ON public.employees FOR UPDATE TO authenticated
  USING (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND ((SELECT public.can_manage_employees(auth.uid()))
           OR (SELECT public.can_manage_users(auth.uid()))))
    OR (SELECT public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND ((SELECT public.can_manage_employees(auth.uid()))
           OR (SELECT public.can_manage_users(auth.uid()))))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "employees_delete_managers"
  ON public.employees FOR DELETE TO authenticated
  USING (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_manage_employees(auth.uid())))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

-- 3. Gatilho de colunas ------------------------------------------------------------
-- SECURITY INVOKER de propósito: precisa enxergar current_user para distinguir
-- UPDATE direto pelo navegador (current_user = authenticated) de UPDATE feito
-- dentro de RPC SECURITY DEFINER (current_user = dono da função).
CREATE OR REPLACE FUNCTION public.guard_employees_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := auth.role();
  v_uid  uuid := auth.uid();
  -- Colunas que quem só gerencia usuários pode mexer (vínculo na tela Usuários).
  v_link_cols constant text[] := ARRAY['user_id', 'email', 'photo_url', 'updated_at'];
BEGIN
  -- Manutenção sem JWT, edges com service_role: passa.
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'O funcionário não pode mudar de empresa.' USING ERRCODE = '42501';
  END IF;

  -- Dentro de RPC SECURITY DEFINER: a RPC já autorizou.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND public.can_manage_employees(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Entrou pela política via can_manage_users: só o vínculo de usuário.
  IF (to_jsonb(NEW) - v_link_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_link_cols) THEN
    RAISE EXCEPTION 'Sem permissão para alterar dados de RH deste funcionário.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_employees_columns() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_employees_columns ON public.employees;
CREATE TRIGGER guard_employees_columns
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_employees_columns();

-- 4. archive_employee sem o fallback legado (corpo idêntico ao vivo, só a checagem muda)
CREATE OR REPLACE FUNCTION public.archive_employee(p_employee_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id    uuid;
  v_user_id       uuid;
  v_is_authorized boolean := false;
BEGIN
  SELECT e.company_id, e.user_id
    INTO v_company_id, v_user_id
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  IF v_company_id IS NOT NULL THEN
    IF public.is_super_admin(auth.uid()) THEN
      v_is_authorized := true;
    ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
          AND public.get_user_company_id(auth.uid()) = v_company_id
          AND public.can_manage_employees(auth.uid()) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para arquivar'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotente: repetir a chamada mantem o mesmo estado final. Ainda limpamos
  -- os vinculos caso uma versao antiga tenha arquivado sem concluir a limpeza.
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.team_members tm
    USING public.teams t
    WHERE tm.team_id = t.id
      AND tm.user_id = v_user_id
      AND t.company_id = v_company_id;

    -- Mantem autoria/atribuicao das OS concluidas ou canceladas como historico.
    -- Remove somente das OS ainda operacionais.
    DELETE FROM public.service_order_assignees soa
    USING public.service_orders so
    WHERE soa.service_order_id = so.id
      AND soa.user_id = v_user_id
      AND so.company_id = v_company_id
      AND so.status NOT IN ('concluida', 'cancelada');
  END IF;

  UPDATE public.employees
  SET is_active = false
  WHERE id = p_employee_id
    AND is_active IS DISTINCT FROM false;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_employee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_employee(uuid) TO authenticated;

COMMIT;
