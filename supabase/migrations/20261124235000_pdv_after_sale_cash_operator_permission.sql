-- Alinha pós-venda e recebíveis à capacidade nominal já usada pela seleção
-- de caixa. Não concede permissões nem altera fatos financeiros.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
DO $cash_permission$
DECLARE
  patch record;
  signature regprocedure;
  definition text;
  old_acl aclitem[];
  old_owner oid;
  old_config text[];
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ('public.pdv_settle_refund_internal_v2(uuid,uuid,uuid,uuid,uuid,uuid)',
     $old$IF v_session.opened_by IS DISTINCT FROM p_user_id AND NOT public.is_admin_or_gestor(p_user_id)
       AND NOT public.is_super_admin(p_user_id) THEN$old$,
     $new$IF v_session.opened_by IS DISTINCT FROM p_user_id
      AND public.pdv_can_operate_other_cash_v2(p_user_id) IS DISTINCT FROM TRUE THEN$new$),
    ('public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid)',
     $old$IF v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND NOT public.is_admin_or_gestor(v_context.user_id) AND NOT public.is_super_admin(v_context.user_id) THEN$old$,
     $new$IF v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM TRUE THEN$new$),
    ('public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)',
     $old$IF v_session.opened_by IS DISTINCT FROM v_context.user_id
       AND NOT public.is_admin_or_gestor(v_context.user_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.user_permissions permission
          WHERE permission.user_id = v_context.user_id
            AND permission.is_active
            AND (permission.permissions ? '*' OR permission.permissions ? 'fn:edit_pdv_sales')
       )
    THEN$old$,
     $new$IF v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM TRUE THEN$new$),
    ('public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)',
     $old$IF v_session.opened_by IS DISTINCT FROM v_context.user_id
       AND NOT public.is_admin_or_gestor(v_context.user_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.user_permissions permission
          WHERE permission.user_id = v_context.user_id
            AND permission.is_active
            AND (permission.permissions ? '*' OR permission.permissions ? 'fn:edit_pdv_sales')
       )
    THEN$old$,
     $new$IF v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM TRUE THEN$new$),
    ('public.pdv_get_after_sale_workspace_core_015_v2(uuid)',
     $old$AND (session.opened_by=v_context.user_id OR v_admin)$old$,
     $new$AND (session.opened_by=v_context.user_id OR public.pdv_can_operate_other_cash_v2(v_context.user_id) IS TRUE)$new$)
  ) AS changes(signature, old_guard, new_guard) LOOP
    signature := patch.signature::regprocedure;
    SELECT pg_get_functiondef(p.oid), p.proacl, p.proowner, p.proconfig
      INTO definition, old_acl, old_owner, old_config FROM pg_proc p WHERE p.oid=signature;
    IF position('PDV_AFTER_SALE_CASH_PERMISSION_V1' IN definition)>0 THEN CONTINUE; END IF;
    IF (length(definition)-length(replace(definition,patch.old_guard,'')))/length(patch.old_guard)<>1 THEN
      RAISE EXCEPTION 'Validação do caixa mudou; revisar % antes de aplicar.',signature;
    END IF;
    definition := replace(definition,patch.old_guard,patch.new_guard);
    definition := replace(definition,'AS $function$','AS $function$' || E'
-- PDV_AFTER_SALE_CASH_PERMISSION_V1');
    EXECUTE definition;
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=signature AND p.prosecdef
      AND p.proacl IS NOT DISTINCT FROM old_acl AND p.proowner=old_owner
      AND p.proconfig IS NOT DISTINCT FROM old_config) THEN
      RAISE EXCEPTION 'Contrato de segurança alterado em %.',signature;
    END IF;
  END LOOP;
END
$cash_permission$;
COMMIT;
