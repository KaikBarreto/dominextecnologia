-- Cada troca mantém a abertura exata, mesmo sem diferença em dinheiro.
-- Serial/rollback: não representa prova de concorrência entre conexões.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION pg_temp.exchange309_order(p_stock uuid,p_customer uuid,p_terminal uuid,p_material uuid,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE pre uuid:=gen_random_uuid(); result jsonb;
BEGIN
 PERFORM public.pdv_save_preorder_v2(pre,0,jsonb_build_object('stock_id',p_stock,'customer_id',p_customer,'operation_mode','counter','discount_amount',0),
  jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',p_material,'item_type','material','description','Material fictício','quantity',1,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0)),p_key||'-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(pre,1,p_terminal,p_key||'-target');
 PERFORM public.pdv_forward_preorder_v2(pre,2,p_key||'-forward');
 result:=public.pdv_convert_preorder_v2(pre,3,p_key||'-convert'); RETURN (result->>'order_id')::uuid;
END $fn$;
DO $behavior$
DECLARE
 c uuid:='f4160309-0000-4000-8000-000000000001'; a uuid:='f4160309-0000-4000-8000-000000000002'; b uuid:='f4160309-0000-4000-8000-000000000003';
 cx uuid:='f4160309-0000-4000-8000-000000000004'; x uuid:='f4160309-0000-4000-8000-000000000005';
 cash uuid:='f4160309-0000-4000-8000-000000000006'; bank uuid:='f4160309-0000-4000-8000-000000000008';
 stock uuid:='f4160309-0000-4000-8000-000000000009'; terminal uuid:='f4160309-0000-4000-8000-000000000010'; terminal_b uuid:='f4160309-0000-4000-8000-000000000011';
 keeper uuid:='f4160309-0000-4000-8000-000000000014';
 material uuid:='f4160309-0000-4000-8000-000000000012'; customer uuid:='f4160309-0000-4000-8000-000000000013';
 session_a uuid; session_a2 uuid; session_b uuid; next_b uuid; original uuid; source_return uuid; voucher uuid; target uuid; first_target uuid; pending_target uuid;
 result jsonb; return_lines jsonb; replay jsonb; first_result jsonb; snapshot jsonb; payload jsonb; before_cash numeric; after_cash numeric; counted numeric; voucher_amount numeric; credit_amount numeric; method text; account_id uuid; money_session uuid; n integer; blocked boolean; detail text; legacy_key text:='exchange309-historical-replay';
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(a,b,x,keeper)) THEN RAISE EXCEPTION 'IDs da fixture já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(a,'exchange309-a@example.invalid'),(b,'exchange309-b@example.invalid'),(x,'exchange309-x@example.invalid'),(keeper,'exchange309-keeper@example.invalid')) actor(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture caixa explícito da troca','active'),(cx,'Outro tenant fictício','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(a,b,keeper); UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=x;
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin'),(b,'admin'),(x,'admin'),(keeper,'admin');
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(a,'["screen:pdv_orders","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:view_pdv_after_sale","fn:cover_pdv_exchange","fn:cover_pdv_order","fn:approve_pdv_credit"]',true),(b,'["screen:pdv_orders","fn:view_pdv_after_sale","fn:cover_pdv_exchange"]',true);
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Gaveta A fictícia','caixa',100,true),(bank,c,'Banco fictício','banco',0,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode) VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque compartilhado fictício',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Terminal A fictício',stock,true),(terminal_b,c,'Terminal B fictício',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-EX309','Material fictício','un',100,2,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,100,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,c,'Cliente fictício',1000,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal_b,cash,0,'exchange309-b-open');session_b:=(result->>'session_id')::uuid;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal,cash,100,'exchange309-a-open');session_a:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_a,cash,customer,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',20)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',200)),'exchange309-source');original:=(result->>'order_id')::uuid;
 -- A preparação lê IDs privados como owner; a devolução real continua authenticated.
 EXECUTE 'RESET ROLE';
 SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',20,'destination','saleable','destination_stock_id',stock)) INTO return_lines
  FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=original;
 IF return_lines IS NULL OR jsonb_array_length(return_lines)<>1 THEN RAISE EXCEPTION 'Venda de preparação não produziu a entrega canônica esperada';END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_return_delivery_items_v2(original,return_lines,jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',200)),public.company_today(c),'Devolução fictícia','exchange309-return');source_return:=(result->>'return_id')::uuid;
 result:=public.pdv_issue_return_voucher_v2(source_return,100,NULL,'exchange309-voucher');voucher:=(result->>'voucher_id')::uuid;
 PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');EXECUTE 'RESET ROLE';
 -- Gavetas distintas compartilham o mesmo cofre; a autorização deve distinguir sessões.
 IF session_a=session_b OR (SELECT count(*) FROM public.pdv_cash_sessions s WHERE s.id IN(session_a,session_b) AND s.cash_account_id=cash AND s.company_id=c)<>2 OR (SELECT count(DISTINCT s.terminal_id) FROM public.pdv_cash_sessions s WHERE s.id IN(session_a,session_b))<>2 THEN RAISE EXCEPTION 'Fixture não compartilha o mesmo cofre em duas gavetas distintas';END IF;
 -- Os pedidos são preparados enquanto o perfil administrativo ainda pode criar.
 CREATE TEMP TABLE exchange309_targets(position integer,id uuid) ON COMMIT DROP;
 FOR n IN 1..8 LOOP INSERT INTO exchange309_targets VALUES(n,pg_temp.exchange309_order(stock,customer,terminal,material,'exchange309-target-'||n)); END LOOP;
 SELECT id INTO first_target FROM exchange309_targets WHERE position=1;SELECT id INTO pending_target FROM exchange309_targets WHERE position=8;
 DELETE FROM public.user_roles WHERE user_id IN(a,b);
 IF public.user_has_permission(a,'screen:pdv') OR public.user_has_permission(a,'screen:inventory') THEN RAISE EXCEPTION 'Fixture não usa perfil restrito de pós-venda'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 blocked:=false;BEGIN PERFORM * FROM public.pdv_customer_credit_statement_v2(customer);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Pós-venda passou a consultar extrato público sem tela do caixa';END IF;
 snapshot:=public.pdv_get_after_sale_workspace_v2(original);EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') candidate WHERE candidate->>'order_id'=first_target::text AND candidate->>'target_cash_session_id'=session_a::text AND candidate->>'target_terminal_id'=terminal::text AND candidate->>'target_cash_account_id'=cash::text) THEN RAISE EXCEPTION 'Snapshot não identifica a abertura exata autorizada'; END IF;
 IF (snapshot#>>'{capabilities,apply_voucher}')::boolean OR EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'order_candidates') candidate WHERE (candidate->>'can_apply_voucher')::boolean) THEN RAISE EXCEPTION 'Pré-aplicação obsoleta permanece anunciada'; END IF;
 SELECT COALESCE(sum(amount),0) INTO before_cash FROM public.pdv_cash_custody_entries WHERE company_id=c;
 -- Voucher, saldo, banco, cartão, fiado e dinheiro: toda modalidade vincula a abertura.
 FOR n IN 1..7 LOOP
  SELECT id INTO target FROM exchange309_targets WHERE exchange309_targets.position=n;
  voucher_amount:=CASE WHEN n=1 THEN 10 WHEN n=3 THEN 5 ELSE 0 END;
  credit_amount:=CASE WHEN n=2 THEN 10 ELSE 0 END;
  method:=CASE n WHEN 3 THEN 'pix' WHEN 4 THEN 'credito' WHEN 5 THEN 'fiado' WHEN 6 THEN 'dinheiro' WHEN 7 THEN 'transferencia' END;
  account_id:=CASE WHEN n IN(3,7) THEN bank WHEN n=6 THEN cash END;money_session:=CASE WHEN n=6 THEN session_a END;
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.pdv_cover_exchange_order_coupon_v2(source_return,target,CASE WHEN voucher_amount>0 THEN voucher END,voucher_amount,credit_amount,method,account_id,money_session,'exchange309-cover-'||n,0,session_a);
  replay:=public.pdv_cover_exchange_order_coupon_v2(source_return,target,CASE WHEN voucher_amount>0 THEN voucher END,voucher_amount,credit_amount,method,account_id,money_session,'exchange309-cover-'||n,0,session_a);
  EXECUTE 'RESET ROLE';
  IF result->>'exchange_id'<>replay->>'exchange_id' OR replay->>'idempotent'<>'true' OR (SELECT count(*) FROM public.pdv_exchanges WHERE new_order_id=target)<>1 OR NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=target AND cash_session_id=session_a AND terminal_id=terminal AND target_terminal_id=terminal AND status IN('liberado_retirada','entregue')) THEN RAISE EXCEPTION 'Modalidade % perdeu custódia/replay',n; END IF;
  SELECT COALESCE(sum(amount),0) INTO after_cash FROM public.pdv_cash_custody_entries WHERE company_id=c;
  IF after_cash<>before_cash+(CASE WHEN n>=6 THEN 10 ELSE 0 END) THEN RAISE EXCEPTION 'Modalidade % movimentou dinheiro indevido',n; END IF;
  IF n=1 THEN first_result:=result; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=c AND entry_kind='cash_receipt')<>2 THEN RAISE EXCEPTION 'Diferença em dinheiro não gerou uma única custódia'; END IF;
 -- APIs antigas só repetem resultados exatos; nenhuma nova cobertura sem destino.
 EXECUTE 'SET LOCAL ROLE authenticated';
 blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_v2(source_return,pending_target,voucher,10,0,NULL,NULL,NULL,'exchange309-old-fresh');EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=detail LIKE '%pdv_exchange_target_cash_required%';END;
 IF NOT blocked THEN RAISE EXCEPTION 'API antiga criou troca sem abertura explícita';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(pending_target,voucher,2,'exchange309-preapply-fresh');EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=detail LIKE '%pdv_voucher_checkout_required%';END;
 IF NOT blocked THEN RAISE EXCEPTION 'Pré-aplicação criou cobertura sem abertura';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(source_return,pending_target,voucher,10,0,NULL,NULL,NULL,'exchange309-other-terminal',0,session_b);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Sessão de outro terminal foi aceita';END IF;EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=pending_target) OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key IN('exchange309-old-fresh','exchange309-preapply-fresh','exchange309-other-terminal')) THEN RAISE EXCEPTION 'Negação deixou fatos financeiros';END IF;
 -- Recurso histórico sintético aponta para troca real já executada; não cria dinheiro.
 -- O hash histórico serializa valores numeric(14,2), como o writer original.
 payload:=jsonb_build_object('return_id',source_return,'new_order_id',first_target,'voucher_id',voucher,'voucher_amount',10::numeric(14,2),'credit_amount',0::numeric(14,2),'difference_method',NULL,'difference_account_id',NULL,'cash_session_id',NULL);
 INSERT INTO public.pdv_operation_requests(company_id,operation_type,idempotency_key,payload_hash,status,resource_type,resource_id,result,created_by,completed_at)
 VALUES(c,'after_sale.exchange.cover.v2',legacy_key,public.pdv_operation_payload_hash(payload),'completed','pdv_exchange',(first_result->>'exchange_id')::uuid,first_result,a,now());
 EXECUTE 'SET LOCAL ROLE authenticated';replay:=public.pdv_cover_exchange_order_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,legacy_key);EXECUTE 'RESET ROLE';
 IF replay<>first_result||jsonb_build_object('idempotent',true) THEN RAISE EXCEPTION 'Replay histórico alterou resultado/hash';END IF;
 -- Pago legado sem abertura comprovada não herda sequer o operador atual.
 BEGIN
  UPDATE public.pdv_orders SET cash_session_id=NULL,terminal_id=NULL WHERE id=first_target;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.pdv_current_actor_can_access_order_v3(first_target) OR EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=first_target) THEN RAISE EXCEPTION 'Pago sem abertura herdou terminal atual';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,legacy_key);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Replay legado sem custódia deixou de falhar fechado';END IF;EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'rollback_historical_null' USING ERRCODE='P3091';
 EXCEPTION WHEN SQLSTATE 'P3091' THEN NULL;END;
 -- Permissão, perfil, tenant e ACL de estoque são sempre reavaliados no replay.
 BEGIN
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock,b);
  EXECUTE 'SET LOCAL ROLE authenticated';blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,'exchange309-cover-1',0,session_a);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Replay ignorou revogação de estoque';END IF;EXECUTE 'RESET ROLE';RAISE EXCEPTION 'rollback_stock' USING ERRCODE='P3092';
 EXCEPTION WHEN SQLSTATE 'P3092' THEN NULL;END;
 BEGIN
  -- A preparação usa o canal administrativo autorizado; a negativa usa o ator revogado.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.profiles SET is_active=false WHERE user_id=a;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,'exchange309-cover-1',0,session_a);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Replay ignorou perfil revogado';END IF;EXECUTE 'RESET ROLE';RAISE EXCEPTION 'rollback_profile' USING ERRCODE='P3093';
 EXCEPTION WHEN SQLSTATE 'P3093' THEN NULL;END;
 BEGIN
  UPDATE public.user_permissions SET permissions='["screen:pdv_orders","fn:view_pdv_after_sale"]'::jsonb WHERE user_id=a;EXECUTE 'SET LOCAL ROLE authenticated';blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,'exchange309-cover-1',0,session_a);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Replay ignorou capacidade revogada';END IF;EXECUTE 'RESET ROLE';RAISE EXCEPTION 'rollback_permission' USING ERRCODE='P3094';
 EXCEPTION WHEN SQLSTATE 'P3094' THEN NULL;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',x,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,'exchange309-cover-1',0,session_a);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro tenant acessou troca';END IF;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 -- A fecha e abre outra sessão; replay histórico continua na abertura antiga.
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin');SELECT COALESCE(sum(amount),0) INTO counted FROM public.pdv_cash_custody_entries WHERE session_id=session_a;
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_close_cash_session_v2(session_a,cash,counted,'Fechamento fictício','exchange309-a-close');result:=public.pdv_open_cash_session_v2(terminal,cash,0,'exchange309-a-open2');session_a2:=(result->>'session_id')::uuid;EXECUTE 'RESET ROLE';DELETE FROM public.user_roles WHERE user_id=a;
 EXECUTE 'SET LOCAL ROLE authenticated';
 replay:=public.pdv_cover_exchange_order_coupon_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,'exchange309-cover-1',0,session_a);
 IF replay->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Replay perdeu abertura histórica fechada';END IF;
 replay:=public.pdv_cover_exchange_order_v2(source_return,first_target,voucher,10,0,NULL,NULL,NULL,legacy_key);
 IF replay->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Replay antigo perdeu abertura histórica';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(source_return,pending_target,voucher,10,0,NULL,NULL,NULL,'exchange309-stale-target',0,session_a);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Snapshot antigo migrou para nova abertura';END IF;EXECUTE 'RESET ROLE';
 -- B abre o mesmo terminal depois: o pedido pago continua pertencendo a A.
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin'),(b,'admin');
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_close_cash_session_v2(session_a2,cash,0,'Fechamento fictício','exchange309-a-close2');EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_close_cash_session_v2(session_b,cash,0,'Fechamento fictício','exchange309-b-close');result:=public.pdv_open_cash_session_v2(terminal,cash,0,'exchange309-b-open-next');next_b:=(result->>'session_id')::uuid;EXECUTE 'RESET ROLE';DELETE FROM public.user_roles WHERE user_id IN(a,b);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_current_actor_can_access_order_v3(first_target) OR EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=first_target) THEN RAISE EXCEPTION 'Próximo turno herdou troca paga';END IF;
 IF NOT public.pdv_current_actor_can_access_order_v3(pending_target) THEN RAISE EXCEPTION 'Fila pendente sem cobertura perdeu destino legítimo';END IF;EXECUTE 'RESET ROLE';
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(b,'["screen:pdv_orders","fn:view_pdv_after_sale","fn:cover_pdv_exchange","fn:operate_other_pdv_cash"]',true) ON CONFLICT(user_id) DO UPDATE SET permissions=excluded.permissions;
 -- A capacidade cross-cash é avaliada pelo helper canônico, sem tratar tela como permissão.
 IF public.pdv_can_operate_other_cash_v2(b) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Fixture não concedeu capacidade cross-cash canônica';END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';IF NOT public.pdv_current_actor_can_access_order_v3(first_target) THEN RAISE EXCEPTION 'Capacidade explícita perdeu leitura autorizada';END IF;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';IF NOT public.pdv_current_actor_can_access_order_v3(first_target) THEN RAISE EXCEPTION 'Operador original perdeu histórico vinculado';END IF;EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=pending_target) OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='exchange309-stale-target') THEN RAISE EXCEPTION 'Sessão obsoleta criou fatos';END IF;
 IF has_function_privilege('authenticated','public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid)','EXECUTE') OR has_function_privilege('service_role','public.pdv_exchange_target_cash_snapshot_internal_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Core ou snapshot privado exposto';END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;
