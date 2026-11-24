-- Recursos publicados do PDV acompanham o módulo e a vigência canônicos.
-- Não altera flags, allowlists, funções administrativas nem saldos/documentos.
-- Rollback lógico: restaurar as duas definições de rollout em nova migration;
-- não apagar livros financeiros nem desfazer movimentações operacionais.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.pdv_returns_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
  SELECT public.pdv_direct_sale_v2_enabled_internal(p_company_id) IS TRUE
$fn$;
CREATE OR REPLACE FUNCTION public.pdv_after_sale_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
  SELECT public.pdv_direct_sale_v2_enabled_internal(p_company_id) IS TRUE
$fn$;
REVOKE ALL ON FUNCTION public.pdv_returns_v2_enabled_internal(uuid),
  public.pdv_after_sale_v2_enabled_internal(uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.pdv_returns_v2_enabled_internal(uuid) IS
  'Devoluções publicadas acompanham assinatura vigente e módulo PDV. Permissões, caixa e estoque continuam nos contextos/writers.';
COMMENT ON FUNCTION public.pdv_after_sale_v2_enabled_internal(uuid) IS
  'Pós-venda publicado acompanha assinatura vigente e módulo PDV. Sem dependência de coorte demo ou allowlist.';

-- Contextos operacionais exigem confirmação positiva de perfil ativo.
CREATE OR REPLACE FUNCTION public.pdv_cash_v2_context()
RETURNS TABLE (user_id uuid, company_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para continuar.'
      USING ERRCODE = '42501', DETAIL = 'PDV_AUTH_REQUIRED';
  END IF;

  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles profile
     WHERE profile.user_id = v_user
       AND profile.company_id = v_company
       AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Seu usuário não está ativo em nenhuma empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_ACTIVE_COMPANY_REQUIRED';
  END IF;

  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A assinatura da empresa não permite operar o caixa agora.'
      USING ERRCODE = '42501', DETAIL = 'PDV_SUBSCRIPTION_INACTIVE';
  END IF;

  IF public.company_has_module(v_company, 'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_MODULE_INACTIVE';
  END IF;

  IF public.user_has_permission(v_user, 'screen:pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa do PDV.'
      USING ERRCODE = '42501', DETAIL = 'PDV_SCREEN_FORBIDDEN';
  END IF;

  RETURN QUERY SELECT v_user, v_company;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_counter_context_v2(
  p_screen text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_require_counter boolean DEFAULT true
)
RETURNS TABLE(user_id uuid,company_id uuid,pdv_mode text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid; v_mode text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id=v_user AND profile.company_id=v_company
       AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O módulo PDV não está disponível para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_module_denied';
  END IF;
  IF p_screen IS NOT NULL
     AND NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,p_screen) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para acessar esta etapa do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_screen_denied';
  END IF;
  IF p_action IS NOT NULL
     AND NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,p_action) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para executar esta ação do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_action_denied';
  END IF;
  SELECT settings.pdv_mode INTO v_mode
    FROM public.company_settings settings
   WHERE settings.company_id=v_company;
  v_mode:=COALESCE(v_mode,'simples');
  IF p_require_counter AND v_mode<>'balcao' THEN
    RAISE EXCEPTION 'O fluxo balcão não está ativo para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_mode_required';
  END IF;
  RETURN QUERY SELECT v_user,v_company,v_mode;
END
$fn$;

-- RPC sem company_id recebido do cliente. Disponibilidade não concede ação:
-- cada RPC operacional continua validando permissões, custódia e estoque.
CREATE OR REPLACE FUNCTION public.pdv_get_module_features_v3()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_user uuid := auth.uid(); v_company uuid;
  v_available boolean := false; v_read boolean := false; v_privileged boolean := false;
  v_returns boolean := false; v_after_sale boolean := false;
BEGIN
  SELECT profile.company_id INTO v_company FROM public.profiles profile
   WHERE profile.user_id = v_user AND profile.is_active IS TRUE;
  IF v_company IS NOT NULL THEN
    v_available := public.pdv_direct_sale_v2_enabled_internal(v_company) IS TRUE;
    v_privileged := public.is_admin_or_gestor(v_user) OR public.is_super_admin(v_user);
    v_read := v_available AND (v_privileged
      OR public.pdv_has_explicit_action_permission_v2(v_user, 'screen:pdv_orders') IS TRUE
      OR public.pdv_has_explicit_action_permission_v2(v_user, 'screen:pdv_dispatch') IS TRUE);
    v_returns := v_read AND public.pdv_returns_v2_enabled_internal(v_company) IS TRUE;
    v_after_sale := v_read AND public.pdv_after_sale_v2_enabled_internal(v_company) IS TRUE;
  END IF;
  RETURN jsonb_build_object('company_id', v_company, 'module_available', v_available,
    'returns', v_returns, 'after_sale', v_after_sale,
    'capabilities', jsonb_build_object(
      'return', v_returns AND (v_privileged OR public.pdv_has_explicit_action_permission_v2(v_user, 'fn:return_pdv_order') IS TRUE),
      'view_after_sale', v_after_sale AND (v_privileged OR public.pdv_has_explicit_action_permission_v2(v_user, 'fn:view_pdv_after_sale') IS TRUE),
      'issue_voucher', v_after_sale AND (v_privileged OR public.pdv_has_explicit_action_permission_v2(v_user, 'fn:issue_pdv_voucher') IS TRUE),
      'request_refund', v_after_sale AND (v_privileged OR public.pdv_has_explicit_action_permission_v2(v_user, 'fn:refund_pdv_return') IS TRUE)
    ));
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_module_features_v3() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_module_features_v3() TO authenticated;
COMMENT ON FUNCTION public.pdv_get_module_features_v3() IS
  'Disponibilidade do PDV para a sessão ativa, separada de capabilities por ação; nunca recebe tenant do cliente. Caixa/estoque continuam sujeitos ao contexto operacional.';

CREATE OR REPLACE FUNCTION public.pdv_assert_draft_access()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.user_id = v_uid
     AND p.is_active IS TRUE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Usuario sem empresa ativa.' USING ERRCODE = '42501';
  END IF;

  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Assinatura inativa ou vencida: os rascunhos do PDV estao bloqueados.'
      USING ERRCODE = '42501';
  END IF;

  IF public.company_has_module(v_company, 'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O modulo PDV nao esta ativo para esta empresa.'
      USING ERRCODE = '42501';
  END IF;

  -- Rascunhos pessoais de venda/compra pertencem às rotas screen:pdv.
  -- Orçamentos do balcão usam pdv_preorders e seu gate próprio, intacto.
  IF public.user_has_permission(v_uid, 'screen:pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Seu perfil não permite acessar os rascunhos do PDV.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_draft_permission_denied';
  END IF;

  RETURN v_company;
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_draft_access() FROM PUBLIC, anon, authenticated, service_role;

-- SELECT REST não pode contornar a custódia aplicada nas RPCs v2.
CREATE OR REPLACE FUNCTION public.pdv_current_actor_can_read_draft_v3(
  p_company_id uuid, p_created_by uuid, p_draft_type text,
  p_cash_session_id uuid, p_terminal_id uuid, p_stock_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_company uuid;
BEGIN
  IF auth.uid() IS NULL OR p_created_by IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
  v_company := public.pdv_assert_draft_cash_context_v2(p_draft_type, p_cash_session_id, p_terminal_id, p_stock_id);
  RETURN v_company IS NOT NULL AND v_company = p_company_id;
EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR no_data_found THEN
  RETURN false;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_current_actor_can_read_draft_v3(uuid,uuid,text,uuid,uuid,uuid)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_current_actor_can_read_draft_v3(uuid,uuid,text,uuid,uuid,uuid) TO authenticated;
DROP POLICY IF EXISTS pdv_drafts_context_entitlement_v3 ON public.pdv_order_drafts;
CREATE POLICY pdv_drafts_context_entitlement_v3 ON public.pdv_order_drafts
 AS RESTRICTIVE FOR SELECT TO authenticated USING (
   public.pdv_current_actor_can_read_draft_v3(company_id, created_by, draft_type, cash_session_id, terminal_id, stock_id)
 );

CREATE OR REPLACE FUNCTION public.pdv_restore_order_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_client_request_id uuid
)
RETURNS public.pdv_order_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_draft   public.pdv_order_drafts%ROWTYPE;
  v_count   integer;
BEGIN
  v_company := public.pdv_assert_draft_access();
  IF p_draft_id IS NULL OR p_client_request_id IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision < 1
  THEN
    RAISE EXCEPTION 'draft_id, client_request_id e expected_revision valida sao obrigatorios.'
      USING ERRCODE = '22023';
  END IF;

  -- Primeiro descobre o tipo sem segurar row lock; depois adquire o mesmo
  -- advisory lock usado por save/create e so entao trava a linha. Essa ordem
  -- evita deadlock save(advisory->row) x restore(row->advisory).
  SELECT d.* INTO v_draft
    FROM public.pdv_order_drafts d
   WHERE d.id = p_draft_id;

  IF NOT FOUND OR v_draft.company_id <> v_company OR v_draft.created_by <> v_uid THEN
    RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.pdv_assert_draft_cash_context_v2(v_draft.draft_type,
    v_draft.cash_session_id, v_draft.terminal_id, v_draft.stock_id);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pdv_order_drafts:' || v_company::text || ':' || v_uid::text || ':' || v_draft.draft_type,
      0
    )
  );

  SELECT d.* INTO v_draft
    FROM public.pdv_order_drafts d
   WHERE d.id = p_draft_id
   FOR UPDATE;

  IF NOT FOUND OR v_draft.company_id <> v_company OR v_draft.created_by <> v_uid THEN
    RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.pdv_assert_draft_cash_context_v2(v_draft.draft_type,
    v_draft.cash_session_id, v_draft.terminal_id, v_draft.stock_id);

  IF v_draft.last_client_request_id = p_client_request_id THEN
    IF v_draft.last_request_kind = 'restore' AND v_draft.deleted_at IS NULL THEN
      RETURN v_draft;
    END IF;
    RAISE EXCEPTION 'client_request_id ja usado com outra mutacao.'
      USING ERRCODE = '22023';
  END IF;

  IF v_draft.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Conflito de revisao do rascunho.'
      USING ERRCODE = '40001',
            DETAIL = 'expected_revision=' || p_expected_revision
                     || ',current_revision=' || v_draft.revision;
  END IF;

  IF v_draft.deleted_at IS NULL THEN
    RETURN v_draft;
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.pdv_order_drafts d
   WHERE d.company_id = v_company
     AND d.created_by = v_uid
     AND d.draft_type = v_draft.draft_type
     AND d.deleted_at IS NULL;

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Limite de 20 rascunhos ativos por tipo atingido.'
      USING ERRCODE = '54000';
  END IF;

  UPDATE public.pdv_order_drafts d
     SET deleted_at = NULL,
         deleted_by = NULL,
         revision = d.revision + 1,
         last_client_request_id = p_client_request_id,
         last_request_kind = 'restore',
         updated_at = now()
   WHERE d.id = p_draft_id
  RETURNING d.* INTO v_draft;

  RETURN v_draft;
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_restore_order_draft(uuid,bigint,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_restore_order_draft(uuid,bigint,uuid) TO authenticated;
COMMIT;
