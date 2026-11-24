-- Leituras críticas do PDV acompanham sessão ativa, assinatura e módulo,
-- além da custódia já aplicada por operador/caixa. Não amplia nenhuma policy.
-- O extrato e a capacidade de voucher passam a usar o gate canônico do PDV.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.pdv_current_actor_can_read_orders_v4()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;
  SELECT profile.company_id INTO v_company FROM public.profiles profile
   WHERE profile.user_id=v_user AND COALESCE(profile.is_active,true);
  IF v_company IS NULL
     OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RETURN false;
  END IF;
  RETURN public.user_has_permission(v_user,'screen:pdv') IS TRUE
      OR public.user_has_permission(v_user,'screen:pdv_orders') IS TRUE
      OR public.user_has_permission(v_user,'screen:pdv_dispatch') IS TRUE;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_current_actor_can_read_orders_v4() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_current_actor_can_read_orders_v4() TO authenticated,service_role;

-- SELECT não correlacionado vira initPlan: resolve o gate uma vez por query.
-- AS RESTRICTIVE combina por AND com a policy de custódia vigente.
DROP POLICY IF EXISTS pdv_orders_read_entitlement_v4 ON public.pdv_orders;
CREATE POLICY pdv_orders_read_entitlement_v4 ON public.pdv_orders
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT public.pdv_current_actor_can_read_orders_v4()));
DROP POLICY IF EXISTS pdv_order_items_read_entitlement_v4 ON public.pdv_order_items;
CREATE POLICY pdv_order_items_read_entitlement_v4 ON public.pdv_order_items
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT public.pdv_current_actor_can_read_orders_v4()));
DROP POLICY IF EXISTS pdv_order_payments_read_entitlement_v4 ON public.pdv_order_payments;
CREATE POLICY pdv_order_payments_read_entitlement_v4 ON public.pdv_order_payments
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT public.pdv_current_actor_can_read_orders_v4()));

CREATE OR REPLACE FUNCTION public.pdv_party_accounts_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_direct_sale_v2_enabled_internal(p_company_id) IS TRUE
$fn$;
-- Mantém o helper interno: a RPC de extrato continua validando usuário ativo,
-- módulo/assinatura e permissão financeira explícita antes de consultar dados.
REVOKE ALL ON FUNCTION public.pdv_party_accounts_v2_enabled_internal(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

DO $capability$
DECLARE v_src text; v_old text:='''direct_sale_voucher'',false';
BEGIN
  IF position('PDV_STORED_VALUE_V3' IN pg_get_functiondef(
    'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'A cobertura por voucher precisa estar publicada antes desta projeção.';
  END IF;
  SELECT pg_get_functiondef('public.pdv_get_after_sale_workspace_core_015_v2(uuid)'::regprocedure) INTO v_src;
  IF position('PDV_DIRECT_VOUCHER_CAPABILITY_V4' IN v_src)=0 THEN
    IF position(v_old IN v_src)=0 THEN RAISE EXCEPTION 'A projeção de capacidade do pós-venda mudou.'; END IF;
    v_src:=replace(v_src,v_old,
      '''direct_sale_voucher'',public.pdv_direct_sale_v2_enabled_internal(v_context.company_id) /* PDV_DIRECT_VOUCHER_CAPABILITY_V4 */');
  END IF;
  -- received_at existe desde o contrato original; created_at nunca foi coluna
  -- de pdv_order_payments e fazia a projeção inteira falhar em execução.
  v_src:=replace(v_src,'ORDER BY payment.created_at,payment.id','ORDER BY payment.received_at,payment.id');
  EXECUTE v_src;
END $capability$;

COMMIT;
