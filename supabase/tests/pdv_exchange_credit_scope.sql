-- Estrutura/ACL complementam o caso real FIADO na fixture309 e a suíte de saldo assinado.
BEGIN;
DO $contract$
DECLARE definition text; caller text;
BEGIN
 IF has_function_privilege('anon','public.pdv_customer_credit_statement_internal_v4(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.pdv_customer_credit_statement_internal_v4(uuid,uuid)','EXECUTE')
  OR has_function_privilege('service_role','public.pdv_customer_credit_statement_internal_v4(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE')
  OR has_function_privilege('anon','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Extrato privado foi exposto à API'; END IF;
 SELECT pg_get_functiondef('public.pdv_customer_credit_statement_internal_v4(uuid,uuid)'::regprocedure) INTO definition;
 IF position('pdv_cash_v2_context' IN definition)>0 OR position('SELECT p_company_id AS company_id INTO v_context' IN definition)=0
  OR position('''party_credit_position''' IN definition)=0 OR position('''legacy_ledger''' IN definition)=0
  OR position('''legacy_direct_settlement''' IN definition)=0 OR position('entry.target_financial_transaction_id IS NULL' IN definition)=0 THEN RAISE EXCEPTION 'Extrato privado perdeu fonte canônica'; END IF;
 SELECT pg_get_functiondef('public.pdv_customer_credit_statement_v2(uuid)'::regprocedure) INTO definition;
 IF position('pdv_cash_v2_context()' IN definition)=0 OR position('customer.company_id = v_context.company_id' IN definition)=0
  OR position('pdv_customer_credit_statement_internal_v4(v_context.company_id,p_customer_id)' IN definition)=0 THEN RAISE EXCEPTION 'Extrato público perdeu autorização original'; END IF;
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid)'::regprocedure) INTO caller;
 IF position('PDV_EXCHANGE_PRIVATE_CREDIT_V4' IN caller)=0 OR position('public.pdv_customer_credit_statement_v2(' IN caller)>0
  OR position('pdv_customer_credit_statement_internal_v4(v_context.company_id,v_order.customer_id)' IN caller)=0
  OR position('v_open_credit+v_difference<=customer.credit_limit' IN caller)=0 THEN RAISE EXCEPTION 'Troca perdeu cálculo/limite canônicos'; END IF;
END $contract$;
ROLLBACK;
