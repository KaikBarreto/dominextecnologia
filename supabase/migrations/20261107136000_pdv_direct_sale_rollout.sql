-- W2-02: rollout fechado e projeção comercial segura da venda direta v2.
BEGIN;

INSERT INTO public.app_feature_flags(key,enabled,contract_allowlist,company_allowlist)
VALUES('pdv_direct_sale_v2',false,'{}'::uuid[],'{}'::uuid[])
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pdv_direct_sale_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT COALESCE((SELECT f.enabled OR p_company_id=ANY(f.company_allowlist)
    FROM public.app_feature_flags f WHERE f.key='pdv_direct_sale_v2'),false)
$fn$;
REVOKE ALL ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pdv_direct_sale_rollout_company_v2()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT public.is_super_admin(v_context.user_id)
     AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para operar a venda do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_direct_sale_screen_denied';
  END IF;
  RETURN v_context.company_id;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_direct_sale_rollout_company_v2() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_direct_sale_capability_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid;
BEGIN
  v_company:=public.pdv_direct_sale_rollout_company_v2();
  RETURN jsonb_build_object('enabled',public.pdv_direct_sale_v2_enabled_internal(v_company),'contract_version',2);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_direct_sale_capability_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_direct_sale_capability_v2() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_direct_sale_catalog_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid; v_can_use_banks boolean;
BEGIN
  v_company:=public.pdv_direct_sale_rollout_company_v2();
  IF public.pdv_direct_sale_v2_enabled_internal(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A nova venda direta ainda não está liberada para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_direct_sale_rollout_disabled';
  END IF;
  v_can_use_banks:=public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
    OR public.pdv_has_explicit_action_permission_v2(v_uid,'fn:use_bank_accounts');
  RETURN jsonb_build_object(
    'materials',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',i.id,'name',i.name,'sku',i.sku,'barcode',i.barcode,'unit',i.unit,
      'group_id',i.group_id,
      'sale_price',i.sale_price,'image_url',i.image_url,
      'available_by_stock',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'stock_id',s.id,'available_quantity',a.available_quantity,'has_conflict',a.has_conflict
      ) ORDER BY s.sort_order,s.name,s.id),'[]'::jsonb)
      FROM public.stocks s CROSS JOIN LATERAL public.pdv_get_stock_availability_v2(i.id,s.id) a
      WHERE s.company_id=v_company AND s.customer_id IS NULL AND s.purpose='pdv'
        AND public.can_access_stock(v_uid,s.id))
    ) ORDER BY i.name,i.id),'[]'::jsonb) FROM public.inventory i
      WHERE i.company_id=v_company AND i.customer_id IS NULL AND i.archived_at IS NULL
        AND i.is_sellable IS TRUE AND i.id IN(SELECT public.get_accessible_inventory_ids())),
    'customers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)
      ORDER BY c.name,c.id),'[]'::jsonb) FROM public.customers c
      WHERE c.company_id=v_company AND c.is_deleted IS FALSE),
    'terminals',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'stock_id',t.stock_id
    ) ORDER BY t.sort_order,t.name,t.id),'[]'::jsonb) FROM public.pdv_terminals t
      WHERE t.company_id=v_company AND t.is_active IS TRUE AND t.stock_id IS NOT NULL
        AND public.can_access_stock(v_uid,t.stock_id)),
    'sessions',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',cs.id,'terminal_id',cs.terminal_id,'cash_account_id',cs.cash_account_id,'opened_at',cs.opened_at
    ) ORDER BY cs.opened_at,cs.id),'[]'::jsonb) FROM public.pdv_cash_sessions cs
      WHERE cs.company_id=v_company AND cs.status='aberta' AND cs.contract_version=2
        AND EXISTS(SELECT 1 FROM public.pdv_terminals t
          WHERE t.id=cs.terminal_id AND t.company_id=v_company AND t.is_active IS TRUE
            AND t.stock_id IS NOT NULL AND public.can_access_stock(v_uid,t.stock_id))
        AND(cs.opened_by=v_uid OR public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid))),
    'cash_account',(SELECT jsonb_build_object('id',a.id,'name',a.name)
      FROM public.company_settings s JOIN public.financial_accounts a
        ON a.id=s.pdv_cash_account_id AND a.company_id=s.company_id AND a.is_active IS TRUE
      WHERE s.company_id=v_company),
    'bank_accounts',CASE WHEN v_can_use_banks THEN(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'type',a.type,'color',a.color,'institution_code',a.institution_code,
      'institution_name',a.institution_name,'bank_name',a.bank_name
    ) ORDER BY a.sort_order,a.name,a.id),'[]'::jsonb) FROM public.financial_accounts a
      WHERE a.company_id=v_company AND a.is_active IS TRUE AND a.type='banco') ELSE '[]'::jsonb END
  );
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_direct_sale_catalog_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_direct_sale_catalog_v2() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_complete_direct_sale_rollout_v2(
  p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,p_customer_id uuid,
  p_cart jsonb,p_payments jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE v_company uuid;
BEGIN
  v_company:=public.pdv_direct_sale_rollout_company_v2();
  IF public.pdv_direct_sale_v2_enabled_internal(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A nova venda direta ainda não está liberada para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_direct_sale_rollout_disabled';
  END IF;
  RETURN public.pdv_complete_direct_sale_v2(
    p_terminal_id,p_cash_session_id,p_cash_account_id,p_customer_id,p_cart,p_payments,p_idempotency_key
  );
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_complete_direct_sale_rollout_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_complete_direct_sale_rollout_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text) TO authenticated,service_role;

-- Leitura operacional da configuração efetiva do comprovante. Alterar a
-- configuração continua usando pdv_receipt_settings_context_v2 e, portanto,
-- continua restrito a screen:pdv_settings.
CREATE OR REPLACE FUNCTION public.pdv_receipt_settings_read_context_v2()
RETURNS TABLE(user_id uuid,company_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p
    WHERE p.user_id=v_user AND p.company_id=v_company AND COALESCE(p.is_active,true)) THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O módulo PDV não está disponível para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_module_denied';
  END IF;
  IF NOT public.is_admin_or_gestor(v_user) AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv') IS DISTINCT FROM true
     AND public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv_orders') IS DISTINCT FROM true
     AND public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv_settings') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar o comprovante do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_screen_denied';
  END IF;
  RETURN QUERY SELECT v_user,v_company;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_receipt_settings_read_context_v2() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_receipt_settings_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_settings public.pdv_receipt_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_context FROM public.pdv_receipt_settings_read_context_v2();
  SELECT * INTO v_settings FROM public.pdv_receipt_settings settings
    WHERE settings.company_id=v_context.company_id;
  RETURN jsonb_build_object(
    'default_format',COALESCE(v_settings.default_format,'80mm'),
    'auto_print',COALESCE(v_settings.auto_print,false),
    'copies',COALESCE(v_settings.copies,1)
  );
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_get_receipt_settings_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_receipt_settings_v2() TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_get_direct_sale_catalog_v2() IS
  'Projeção mínima do PDV v2: catálogo comercial, disponibilidade, caixa e contas operacionais; nunca custo, crédito, fiscal ou contato.';
COMMENT ON FUNCTION public.pdv_complete_direct_sale_rollout_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text) IS
  'Wrapper autenticado do core v2, protegido por rollout fail-closed por empresa.';
COMMIT;
