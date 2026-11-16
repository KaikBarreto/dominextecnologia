-- Comprovantes: mesmo tenant + mesmo local nunca substituem custódia de caixa.
-- Fixtures fictícias isoladas; getter sempre executado como authenticated.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $contract$
DECLARE src text;
BEGIN
  src:=pg_get_functiondef('public.pdv_get_delivery_receipt_snapshot_v2(uuid)'::regprocedure);
  IF position('PDV_DELIVERY_RECEIPT_CASH_SCOPE_V4' IN src)=0
     OR position('pdv_assert_order_cash_access_v2' IN src)>position('SELECT snapshot.* INTO v_row' IN src) THEN
    RAISE EXCEPTION 'Comprovante não valida caixa antes do snapshot';
  END IF;
  IF has_function_privilege('anon','public.pdv_get_delivery_receipt_snapshot_v2(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_get_delivery_receipt_snapshot_v2(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_capture_delivery_receipt_internal_v2(uuid,uuid,uuid)','EXECUTE')
     OR has_table_privilege('authenticated','public.pdv_delivery_receipt_snapshots','SELECT') THEN
    RAISE EXCEPTION 'ACL dos comprovantes regrediu';
  END IF;
END $contract$;

DO $fixture$
DECLARE
  c uuid:='f3160050-0000-4000-8000-000000000001'; cx uuid:='f3160050-0000-4000-8000-000000000002';
  ua uuid:='f3160050-0000-4000-8000-000000000011'; ub uuid:='f3160050-0000-4000-8000-000000000012';
  um uuid:='f3160050-0000-4000-8000-000000000013'; ux uuid:='f3160050-0000-4000-8000-000000000014';
  stock uuid:='f3160050-0000-4000-8000-000000000021'; account uuid:='f3160050-0000-4000-8000-000000000022';
  ta uuid:='f3160050-0000-4000-8000-000000000031'; tb uuid:='f3160050-0000-4000-8000-000000000032';
  sa uuid:='f3160050-0000-4000-8000-000000000033'; sb uuid:='f3160050-0000-4000-8000-000000000034';
  oa uuid:='f3160050-0000-4000-8000-000000000041'; ob uuid:='f3160050-0000-4000-8000-000000000042';
  da uuid:='f3160050-0000-4000-8000-000000000051'; db uuid:='f3160050-0000-4000-8000-000000000052';
  payload jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(ua,ub,um,ux)) THEN RAISE EXCEPTION 'IDs de fixture já existem'; END IF;
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
    SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
    FROM (VALUES(ua,'receipt-cash-a@example.invalid'),(ub,'receipt-cash-b@example.invalid'),(um,'receipt-manager@example.invalid'),(ux,'receipt-foreign@example.invalid')) fixture(id,email);
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture comprovantes caixas A/B','active'),(cx,'Outro tenant comprovantes','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(ua,ub,um);
  UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'comercial'),(um,'gestor'),(ux,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
    SELECT id,'["screen:pdv","screen:pdv_dispatch"]'::jsonb,true FROM (VALUES(ua),(ub),(um),(ux)) users(id);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Local compartilhado por A e B',false);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(account,c,'Conta fixture','caixa',0,true);
  INSERT INTO public.company_settings(company_id,name,pdv_mode,pdv_cash_account_id)
    VALUES(c,'Fixture comprovantes','balcao',account),(cx,'Outro tenant','balcao',NULL)
    ON CONFLICT(company_id) DO UPDATE SET pdv_mode='balcao',pdv_cash_account_id=EXCLUDED.pdv_cash_account_id;
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(ta,c,'Caixa A',stock,true),(tb,c,'Caixa B',stock,true);
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
    VALUES(sa,c,ta,ua,0,'aberta',account,'Conta fixture','{}',2),(sb,c,tb,ub,0,'aberta',account,'Conta fixture','{}',2);
  INSERT INTO public.pdv_orders(id,company_id,number,stock_id,status,subtotal,total,cash_session_id,terminal_id,contract_version)
    VALUES(oa,c,1600051,stock,'entregue',0,0,sa,ta,2),(ob,c,1600052,stock,'entregue',0,0,sb,tb,2);
  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_by)
    VALUES(da,c,oa,gen_random_uuid(),repeat('a',64),ua),(db,c,ob,gen_random_uuid(),repeat('b',64),ub);
  -- O teste exercita a autorização de leitura, sem movimentar estoque ou dinheiro.
  payload:=jsonb_build_object('kind','withdrawal_non_fiscal','delivery_id',da,'order',jsonb_build_object('id',oa,'number',1600051),
    'operator_name','Operador A','items',jsonb_build_array(jsonb_build_object('description','Item fictício A','quantity',1)), 'notice','Comprovante não fiscal de retirada.');
  INSERT INTO public.pdv_delivery_receipt_snapshots(company_id,delivery_id,order_id,snapshot,snapshot_hash,created_by)
    VALUES(c,da,oa,payload,encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex'),ua);
  payload:=jsonb_build_object('kind','withdrawal_non_fiscal','delivery_id',db,'order',jsonb_build_object('id',ob,'number',1600052),
    'operator_name','Operador B','items',jsonb_build_array(jsonb_build_object('description','Item fictício B','quantity',7)), 'notice','Comprovante não fiscal de retirada.');
  INSERT INTO public.pdv_delivery_receipt_snapshots(company_id,delivery_id,order_id,snapshot,snapshot_hash,created_by)
    VALUES(c,db,ob,payload,encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex'),ub);
END $fixture$;
CREATE TEMP TABLE receipt_cash_scope_before ON COMMIT DROP AS
 SELECT id,snapshot,snapshot_hash FROM public.pdv_delivery_receipt_snapshots WHERE company_id='f3160050-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
DO $cash_actors$
DECLARE r jsonb; denied boolean; actor uuid;
BEGIN
  FOREACH actor IN ARRAY ARRAY['f3160050-0000-4000-8000-000000000011'::uuid,'f3160050-0000-4000-8000-000000000012'::uuid] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    IF actor='f3160050-0000-4000-8000-000000000011' THEN
      r:=public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000051');
      IF r->>'operator_name'<>'Operador A' OR r#>>'{items,0,quantity}'<>'1' THEN RAISE EXCEPTION 'Caixa A perdeu seu comprovante'; END IF;
      denied:=false; BEGIN PERFORM public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000052'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    ELSE
      r:=public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000052');
      IF r->>'operator_name'<>'Operador B' OR r#>>'{items,0,quantity}'<>'7' THEN RAISE EXCEPTION 'Caixa B perdeu seu comprovante'; END IF;
      denied:=false; BEGIN PERFORM public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000051'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    END IF;
    IF NOT denied THEN RAISE EXCEPTION 'Mesmo local liberou comprovante de outro caixa'; END IF;
  END LOOP;
  -- Cargo de gestor não concede acesso à gaveta de outro operador.
  PERFORM set_config('request.jwt.claims','{"sub":"f3160050-0000-4000-8000-000000000013","role":"authenticated"}',true);
  denied:=false; BEGIN PERFORM public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000051'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Gestor herdou acesso cruzado por cargo'; END IF;
END $cash_actors$;
RESET ROLE;
UPDATE public.user_permissions SET permissions='["screen:pdv","screen:pdv_dispatch","fn:operate_other_pdv_cash"]' WHERE user_id='f3160050-0000-4000-8000-000000000013';
SET LOCAL ROLE authenticated;
DO $explicit_and_foreign$
DECLARE r jsonb; denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"f3160050-0000-4000-8000-000000000013","role":"authenticated"}',true);
  r:=public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000051');
  IF r->>'operator_name'<>'Operador A' THEN RAISE EXCEPTION 'Permissão nominal não permitiu consultar comprovante A'; END IF;
  r:=public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000052');
  IF r->>'operator_name'<>'Operador B' THEN RAISE EXCEPTION 'Permissão nominal não permitiu consultar comprovante B'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"f3160050-0000-4000-8000-000000000014","role":"authenticated"}',true);
  denied:=false; BEGIN PERFORM public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000051'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Outro tenant consultou comprovante'; END IF;
