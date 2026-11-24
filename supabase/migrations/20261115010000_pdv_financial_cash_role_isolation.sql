-- Remove bypass de cargo dos fatos PDV/vinculados a caixa; preserva geral sem caixa.
-- Fonte: definicoes publicadas v3/v4, capturadas antes da alteracao.
-- V4 usa campos da linha para INSERT RETURNING: essa otimizacao permanece.
-- Compras usam o vinculo estrutural OC/compra, sem backfill nem reclassificacao.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $apply$
DECLARE
  definitions CONSTANT jsonb := jsonb_build_array(
    jsonb_build_object('signature','public.pdv_can_read_financial_transaction_v3(uuid,uuid,uuid)',
      'accepted_hashes',to_jsonb(ARRAY['607f4949d7e69d9b2142c78aa09bca78','6f6a001586f8483ddad3e959d6791449','2bb3787a43cfa3b9273f775dd4282266','b3ca93dfb2b612e0f8aa4b4c1cbddd17','c77daa68f7f77ada2c0c64d1d400de9b']::text[]),
      'definition',$fixed_0$CREATE OR REPLACE FUNCTION public.pdv_can_read_financial_transaction_v3(p_user_id uuid, p_company_id uuid, p_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_transaction public.financial_transactions%ROWTYPE;
  v_cash_context record;
BEGIN
  IF p_user_id IS NULL
     OR public.get_user_company_id(p_user_id) IS DISTINCT FROM p_company_id
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles actor
        WHERE actor.user_id = p_user_id AND actor.company_id = p_company_id
          AND actor.is_active IS TRUE
     )
     OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM TRUE
  THEN
    RETURN FALSE;
  END IF;

  SELECT transaction.*
    INTO v_transaction
    FROM public.financial_transactions transaction
   WHERE transaction.id = p_transaction_id
     AND transaction.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_cash_context
    FROM public.pdv_resolve_financial_cash_context_internal_v5(
      p_company_id,p_transaction_id,v_transaction.origin,v_transaction.pdv_cash_session_id
    );
  IF v_cash_context.context_valid IS DISTINCT FROM TRUE THEN RETURN FALSE; END IF;

  -- Origem geral nao dispensa custodia quando o fato tem vinculo de caixa.
  IF v_cash_context.is_cash_bound
     AND public.company_has_module(p_company_id, 'pdv') IS DISTINCT FROM TRUE
  THEN
    RETURN FALSE;
  END IF;

  IF public.is_super_admin(p_user_id)
     OR public.pdv_has_explicit_action_permission_v2(
       p_user_id,
       'fn:operate_other_pdv_cash'
     )
  THEN
    RETURN TRUE;
  END IF;

  IF v_cash_context.is_cash_bound IS DISTINCT FROM TRUE THEN
    RETURN public.is_admin_or_gestor(p_user_id)
      OR public.user_has_permission(p_user_id, 'screen:finance')
      OR public.pdv_has_explicit_action_permission_v2(
        p_user_id,
        'fn:view_finance_totals'
      );
  END IF;

  IF v_cash_context.cash_session_id IS NOT NULL THEN
    RETURN public.pdv_can_access_cash_session_v3(
      p_user_id,
      p_company_id,
      v_cash_context.cash_session_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.pdv_order_payments payment
      JOIN public.pdv_orders orders
        ON orders.id = payment.order_id
       AND orders.company_id = payment.company_id
      JOIN public.pdv_cash_sessions session
        ON session.id = orders.cash_session_id
       AND session.company_id = orders.company_id
       AND session.terminal_id = orders.terminal_id
     WHERE payment.company_id = p_company_id
       AND (
         payment.receivable_transaction_id = p_transaction_id
         OR payment.settlement_transaction_id = p_transaction_id
       )
       AND public.pdv_can_access_cash_session_v3(
         p_user_id,
         p_company_id,
         session.id
       )
  );
END
$function$
$fixed_0$),
    jsonb_build_object('signature','public.can_read_financial_transaction_row_current_user_v4(uuid,uuid,text,uuid)',
      'accepted_hashes',to_jsonb(ARRAY['9c9ba38936e436917ad81b6bb8ad51ab','22655588abad4c9fedb53e15fecf438b','a2f901bdaeff3bb55cfe0d3023d18938','af3d48c46cf42e7e5c7a1d4f37abc7e9']::text[]),
      'definition',$fixed_1$CREATE OR REPLACE FUNCTION public.can_read_financial_transaction_row_current_user_v4(p_company_id uuid, p_transaction_id uuid, p_origin text, p_pdv_cash_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_cash_context record;
BEGIN
  IF v_user_id IS NULL
     OR public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles actor
        WHERE actor.user_id = v_user_id AND actor.company_id = p_company_id
          AND actor.is_active IS TRUE
     )
     OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM TRUE
  THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_cash_context
    FROM public.pdv_resolve_financial_cash_context_internal_v5(
      p_company_id,p_transaction_id,p_origin,p_pdv_cash_session_id
    );
  IF v_cash_context.context_valid IS DISTINCT FROM TRUE THEN RETURN FALSE; END IF;

  -- Origem geral nao dispensa custodia quando o fato tem vinculo de caixa.
  IF v_cash_context.is_cash_bound
     AND public.company_has_module(p_company_id, 'pdv') IS DISTINCT FROM TRUE
  THEN
    RETURN FALSE;
  END IF;

  IF public.is_super_admin(v_user_id)
     OR public.pdv_has_explicit_action_permission_v2(
       v_user_id,
       'fn:operate_other_pdv_cash'
     )
  THEN
    RETURN TRUE;
  END IF;

  -- Usa os campos da propria linha avaliada pela policy. Consultar novamente
  -- financial_transactions aqui nao enxerga a linha durante INSERT RETURNING.
  IF v_cash_context.is_cash_bound IS DISTINCT FROM TRUE THEN
    RETURN public.is_admin_or_gestor(v_user_id)
      OR public.user_has_permission(v_user_id, 'screen:finance')
      OR public.pdv_has_explicit_action_permission_v2(
        v_user_id,
        'fn:manage_finance'
      )
      OR public.pdv_has_explicit_action_permission_v2(
        v_user_id,
        'fn:view_finance_totals'
      );
  END IF;

  IF v_cash_context.cash_session_id IS NOT NULL THEN
    RETURN public.pdv_can_access_cash_session_v3(
      v_user_id,
      p_company_id,
      v_cash_context.cash_session_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.pdv_order_payments payment
      JOIN public.pdv_orders orders
        ON orders.id = payment.order_id
       AND orders.company_id = payment.company_id
      JOIN public.pdv_cash_sessions session
        ON session.id = orders.cash_session_id
       AND session.company_id = orders.company_id
       AND session.terminal_id = orders.terminal_id
     WHERE payment.company_id = p_company_id
       AND (
         payment.receivable_transaction_id = p_transaction_id
         OR payment.settlement_transaction_id = p_transaction_id
       )
       AND public.pdv_can_access_cash_session_v3(
         v_user_id,
         p_company_id,
         session.id
       )
  );
END
$function$
$fixed_1$)
  );
  resolver_definition CONSTANT text := $resolver$CREATE OR REPLACE FUNCTION public.pdv_resolve_financial_cash_context_internal_v5(
  p_company_id uuid,p_transaction_id uuid,p_origin text,p_pdv_cash_session_id uuid
)
RETURNS TABLE(is_cash_bound boolean,cash_session_id uuid,context_valid boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
DECLARE
  purchase_link record;
BEGIN
  is_cash_bound:=COALESCE(p_origin='pdv',false) OR p_pdv_cash_session_id IS NOT NULL;
  cash_session_id:=p_pdv_cash_session_id;
  context_valid:=true;
  -- O vinculo financeiro da OC e unico. Nao consulta financial_transactions,
  -- preservando INSERT RETURNING antes de o core vincular uma nova compra.
  SELECT orders.company_id AS order_company,purchase.company_id AS purchase_company,
         purchase.cash_session_id AS purchase_session,purchase.terminal_id AS purchase_terminal
    INTO purchase_link
    FROM public.compra_ordens orders
    LEFT JOIN public.compras purchase ON purchase.id=orders.compra_id
   WHERE orders.financial_transaction_id=p_transaction_id;
  IF FOUND THEN
    IF purchase_link.order_company IS DISTINCT FROM p_company_id
       OR purchase_link.purchase_company IS DISTINCT FROM p_company_id THEN
      is_cash_bound:=true;
      context_valid:=false;
    ELSIF purchase_link.purchase_session IS NOT NULL THEN
      is_cash_bound:=true;
      IF cash_session_id IS NOT NULL
         AND cash_session_id IS DISTINCT FROM purchase_link.purchase_session THEN
        context_valid:=false;
      END IF;
      cash_session_id:=purchase_link.purchase_session;
      IF purchase_link.purchase_terminal IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.pdv_cash_sessions session
        JOIN public.pdv_terminals terminal
          ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
        WHERE session.id=cash_session_id AND session.company_id=p_company_id
          AND session.terminal_id=purchase_link.purchase_terminal
      ) THEN context_valid:=false; END IF;
    ELSIF purchase_link.purchase_terminal IS NOT NULL THEN
      is_cash_bound:=true;
      context_valid:=false;
    END IF;
  END IF;
  IF cash_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.pdv_cash_sessions session
    JOIN public.pdv_terminals terminal
      ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE session.id=cash_session_id AND session.company_id=p_company_id
  ) THEN context_valid:=false; END IF;
  RETURN NEXT;
