-- O cálculo assinado de crédito é compartilhado; autorização de pós-venda
-- não herda a tela do caixa exigida pela consulta pública do extrato.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $canonical_credit_statement$
DECLARE definition text; internal_definition text; anchor text; replacement text; first_position integer; last_position integer;
BEGIN
 SELECT pg_get_functiondef('public.pdv_customer_credit_statement_v2(uuid)'::regprocedure) INTO definition;
 anchor:='public.pdv_customer_credit_statement_v2('; replacement:='public.pdv_customer_credit_statement_internal_v4(';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'A declaração do extrato de crédito mudou'; END IF;
 internal_definition:=replace(definition,anchor,replacement);
 anchor:='p_customer_id uuid)'; replacement:='p_company_id uuid, p_customer_id uuid)';
 IF (length(internal_definition)-length(replace(internal_definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'A assinatura do extrato de crédito mudou'; END IF;
 internal_definition:=replace(internal_definition,anchor,replacement);
 anchor:='  SELECT * INTO v_context FROM public.pdv_cash_v2_context();';
 replacement:='  SELECT p_company_id AS company_id INTO v_context;';
 IF (length(internal_definition)-length(replace(internal_definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'A autorização do extrato de crédito mudou'; END IF;
 internal_definition:=replace(internal_definition,anchor,replacement);
 -- O helper privado conserva literalmente a consulta vigente, inclusive
 -- créditos negativos, ajustes legados, quitações e compensações de crédito.
 IF position('''party_credit_position''' IN internal_definition)=0 OR position('''legacy_direct_settlement''' IN internal_definition)=0
  OR position('entry.target_financial_transaction_id IS NULL' IN internal_definition)=0 THEN
  RAISE EXCEPTION 'A fonte canônica da posição de crédito mudou'; END IF;
 EXECUTE internal_definition;
 first_position:=position('  RETURN QUERY' IN definition);
 last_position:=position('  ORDER BY occurred_at, entry_id;' IN definition);
 IF first_position=0 OR last_position<=first_position THEN RAISE EXCEPTION 'A consulta canônica do extrato mudou'; END IF;
 anchor:=substring(definition FROM first_position FOR last_position-first_position+length('  ORDER BY occurred_at, entry_id;'));
 replacement:='  RETURN QUERY SELECT * FROM public.pdv_customer_credit_statement_internal_v4(v_context.company_id,p_customer_id);';
 -- CREATE OR REPLACE mantém a autorização completa, owner e ACL originais.
 EXECUTE replace(definition,anchor,replacement);
END $canonical_credit_statement$;
REVOKE ALL ON FUNCTION public.pdv_customer_credit_statement_internal_v4(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $exchange_credit_scope$
DECLARE definition text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid)'::regprocedure) INTO definition;
 anchor:=$anchor$    SELECT round(COALESCE(sum(statement.amount),0),2) INTO v_open_credit
      FROM public.pdv_customer_credit_statement_v2(v_order.customer_id) statement;$anchor$;
 replacement:=$replacement$    -- PDV_EXCHANGE_PRIVATE_CREDIT_V4: mesmas autoridades após espera no voucher.
    PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
    IF public.pdv_current_actor_can_access_session_v3(v_target_session.id) IS DISTINCT FROM TRUE
      OR NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=v_target_session.cash_account_id AND account.company_id=v_context.company_id AND account.is_active IS TRUE AND account.type='caixa') THEN
      RAISE EXCEPTION 'O caixa de destino mudou. Atualize o pós-venda.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_denied'; END IF;
    SELECT round(COALESCE(sum(statement.amount),0),2) INTO v_open_credit
      FROM public.pdv_customer_credit_statement_internal_v4(v_context.company_id,v_order.customer_id) statement;$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
  OR position('PDV_EXCHANGE_TARGET_CASH_V2' IN definition)=0
  OR position('PDV_EXCHANGE_ATOMIC_RESERVATION_V1' IN definition)=0 THEN RAISE EXCEPTION 'A decisão de fiado da troca mudou'; END IF;
 EXECUTE replace(definition,anchor,replacement);
END $exchange_credit_scope$;
COMMIT;