END $explicit_and_foreign$;
RESET ROLE;
INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES('f3160050-0000-4000-8000-000000000001','f3160050-0000-4000-8000-000000000021','f3160050-0000-4000-8000-000000000012');
SET LOCAL ROLE authenticated;
DO $stock_revoked$
DECLARE denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"f3160050-0000-4000-8000-000000000011","role":"authenticated"}',true);
  denied:=false; BEGIN PERFORM public.pdv_get_delivery_receipt_snapshot_v2('f3160050-0000-4000-8000-000000000051'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Caixa próprio ignorou revogação de estoque'; END IF;
END $stock_revoked$;
RESET ROLE;
DO $immutable$
BEGIN
  IF EXISTS((SELECT id,snapshot,snapshot_hash FROM public.pdv_delivery_receipt_snapshots WHERE company_id='f3160050-0000-4000-8000-000000000001' EXCEPT SELECT * FROM receipt_cash_scope_before)
    UNION ALL (SELECT * FROM receipt_cash_scope_before EXCEPT SELECT id,snapshot,snapshot_hash FROM public.pdv_delivery_receipt_snapshots WHERE company_id='f3160050-0000-4000-8000-000000000001')) THEN
    RAISE EXCEPTION 'Consulta alterou snapshot ou hash persistido';
  END IF;
END $immutable$;
ROLLBACK;