END
$function$
$resolver$;
  resolver_id regprocedure;
  target jsonb;
  object_id regprocedure;
  old_owner oid;
  old_acl aclitem[];
  old_config text[];
  current_hash text;
BEGIN
  -- Validar os dois alvos antes de substituir qualquer definicao.
  FOR target IN SELECT value FROM jsonb_array_elements(definitions) LOOP
    object_id:=to_regprocedure(target->>'signature');
    IF object_id IS NULL THEN
      -- Uma base recriada pelas migrations anteriores usa a policy segura v3.
      -- Nao criar endpoint v4 com grants padrao para simular a base publicada.
      IF target->>'signature' LIKE 'public.can_read_financial_transaction_row_current_user_v4%' THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'Helper financeiro obrigatorio ausente: %',target->>'signature';
    END IF;
    SELECT md5(pg_get_functiondef(object_id)) INTO current_hash;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(target->'accepted_hashes') accepted(hash)
      WHERE accepted.hash=current_hash) THEN
      RAISE EXCEPTION 'Definicao financeira mudou; revisar antes de aplicar: %',target->>'signature';
    END IF;
  END LOOP;

  resolver_id:=to_regprocedure('public.pdv_resolve_financial_cash_context_internal_v5(uuid,uuid,text,uuid)');
  IF resolver_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_proc
    WHERE oid=resolver_id AND md5(prosrc)='e3c93d00550abbf569ec81d36d31eecd'
      AND proowner=current_user::regrole AND prosecdef AND provolatile='s'
      AND proconfig=ARRAY['search_path=pg_catalog, public']::text[]
      AND pg_get_function_result(oid)='TABLE(is_cash_bound boolean, cash_session_id uuid, context_valid boolean)') THEN
    RAISE EXCEPTION 'Resolver de custodia existente divergiu; revisar antes de aplicar.';
  END IF;
  EXECUTE resolver_definition;
  -- Novo helper owner-only: nenhum grant publico fica exposto ao commit.
  EXECUTE 'REVOKE ALL ON FUNCTION public.pdv_resolve_financial_cash_context_internal_v5(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role';

  FOR target IN SELECT value FROM jsonb_array_elements(definitions) LOOP
    object_id:=to_regprocedure(target->>'signature');
    IF object_id IS NULL THEN CONTINUE; END IF;
    SELECT proowner,proacl,proconfig INTO old_owner,old_acl,old_config
      FROM pg_proc WHERE oid=object_id;
    EXECUTE target->>'definition';
    IF NOT EXISTS(SELECT 1 FROM pg_proc
       WHERE oid=object_id AND proowner=old_owner
         AND proacl IS NOT DISTINCT FROM old_acl
         AND proconfig IS NOT DISTINCT FROM old_config) THEN
      RAISE EXCEPTION 'Owner, ACL ou configuracao do helper financeiro mudou: %',target->>'signature';
    END IF;
  END LOOP;
END
$apply$;
;
