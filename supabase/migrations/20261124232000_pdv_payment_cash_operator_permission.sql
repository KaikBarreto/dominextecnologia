-- A seleção de caixa já respeita a capacidade nominal. Os dois writers
-- internos ainda repetiam a regra antiga por cargo e negavam o recebimento
-- de operadores autorizados. Alinha somente esse predicado; preserva os
-- corpos atuais (cupons, vouchers, estoque, custódia e idempotência) e ACLs.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $cash_permission$
DECLARE
  signature regprocedure;
  definition text;
  old_guard text;
  new_guard text;
  actor text;
  old_acl aclitem[];
  old_owner oid;
  old_config text[];
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure,
    'public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(p.oid), p.proacl, p.proowner, p.proconfig
      INTO definition, old_acl, old_owner, old_config
      FROM pg_proc p WHERE p.oid = signature;

    IF position('PDV_PAYMENT_CASH_PERMISSION_V1' IN definition) > 0 THEN
      CONTINUE;
    END IF;

    IF signature = 'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure THEN
      actor := 'v_uid';
      old_guard := $guard$  IF NOT FOUND OR (
    v_session.opened_by IS DISTINCT FROM v_uid
    AND NOT public.is_admin_or_gestor(v_uid)
    AND NOT public.is_super_admin(v_uid)
  ) THEN$guard$;
    ELSE
      actor := 'v_context.user_id';
      old_guard := $guard$  IF NOT FOUND OR (v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND NOT public.is_admin_or_gestor(v_context.user_id)
      AND NOT public.is_super_admin(v_context.user_id)) THEN$guard$;
    END IF;

    -- Uma única âncora literal. Divergência de implementação aborta tudo,
    -- sem reconstituir writers extensos a partir de uma versão antiga.
    IF (length(definition) - length(replace(definition, old_guard, '')))
         / length(old_guard) <> 1 THEN
      RAISE EXCEPTION 'A validação interna do caixa mudou; revisar % antes de aplicar.', signature;
    END IF;

    new_guard := format($guard$  -- PDV_PAYMENT_CASH_PERMISSION_V1: mesma capacidade do catálogo e do wrapper.
  IF NOT FOUND OR (
    v_session.opened_by IS DISTINCT FROM %s
    AND public.pdv_can_operate_other_cash_v2(%s) IS DISTINCT FROM TRUE
  ) THEN$guard$, actor, actor);
    EXECUTE replace(definition, old_guard, new_guard);

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = signature
         AND p.prosecdef
         AND p.proacl IS NOT DISTINCT FROM old_acl
         AND p.proowner = old_owner
         AND p.proconfig IS NOT DISTINCT FROM old_config
    ) THEN
      RAISE EXCEPTION 'A correção alterou o contrato de segurança de %.', signature;
    END IF;
  END LOOP;
END
$cash_permission$;
COMMIT;
