-- =============================================================================
-- Preserva evidencia trabalhista ao remover funcionario
--
-- PROBLEMA:
-- `time_records.employee_id` nasceu com ON DELETE CASCADE. Um hard delete em
-- employees apagava junto horario, selfie, geolocalizacao e trilha de auditoria
-- das batidas, embora a exclusao de uma batida no produto seja deliberadamente
-- soft delete (`is_valid=false`).
--
-- SOLUCAO:
-- A acao comum da UI passa a arquivar employees.is_active=false. Esta FK vira
-- RESTRICT como defesa no banco: se ainda existir ponto associado, nenhum caller
-- consegue destruir o funcionario e levar a evidencia junto por acidente.
--
-- Os fluxos privilegiados de reset da empresa e exclusao do tenant continuam
-- compativeis porque removem time_records explicitamente ANTES de employees.
-- =============================================================================

ALTER TABLE public.time_records
  DROP CONSTRAINT IF EXISTS time_records_employee_id_fkey;

ALTER TABLE public.time_records
  ADD CONSTRAINT time_records_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT time_records_employee_id_fkey ON public.time_records IS
  'Preserva evidencia trabalhista: funcionario com batida associada nao pode sofrer hard delete. O fluxo comum usa employees.is_active=false.';

-- ----------------------------------------------------------------------------
-- Arquivamento transacional
--
-- A UI antiga removia team_members, service_order_assignees e employees em tres
-- requests independentes. Uma falha no meio deixava estado parcial. Esta RPC
-- arquiva e limpa os vinculos operacionais numa unica transacao, preservando a
-- linha do funcionario e todo o historico referenciado por ela.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
          AND public.user_has_permission(auth.uid(), 'fn:manage_employees') THEN
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
$$;

COMMENT ON FUNCTION public.archive_employee(uuid) IS
  'Arquiva um funcionario sem apagar historico e remove, na mesma transacao, equipes e atribuicoes de OS ainda ativas. Atribuicoes concluidas/canceladas sao preservadas. SECURITY DEFINER com guarda fail-closed de tenant e fn:manage_employees.';

REVOKE ALL ON FUNCTION public.archive_employee(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_employee(uuid)
  TO authenticated;
