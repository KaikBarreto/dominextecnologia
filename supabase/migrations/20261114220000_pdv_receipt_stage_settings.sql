-- Preferências por etapa, sem alterar pedidos, snapshots ou fatos financeiros.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.pdv_receipt_stages_valid_v3(p_stages jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,public AS $fn$
DECLARE v_stage text; v_policy jsonb;
BEGIN
  IF p_stages IS NULL OR jsonb_typeof(p_stages) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_stages))<>3
     OR NOT (p_stages ?& ARRAY['budget','sale','delivery']) THEN RETURN false; END IF;
  FOREACH v_stage IN ARRAY ARRAY['budget','sale','delivery'] LOOP
    v_policy:=p_stages->v_stage;
    IF jsonb_typeof(v_policy) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_policy))<>3
       OR NOT (v_policy ?& ARRAY['auto_print','format','copies'])
       OR jsonb_typeof(v_policy->'auto_print') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(v_policy->'format') IS DISTINCT FROM 'string'
       OR v_policy->>'format' NOT IN ('a4','58mm','80mm')
       OR jsonb_typeof(v_policy->'copies') IS DISTINCT FROM 'number'
       OR (v_policy->'copies') NOT IN ('1'::jsonb,'2'::jsonb,'3'::jsonb) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_receipt_stages_valid_v3(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.pdv_receipt_settings ADD COLUMN stages jsonb;
ALTER TABLE public.pdv_receipt_settings ADD CONSTRAINT pdv_receipt_stages_valid_v3
 CHECK (stages IS NULL OR public.pdv_receipt_stages_valid_v3(stages));

CREATE OR REPLACE FUNCTION public.pdv_receipt_effective_stages_v3(
 p_stages jsonb,p_format text,p_auto_print boolean,p_copies integer
) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,public AS $fn$
 SELECT COALESCE(p_stages,jsonb_build_object(
  'budget',jsonb_build_object('auto_print',false,'format',p_format,'copies',p_copies),
  'sale',jsonb_build_object('auto_print',p_auto_print,'format',p_format,'copies',p_copies),
  'delivery',jsonb_build_object('auto_print',false,'format',p_format,'copies',p_copies)
 ))
$fn$;
REVOKE ALL ON FUNCTION public.pdv_receipt_effective_stages_v3(jsonb,text,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_get_receipt_settings_v3()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid; v_row public.pdv_receipt_settings%ROWTYPE;
BEGIN
 IF v_user IS NULL THEN
  RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.' USING ERRCODE='42501',DETAIL='code=pdv_receipt_auth_required';
 END IF;
 v_company:=public.get_user_company_id(v_user);
 IF v_company IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_user AND p.company_id=v_company AND COALESCE(p.is_active,true)) THEN
  RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.' USING ERRCODE='42501',DETAIL='code=pdv_receipt_company_required';
 END IF;
 IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
    OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'O módulo PDV não está disponível para esta empresa.' USING ERRCODE='42501',DETAIL='code=pdv_receipt_module_denied';
 END IF;
 IF NOT public.is_admin_or_gestor(v_user) AND NOT public.is_super_admin(v_user)
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['screen:pdv_settings','screen:pdv','screen:pdv_orders','screen:pdv_dispatch','screen:pdv_preorders']) AS permissions(permission)
     WHERE public.pdv_has_explicit_action_permission_v2(v_user,permission) IS TRUE) THEN
  RAISE EXCEPTION 'Você não tem permissão para consultar os comprovantes do PDV.' USING ERRCODE='42501',DETAIL='code=pdv_receipt_screen_denied';
 END IF;
 SELECT * INTO v_row FROM public.pdv_receipt_settings WHERE company_id=v_company;
 RETURN jsonb_build_object('default_format',COALESCE(v_row.default_format,'80mm'),
  'auto_print',COALESCE(v_row.auto_print,false),'copies',COALESCE(v_row.copies,1),
  'stages',public.pdv_receipt_effective_stages_v3(v_row.stages,COALESCE(v_row.default_format,'80mm'),COALESCE(v_row.auto_print,false),COALESCE(v_row.copies,1)));
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_receipt_settings_v3(
 p_default_format text,p_auto_print boolean,p_copies integer,p_stages jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
 SELECT * INTO v_context FROM public.pdv_receipt_settings_context_v2();
 IF NOT public.is_admin_or_gestor(v_context.user_id) AND NOT public.is_super_admin(v_context.user_id)
    AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:manage_pdv_settings') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Você não tem permissão para alterar as configurações do PDV.' USING ERRCODE='42501',DETAIL='code=pdv_receipt_manage_denied';
 END IF;
 IF p_default_format IS NULL OR p_default_format NOT IN ('a4','58mm','80mm')
    OR p_auto_print IS NULL OR p_copies IS NULL OR p_copies NOT BETWEEN 1 AND 3
    OR public.pdv_receipt_stages_valid_v3(p_stages) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Revise as opções dos comprovantes de cada etapa.' USING ERRCODE='22023',DETAIL='code=pdv_receipt_settings_invalid';
 END IF;
 IF (p_stages->'sale'->>'auto_print')::boolean IS DISTINCT FROM p_auto_print
    OR (p_stages->'sale'->>'copies')::numeric IS DISTINCT FROM p_copies::numeric THEN
  RAISE EXCEPTION 'Revise as opções dos comprovantes de cada etapa.' USING ERRCODE='22023',DETAIL='code=pdv_receipt_settings_invalid';
 END IF;
 INSERT INTO public.pdv_receipt_settings(company_id,default_format,auto_print,copies,stages,updated_by)
 VALUES(v_context.company_id,p_default_format,p_auto_print,p_copies,p_stages,v_context.user_id)
 ON CONFLICT(company_id) DO UPDATE SET default_format=excluded.default_format,auto_print=excluded.auto_print,
 copies=excluded.copies,stages=excluded.stages,updated_by=excluded.updated_by,updated_at=now();
 RETURN public.pdv_get_receipt_settings_v3();
END $fn$;

-- Clientes anteriores continuam atualizando o comprovante da venda e preservam
-- as escolhas independentes de orçamento/retirada já salvas por clientes v3.
CREATE OR REPLACE FUNCTION public.pdv_save_receipt_settings_v2(
 p_default_format text,p_auto_print boolean,p_copies integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_stages jsonb;
BEGIN
 SELECT * INTO v_context FROM public.pdv_receipt_settings_context_v2();
 SELECT public.pdv_receipt_effective_stages_v3(stages,p_default_format,p_auto_print,p_copies)
 INTO v_stages FROM public.pdv_receipt_settings WHERE company_id=v_context.company_id;
 v_stages:=public.pdv_receipt_effective_stages_v3(v_stages,p_default_format,p_auto_print,p_copies);
 v_stages:=jsonb_set(v_stages,'{sale}',jsonb_build_object('auto_print',p_auto_print,'format',p_default_format,'copies',p_copies));
 RETURN public.pdv_save_receipt_settings_v3(p_default_format,p_auto_print,p_copies,v_stages)-'stages';
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_get_receipt_settings_v3() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_save_receipt_settings_v3(text,boolean,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_save_receipt_settings_v2(text,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_receipt_settings_v3() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_save_receipt_settings_v3(text,boolean,integer,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_save_receipt_settings_v2(text,boolean,integer) TO authenticated,service_role;
COMMENT ON COLUMN public.pdv_receipt_settings.stages IS 'Políticas independentes de abertura, formato e vias para orçamento, pedido e retirada. NULL preserva o comportamento legado.';
COMMIT;
