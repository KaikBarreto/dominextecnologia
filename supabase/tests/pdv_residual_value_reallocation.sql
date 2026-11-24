-- Redistribuição residual pelos writers canônicos; dados fictícios e rollback integral.
-- Duas intenções observam o mesmo hash e a segunda é recusada após a primeira.
-- Essa prova serial não substitui a corrida real de duas conexões, centralizada no root.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $contract$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.pdv_get_residual_disposition_plan_v4(uuid)','public.pdv_reallocate_residual_value_v4(uuid,jsonb,text,text,text)'] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('service_role',signature,'EXECUTE')
      OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN RAISE EXCEPTION 'ACL incorreta em %',signature; END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.pdv_residual_disposition_plan_internal_v4(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Helper privado exposto'; END IF;
END $contract$;

DO $behavior$
<<fixture>>
DECLARE
  c uuid:='f3160500-0000-4000-8000-000000000001'; u uuid:='f3160500-0000-4000-8000-000000000002';
  other_u uuid:='f3160500-0000-4000-8000-000000000003'; cx uuid:='f3160500-0000-4000-8000-000000000004';
  stock uuid:='f3160500-0000-4000-8000-000000000011'; cash uuid:='f3160500-0000-4000-8000-000000000012'; bank uuid:='f3160500-0000-4000-8000-000000000013';
  terminal uuid:='f3160500-0000-4000-8000-000000000014'; material uuid:='f3160500-0000-4000-8000-000000000015'; customer uuid:='f3160500-0000-4000-8000-000000000016';
  preorder uuid:=gen_random_uuid(); item uuid; reservation uuid; session_id uuid; v_order uuid; cancel_id uuid;
  cash_payment uuid; bank_payment uuid; debt_payment uuid; initial_voucher uuid; next_voucher uuid; cash_refund uuid; receivable uuid;
  result jsonb; replay jsonb; plan jsonb; old_plan jsonb; second_plan jsonb; destinations jsonb; initial jsonb; physical_before jsonb; physical_after jsonb;
  permissions jsonb:='["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","screen:pdv_settings","screen:customers","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:cover_pdv_order","fn:deliver_pdv_order","fn:complete_direct_sale","fn:return_pdv_order","fn:use_bank_accounts","fn:approve_pdv_credit","fn:cancel_pdv_order_residual","fn:manage_party_credit","fn:view_customer_financial","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return","fn:reverse_pdv_refund","fn:reverse_pdv_after_sale","fn:confirm_pdv_refund"]';
  denied boolean; detail text; permission text; scenario text; request_key text; custody_before numeric; custody_after numeric; target_preorder uuid; target_order uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(u,other_u)) THEN RAISE EXCEPTION 'IDs de fixture já existem'; END IF;
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
    VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','residual-reallocate@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',other_u,'authenticated','authenticated','residual-reallocate-other@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture nova destinação residual','active'),(cx,'Outro tenant residual','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(u,other_u);
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'comercial'),(other_u,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,permissions,true),(other_u,permissions,true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fictício','caixa',100,true),(bank,c,'Banco fictício','banco',100,true);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Fixture residual','America/Sao_Paulo',cash,true,'balcao') ON CONFLICT(company_id) DO UPDATE SET timezone='America/Sao_Paulo',pdv_cash_account_id=cash,pdv_strict_cash_tracking=true,pdv_mode='balcao';
  UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fictício',true);
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock,u);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Caixa original fictício',stock,true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'RED5000','Material fictício','un',100,2,5);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,100,true);
  INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,c,'Cliente fictício residual',500,false);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');
  result:=public.pdv_open_cash_session_v2(terminal,cash,100,'red5000-open'); session_id:=(result->>'session_id')::uuid;
  result:=public.pdv_save_preorder_v2(preorder,0,jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','discount_amount',0),
    jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',material,'item_type','material','description','Material fictício','quantity',18,'unit_price',5,'discount_amount',0,'unit_factor',1,'sort_order',0)),'red5000-preorder');
  PERFORM public.pdv_assign_preorder_terminal_v3(preorder,1,terminal,'red5000-target');
  PERFORM public.pdv_forward_preorder_v2(preorder,2,'red5000-forward');
  result:=public.pdv_convert_preorder_v2(preorder,3,'red5000-convert'); v_order:=(result->>'order_id')::uuid;
  PERFORM public.pdv_cover_existing_order_v2(v_order,terminal,session_id,cash,jsonb_build_array(
    jsonb_build_object('method','dinheiro','amount',20),jsonb_build_object('method','pix','amount',20,'account_id',bank),
    jsonb_build_object('method','fiado','amount',50,'due_date',current_date+30)),'red5000-cover');
  EXECUTE 'RESET ROLE';
  SELECT oi.id INTO item FROM public.pdv_order_items oi WHERE oi.order_id=v_order;
  SELECT r.id INTO reservation FROM public.pdv_stock_reservation_items r WHERE r.order_item_id=item;
  SELECT p.id INTO cash_payment FROM public.pdv_order_payments p WHERE p.order_id=v_order AND p.method='dinheiro';
  SELECT p.id INTO bank_payment FROM public.pdv_order_payments p WHERE p.order_id=v_order AND p.method='pix';
  SELECT p.id,p.receivable_transaction_id INTO debt_payment,receivable FROM public.pdv_order_payments p WHERE p.order_id=v_order AND p.method='fiado';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.pdv_complete_dispatch_delivery_v2(v_order,jsonb_build_array(jsonb_build_object('order_item_id',item,'reservation_id',reservation,'quantity',5)),'red5000-deliver');
  plan:=public.pdv_get_order_residual_plan_v3(v_order);
  result:=public.pdv_cancel_order_residual_v3(v_order,'Cancelamento fictício',jsonb_build_array(
    jsonb_build_object('kind','voucher','original_payment_id',cash_payment,'amount',10),
    jsonb_build_object('kind','voucher','original_payment_id',bank_payment,'amount',5)),plan->>'plan_hash','red5000-cancel');
  cancel_id:=(result->>'cancellation_id')::uuid;
  FOR initial IN SELECT r FROM jsonb_array_elements(result->'resources') r LOOP
    PERFORM public.pdv_reverse_return_voucher_v2((initial->>'voucher_id')::uuid,'Estorno fictício para novo destino','red5000-initial-reverse-'||(initial->>'voucher_id'));
  END LOOP;
  old_plan:=public.pdv_get_residual_disposition_plan_v4(v_order); second_plan:=public.pdv_get_residual_disposition_plan_v4(v_order);
  IF old_plan->>'plan_hash'<>second_plan->>'plan_hash' OR (old_plan->>'free_amount')::numeric<>15 THEN RAISE EXCEPTION 'Duas intenções não observaram os mesmos15 livres'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT jsonb_build_object('source',to_jsonb(src),'order_status',o.status,
    'movements',(SELECT count(*) FROM public.inventory_movements WHERE inventory_id=material),
    'quantity',(SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock),
    'reservation',(SELECT to_jsonb(r) FROM public.pdv_stock_reservation_items r WHERE r.id=reservation),
    'deliveries',(SELECT count(*) FROM public.pdv_deliveries d WHERE d.order_id=v_order),
    'cmv',(SELECT sum(di.cmv_amount_snapshot) FROM public.pdv_delivery_items di WHERE di.order_item_id=item),
    'debt_reduction',(SELECT sum(d.amount) FROM public.pdv_return_dispositions d WHERE d.residual_cancellation_id=cancel_id AND d.disposition_kind='receivable_reduction'),
    'receivable_open',public.pdv_party_obligation_open_v2(receivable)) INTO physical_before
    FROM public.pdv_order_residual_cancellations src JOIN public.pdv_orders o ON o.id=src.order_id WHERE src.id=cancel_id;
  SELECT COALESCE(sum(e.amount),0) INTO custody_before FROM public.pdv_cash_custody_entries e WHERE e.company_id=c;
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- Orçamento por pagamento é10/5, embora cada pagamento original tenha20.
  denied:=false; BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','customer_credit','original_payment_id',cash_payment,'amount',15)),old_plan->>'plan_hash','red5000-over-payment','Novo destino');
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; denied:=detail LIKE '%payment_exceeded%'; END;
  IF NOT denied THEN RAISE EXCEPTION 'Usou orçamento de outro pagamento ou total original20'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','customer_credit','original_payment_id',debt_payment,'amount',15)),old_plan->>'plan_hash','red5000-fake-paid','Novo destino');
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Fiado abatido virou valor pago redistribuível'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','customer_credit','original_payment_id',cash_payment,'amount',9.99),jsonb_build_object('kind','voucher','original_payment_id',bank_payment,'amount',5)),old_plan->>'plan_hash','red5000-inexact','Novo destino');
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Aceitou soma incompleta'; END IF;
  -- Revogações após carregar o plano não são supridas pelo filtro da UI.
  FOREACH scenario IN ARRAY ARRAY['expired','module_revoked','inactive_profile','stock_revoked','other_cash','foreign_tenant'] LOOP
    BEGIN
      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','service_role')::text,true);
      IF scenario='expired' THEN UPDATE public.companies SET subscription_expires_at=now()-interval '10 days' WHERE id=c;
      ELSIF scenario='module_revoked' THEN DELETE FROM public.company_modules WHERE company_id=c AND module_code='pdv';
      ELSIF scenario='inactive_profile' THEN UPDATE public.profiles SET is_active=false WHERE user_id=u;
      ELSIF scenario='stock_revoked' THEN DELETE FROM public.stock_access WHERE company_id=c AND stock_id=fixture.stock;INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock,other_u);
      END IF;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN scenario IN('other_cash','foreign_tenant') THEN other_u ELSE u END,'role','authenticated')::text,true);
      IF scenario='foreign_tenant' THEN UPDATE public.profiles SET company_id=cx WHERE user_id=other_u; END IF;
      EXECUTE 'SET LOCAL ROLE authenticated';denied:=false;
      BEGIN PERFORM public.pdv_get_residual_disposition_plan_v4(v_order);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
      IF NOT denied THEN RAISE EXCEPTION 'Plano ignorou revogação %',scenario;END IF;
      denied:=false;
      BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','customer_credit','original_payment_id',cash_payment,'amount',10),jsonb_build_object('kind','customer_credit','original_payment_id',bank_payment,'amount',5)),old_plan->>'plan_hash','red5000-revoked-'||scenario,'Revogação fictícia');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
      IF NOT denied THEN RAISE EXCEPTION 'Writer ignorou revogação %',scenario;END IF;
      RAISE EXCEPTION 'rollback_revocation' USING ERRCODE='P1593';
    EXCEPTION WHEN SQLSTATE 'P1593' THEN NULL;
    END;
  END LOOP;
  -- Distribui somente o livre: crédito5 + voucher5 do dinheiro; Pix5 pendente.
  destinations:=jsonb_build_array(jsonb_build_object('kind','customer_credit','original_payment_id',cash_payment,'amount',5),
    jsonb_build_object('kind','voucher','original_payment_id',cash_payment,'amount',5),
    jsonb_build_object('kind','refund','original_payment_id',bank_payment,'amount',5,'account_id',bank));
  result:=public.pdv_reallocate_residual_value_v4(v_order,destinations,old_plan->>'plan_hash','red5000-winner','Nova destinação fictícia');
  IF (public.pdv_get_residual_disposition_plan_v4(v_order)->>'free_amount')::numeric<>0 OR jsonb_array_length(result->'resources')<>3 THEN RAISE EXCEPTION 'Redistribuição não fechou15'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,destinations,second_plan->>'plan_hash','red5000-second-intent','Segunda intenção no mesmo saldo');
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Duas intenções consumiram o mesmo saldo livre'; END IF;
  replay:=public.pdv_reallocate_residual_value_v4(v_order,destinations,old_plan->>'plan_hash','red5000-winner','Nova destinação fictícia');
  IF replay->>'idempotent'<>'true' OR replay->'resources'<>result->'resources' THEN RAISE EXCEPTION 'Replay duplicou ou alterou recursos'; END IF;
  SELECT (r->>'voucher_id')::uuid INTO next_voucher FROM jsonb_array_elements(result->'resources') r WHERE r->>'kind'='voucher';
  -- Consumo parcial mantém5 comprometidos; não vira saldo3 novamente destinável.
  BEGIN
    target_preorder:=gen_random_uuid();
    PERFORM public.pdv_save_preorder_v2(target_preorder,0,jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','discount_amount',0),
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',material,'item_type','material','description','Uso parcial fictício','quantity',1,'unit_price',5,'discount_amount',0,'unit_factor',1,'sort_order',0)),'red5000-partial-preorder');
    PERFORM public.pdv_assign_preorder_terminal_v3(target_preorder,1,terminal,'red5000-partial-target');
    PERFORM public.pdv_forward_preorder_v2(target_preorder,2,'red5000-partial-forward');
    replay:=public.pdv_convert_preorder_v2(target_preorder,3,'red5000-partial-convert');target_order:=(replay->>'order_id')::uuid;
    PERFORM public.pdv_cover_existing_order_v2(target_order,terminal,session_id,cash,jsonb_build_array(
      jsonb_build_object('method','voucher','reference_id',next_voucher,'amount',2),
      jsonb_build_object('method','dinheiro','amount',3)),'red5000-partial-voucher');
    IF (public.pdv_get_residual_disposition_plan_v4(v_order)->>'free_amount')::numeric<>0 THEN RAISE EXCEPTION 'Consumo parcial liberou orçamento'; END IF;
    denied:=false; BEGIN PERFORM public.pdv_reverse_return_voucher_v2(next_voucher,'Voucher parcialmente usado','red5000-partial-reverse'); EXCEPTION WHEN check_violation THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Voucher parcialmente consumido foi estornado'; END IF;
    RAISE EXCEPTION 'rollback_partial' USING ERRCODE='P1591';
  EXCEPTION WHEN SQLSTATE 'P1591' THEN NULL;
  END;
  PERFORM public.pdv_reverse_return_voucher_v2(next_voucher,'Trocar destino de voucher','red5000-reverse-next');
  plan:=public.pdv_get_residual_disposition_plan_v4(v_order);
  IF (plan->>'free_amount')::numeric<>5 THEN RAISE EXCEPTION 'Estorno do novo voucher não recompôs5'; END IF;
  -- Direitos são revalidados mesmo com plano válido previamente carregado.
  FOREACH permission IN ARRAY ARRAY['fn:manage_party_credit','fn:view_pdv_after_sale','fn:refund_pdv_return'] LOOP
    EXECUTE 'RESET ROLE'; UPDATE public.user_permissions SET permissions=fixture.permissions-permission WHERE user_id=u;
    EXECUTE 'SET LOCAL ROLE authenticated'; denied:=false;
    BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','refund','original_payment_id',cash_payment,'amount',5,'account_id',cash,'cash_session_id',session_id)),plan->>'plan_hash','red5000-denied-'||permission,'Destino negado');
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Permissão revogada ignorada: %',permission; END IF;
    EXECUTE 'RESET ROLE'; UPDATE public.user_permissions SET permissions=fixture.permissions WHERE user_id=u; EXECUTE 'SET LOCAL ROLE authenticated';
  END LOOP;
  -- Fechar a gaveta original não autoriza fallback para outro turno/terminal.
  BEGIN
    PERFORM public.pdv_close_cash_session_v2(session_id,cash,120,'Fechamento fictício','red5000-close-original');
    denied:=false;
    BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','refund','original_payment_id',cash_payment,'amount',5,'account_id',cash,'cash_session_id',session_id)),plan->>'plan_hash','red5000-closed-cash','Caixa fechado');
    EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;denied:=detail LIKE '%cash_unavailable%';END;
    IF NOT denied THEN RAISE EXCEPTION 'Reembolsou pelo caixa original fechado';END IF;
    RAISE EXCEPTION 'rollback_closed_cash' USING ERRCODE='P1592';
  EXCEPTION WHEN SQLSTATE 'P1592' THEN NULL;
  END;
  -- Conta bancária e outra gaveta jamais substituem a origem em dinheiro.
  denied:=false; BEGIN PERFORM public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','refund','original_payment_id',cash_payment,'amount',5,'account_id',bank,'cash_session_id',session_id)),plan->>'plan_hash','red5000-wrong-account','Conta errada'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Conta errada aceita'; END IF;
  result:=public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','refund','original_payment_id',cash_payment,'amount',5,'account_id',cash,'cash_session_id',session_id)),plan->>'plan_hash','red5000-cash-refund','Novo destino dinheiro');
  SELECT (r->>'refund_id')::uuid INTO cash_refund FROM jsonb_array_elements(result->'resources') r;
  PERFORM public.pdv_reverse_return_refund_v2(cash_refund,'Trocar destino do reembolso','red5000-reverse-cash');
  plan:=public.pdv_get_residual_disposition_plan_v4(v_order);
  IF (plan->>'free_amount')::numeric<>5 THEN RAISE EXCEPTION 'Estorno de reembolso não recompôs5'; END IF;
  result:=public.pdv_reallocate_residual_value_v4(v_order,jsonb_build_array(jsonb_build_object('kind','customer_credit','original_payment_id',cash_payment,'amount',5)),plan->>'plan_hash','red5000-final-credit','Saldo do cliente');
  IF (public.pdv_get_residual_disposition_plan_v4(v_order)->>'free_amount')::numeric<>0 THEN RAISE EXCEPTION 'Pendência não encerrada'; END IF;
  SET CONSTRAINTS pdv_refund_cash_pair_v3 IMMEDIATE;
  SET CONSTRAINTS pdv_refund_cash_pair_v3 DEFERRED;
  EXECUTE 'RESET ROLE';
  SELECT jsonb_build_object('source',to_jsonb(src),'order_status',o.status,
    'movements',(SELECT count(*) FROM public.inventory_movements WHERE inventory_id=material),
    'quantity',(SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock),
    'reservation',(SELECT to_jsonb(r) FROM public.pdv_stock_reservation_items r WHERE r.id=reservation),
    'deliveries',(SELECT count(*) FROM public.pdv_deliveries d WHERE d.order_id=v_order),
    'cmv',(SELECT sum(di.cmv_amount_snapshot) FROM public.pdv_delivery_items di WHERE di.order_item_id=item),
    'debt_reduction',(SELECT sum(d.amount) FROM public.pdv_return_dispositions d WHERE d.residual_cancellation_id=cancel_id AND d.disposition_kind='receivable_reduction'),
    'receivable_open',public.pdv_party_obligation_open_v2(receivable)) INTO physical_after
    FROM public.pdv_order_residual_cancellations src JOIN public.pdv_orders o ON o.id=src.order_id WHERE src.id=cancel_id;
  SELECT COALESCE(sum(e.amount),0) INTO custody_after FROM public.pdv_cash_custody_entries e WHERE e.company_id=c;
  IF physical_before<>physical_after OR custody_before<>custody_after THEN RAISE EXCEPTION 'Redistribuição repetiu fato físico/CMV/fiado ou não compensou caixa'; END IF;
  IF (SELECT count(*) FROM public.pdv_order_residual_cancellations WHERE order_id=v_order)<>1 THEN RAISE EXCEPTION 'Criou novo cancelamento'; END IF;
END $behavior$;
ROLLBACK;
