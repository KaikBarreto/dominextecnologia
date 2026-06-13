-- Broadening do acesso a documentos PMOC + regeneração do token do portal PMOC.
-- Por quê: usuários com a permissão de contratos (fn:manage_contracts) ou "Acesso Total" ('*')
-- não conseguiam gerar/editar documentos PMOC nem regenerar o link do portal, porque o servidor
-- gateava SÓ por cargo (admin/gestor/super_admin). Incidente tenant Glacial Cold.
-- Mudança APROVADA pelo CEO e é ADITIVA: ninguém perde acesso; liberamos pra quem tem a
-- permissão de contratos OU acesso total OU é admin/gestor/super_admin.
-- A régua é AFIRMATIVA: NÃO existe ramo "sem registro de permissão → libera por qualquer cargo".

-- ============================================================================
-- Tarefa 1 — função-régua única
-- ============================================================================
CREATE OR REPLACE FUNCTION public.can_manage_contracts(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
       public.has_role(_user_id, 'super_admin'::app_role)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'gestor'::app_role)
    OR public.has_full_permissions(_user_id)
    OR (public.get_user_permissions(_user_id) ? 'fn:manage_contracts');
$function$;

-- Edges chamam via service-role client por rpc; client autenticado também usa em RLS.
GRANT EXECUTE ON FUNCTION public.can_manage_contracts(uuid) TO authenticated, anon, service_role;

-- ============================================================================
-- Tarefa 2 — gate do RPC regenerate_pmoc_token agora pela régua
-- (corpo idêntico ao atual; só o bloco (d) trocou de has_role triplo → can_manage_contracts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.regenerate_pmoc_token(p_contract_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_company uuid;
  v_is_pmoc boolean;
  v_user_company uuid;
  v_is_super_admin boolean;
  v_new_token text;
BEGIN
  -- (a) auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_super_admin := public.has_role(auth.uid(), 'super_admin'::app_role);

  -- Lê contrato (só o necessário pras checagens)
  SELECT company_id, is_pmoc
    INTO v_contract_company, v_is_pmoc
    FROM public.contracts
   WHERE id = p_contract_id;

  -- (b) Oracle blindado: contrato não existe OU não é do tenant → mesma mensagem
  IF v_contract_company IS NULL THEN
    RAISE EXCEPTION 'contract_not_found'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := public.get_user_company_id(auth.uid());

  IF v_contract_company IS DISTINCT FROM v_user_company
     AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'contract_not_found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (c) Tem que ser PMOC (extra anti-oracle: a Plataforma exigiu este check)
  IF v_is_pmoc IS NOT TRUE THEN
    RAISE EXCEPTION 'not_a_pmoc_contract'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (d) Régua de contratos: admin/gestor/super_admin OU acesso total OU fn:manage_contracts
  IF NOT public.can_manage_contracts(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gera e atualiza
  v_new_token := public.generate_pmoc_token();

  UPDATE public.contracts
     SET public_pmoc_token = v_new_token,
         updated_at = now()
   WHERE id = p_contract_id;

  RETURN v_new_token;
END;
$function$;

-- ============================================================================
-- Tarefa 3 — afrouxar as 3 policies de escrita de pmoc_contract_documents_custom
-- mantendo isolamento por empresa. SELECT e service_role NÃO mudam.
-- ============================================================================

-- INSERT
DROP POLICY IF EXISTS "pmoc_custom_admin_gestor_insert" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_admin_gestor_insert"
  ON public.pmoc_contract_documents_custom
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = get_user_company_id(auth.uid()) AND public.can_manage_contracts(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- UPDATE
DROP POLICY IF EXISTS "pmoc_custom_admin_gestor_update" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_admin_gestor_update"
  ON public.pmoc_contract_documents_custom
  FOR UPDATE TO authenticated
  USING (
    (company_id = get_user_company_id(auth.uid()) AND public.can_manage_contracts(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (company_id = get_user_company_id(auth.uid()) AND public.can_manage_contracts(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- DELETE (broadening de admin-only → can_manage_contracts, conforme aprovado: "tudo da tela de contratos")
DROP POLICY IF EXISTS "pmoc_custom_admin_delete" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_admin_delete"
  ON public.pmoc_contract_documents_custom
  FOR DELETE TO authenticated
  USING (
    (company_id = get_user_company_id(auth.uid()) AND public.can_manage_contracts(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
