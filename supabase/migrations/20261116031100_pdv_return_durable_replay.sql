-- Replay da intenção congelada preserva a data original mesmo no dia seguinte.
-- Autorização, tenant/módulo/local, formato e hash canônico permanecem intactos.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $return_temporal_replay$
DECLARE s text; backdate_guard text; anchor text; inserted text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_return_delivery_items_core_015_v2(uuid,jsonb,jsonb,date,text,text)'::regprocedure) INTO s;
 IF position('PDV_RETURN_DURABLE_REPLAY_V1' IN s)>0 THEN RETURN; END IF;
 anchor:=' OR v_date>public.company_today(v_context.company_id)';
 IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'A validação de data da devolução mudou.'; END IF;
 s:=replace(s,anchor,'');
 backdate_guard:=$guard$  IF v_date<public.company_today(v_context.company_id)
    AND NOT public.is_admin_or_gestor(v_context.user_id) AND NOT public.is_super_admin(v_context.user_id)
    AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:backdate_pdv_return') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar devolução em data anterior.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_backdate_forbidden'; END IF;
$guard$;
 IF position(backdate_guard IN s)=0 THEN RAISE EXCEPTION 'A autorização de data retroativa da devolução mudou.'; END IF;
 s:=replace(s,backdate_guard,'');
 anchor:='  -- Hierarquia canônica W1/W2:';
 inserted:=$insert$  -- PDV_RETURN_DURABLE_REPLAY_V1: somente intenção NOVA depende do dia atual.
  IF v_date>public.company_today(v_context.company_id) THEN
    RAISE EXCEPTION 'Revise a data da devolução.' USING ERRCODE='22023',DETAIL='code=pdv_return_payload_invalid';
  END IF;
$insert$||backdate_guard||chr(10)||anchor;
 IF position(anchor IN s)=0 THEN RAISE EXCEPTION 'O replay da devolução mudou antes da autorização temporal.'; END IF;
 EXECUTE replace(s,anchor,inserted);
END $return_temporal_replay$;
COMMIT;
