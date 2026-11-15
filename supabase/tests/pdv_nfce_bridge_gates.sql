-- Isolamento fiscal: tenant, abertura, ação explícita e gates protegidos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $test$
DECLARE
  c1 uuid := 'f6020000-0000-4000-8000-000000000001'; c2 uuid := 'f6020000-0000-4000-8000-000000000002';
  u1 uuid := 'f6020000-0000-4000-8000-000000000011'; u2 uuid := 'f6020000-0000-4000-8000-000000000012';
  ufiscal uuid := 'f6020000-0000-4000-8000-000000000013'; uother uuid := 'f6020000-0000-4000-8000-000000000014';
  stock uuid := 'f6020000-0000-4000-8000-000000000021'; account uuid := 'f6020000-0000-4000-8000-000000000022';
  terminal1 uuid := 'f6020000-0000-4000-8000-000000000031'; terminal2 uuid := 'f6020000-0000-4000-8000-000000000032';
  session1 uuid := 'f6020000-0000-4000-8000-000000000041'; session2 uuid := 'f6020000-0000-4000-8000-000000000042';
  sale1 uuid := 'f6020000-0000-4000-8000-000000000051'; sale2 uuid := 'f6020000-0000-4000-8000-000000000052';
  doc1 uuid := 'f6020000-0000-4000-8000-000000000061'; doc2 uuid := 'f6020000-0000-4000-8000-000000000062';
  sale3 uuid := 'f6020000-0000-4000-8000-000000000053';
  material_a uuid := 'f6020000-0000-4000-8000-000000000071'; material_b uuid := 'f6020000-0000-4000-8000-000000000072';
  actor record; actual integer; snapshot jsonb; duplicate_blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
  FROM (VALUES(u1,'nfce-owner1@example.invalid'),(u2,'nfce-owner2@example.invalid'),(ufiscal,'nfce-sector@example.invalid'),(uother,'nfce-other@example.invalid')) f(id,email);
  INSERT INTO public.subscription_plans(code,name,included_modules) VALUES('qa-nfce-bridge','Plano fictício NFC-e','["basic"]');
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan) VALUES(c1,'Fiscal fictícia A','active','qa-nfce-bridge'),(c2,'Fiscal fictícia B','active','qa-nfce-bridge');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(u1,u2,ufiscal);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=uother;
  INSERT INTO public.user_roles(user_id,role) VALUES(u1,'tecnico'),(u2,'tecnico'),(ufiscal,'comercial'),(uother,'tecnico');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u1,'["screen:pdv","fn:emit_fiscal_goods"]',true),(u2,'["screen:pdv","fn:emit_fiscal_goods"]',true),
    (ufiscal,'["screen:fiscal_notes","fn:emit_fiscal_goods"]',true),(uother,'["screen:pdv","fn:emit_fiscal_goods"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'nfe'),(c1,'pdv'),(c2,'nfe'),(c2,'pdv');
  INSERT INTO public.stocks(id,company_id,name,purpose,is_default) VALUES(stock,c1,'Local fictício','pdv',false);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(account,c1,'Cofre fictício','caixa',0,true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal1,c1,'Fiscal A',stock,true),(terminal2,c1,'Fiscal B',stock,true);
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
  VALUES(session1,c1,terminal1,u1,0,'aberta',account,'Cofre','{}',2),(session2,c1,terminal2,u2,0,'aberta',account,'Cofre','{}',2);
  INSERT INTO public.company_nfce_settings(company_id,enabled,homologation_approved,uf,series)
    VALUES(c1,true,true,'SP',1);
  INSERT INTO public.pdv_orders(id,company_id,number,status,stock_id,terminal_id,cash_session_id,subtotal,total)
  VALUES(sale1,c1,900001,'pago',stock,terminal1,session1,10,10),(sale2,c1,900002,'entregue',stock,terminal2,session2,10,10);
  -- Fonte positiva fictícia: desconto global, recebimento em dinheiro com troco e fiado.
  INSERT INTO public.inventory(id,company_id,name,unit,cost_price,sale_price)
    VALUES(material_a,c1,'Material fiscal fictício A','UN',0,25),(material_b,c1,'Material fiscal fictício B','UN',0,40);
  INSERT INTO public.pdv_orders(id,company_id,number,status,stock_id,terminal_id,cash_session_id,subtotal,discount_amount,total)
    VALUES(sale3,c1,900003,'rascunho',stock,terminal1,session1,65,5,60);
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,discount_amount,total,sort_order,unit)
    VALUES('f6020000-0000-4000-8000-000000000081',c1,sale3,material_a,'Material fictício A',1,25,0,0,25,0,'UN'),
          ('f6020000-0000-4000-8000-000000000082',c1,sale3,material_b,'Material fictício B',1,40,0,0,40,1,'UN');
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount)
    VALUES(c1,sale3,'dinheiro',30,5),(c1,sale3,'fiado',30,0);
  UPDATE public.pdv_orders SET status='pago' WHERE id=sale3;
  INSERT INTO public.nfce_documents(id,company_id,order_id,source_type,source_id,uf,series,status)
  VALUES(doc1,c1,sale1,'pdv_sale',sale1,'SP',1,'draft'),(doc2,c1,sale2,'pdv_sale',sale2,'SP',1,'draft');
  BEGIN
    INSERT INTO public.nfce_documents(company_id,order_id,source_type,source_id,uf,series,status)
      VALUES(c1,sale1,'pdv_sale',sale1,'SP',1,'draft');
  EXCEPTION WHEN unique_violation THEN duplicate_blocked := true;
  END;
  IF NOT duplicate_blocked THEN RAISE EXCEPTION 'Uma venda gerou dois documentos fiscais'; END IF;
  WITH claim AS (UPDATE public.nfce_documents SET status='preparing' WHERE id=doc1 AND status='draft' RETURNING id)
    SELECT count(*) INTO actual FROM claim;
  IF actual<>1 THEN RAISE EXCEPTION 'Primeiro claim não reservou a emissão'; END IF;
  WITH claim AS (UPDATE public.nfce_documents SET status='preparing' WHERE id=doc1 AND status='draft' RETURNING id)
    SELECT count(*) INTO actual FROM claim;
  IF actual<>0 THEN RAISE EXCEPTION 'Segundo claim tomou a mesma emissão'; END IF;
  UPDATE public.nfce_documents SET status='draft' WHERE id=doc1;
  IF EXISTS(SELECT 1 FROM public.nfce_outbox WHERE company_id=c1) THEN RAISE EXCEPTION 'Pagamento disparou outbox no modo perguntar'; END IF;
  -- Sem cobertura autoritativa, nem status entregue permite importação.
  IF public.fiscal_goods_sale_ready(c1,sale1) THEN RAISE EXCEPTION 'Status comercial substituiu cobertura'; END IF;
  FOR actor IN SELECT * FROM (VALUES(u1,1),(u2,1),(ufiscal,2),(uother,0)) a(id,expected) LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF actor.id=u1 THEN
      snapshot:=public.fiscal_get_goods_source_snapshot('pdv_sale',sale3);
      IF (snapshot#>>'{items,0,total}')::numeric<>23.08 OR (snapshot#>>'{items,1,total}')::numeric<>36.92
        OR (snapshot#>>'{items,0,discount}')::numeric<>1.92 OR (snapshot#>>'{items,1,discount}')::numeric<>3.08 THEN
        RAISE EXCEPTION 'Rateio por item divergiu da fonte canônica';
      END IF;
      IF jsonb_array_length(snapshot->'payments')<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'payments') payment
        WHERE payment->>'method'='01' AND (payment->>'amount')::numeric=35 AND (payment->>'change')::numeric=5)
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'payments') payment WHERE payment->>'method'='05' AND (payment->>'deferred')::boolean) THEN
        RAISE EXCEPTION 'Importação fiscal perdeu pagamento misto, troco ou fiado';
      END IF;
    END IF;
    SELECT count(*) INTO actual FROM public.nfce_documents WHERE id IN(doc1,doc2);
    IF actual <> actor.expected THEN RAISE EXCEPTION 'Leitura fiscal fora da custódia: %/%',actual,actor.expected; END IF;
    BEGIN
      PERFORM public.fiscal_get_goods_source_snapshot('pdv_sale',CASE WHEN actor.id=u1 THEN sale2 ELSE sale1 END);
      IF actor.id<>ufiscal THEN RAISE EXCEPTION 'Importação indevida não foi bloqueada'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    EXECUTE 'RESET ROLE';
  END LOOP;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  IF public.can_manage_system(u1) THEN RAISE EXCEPTION 'Fixture deveria operar sem administração'; END IF;
  IF NOT public.fiscal_can_emit_goods() THEN RAISE EXCEPTION 'Ação granular de caixa negada'; END IF;
  UPDATE public.user_permissions SET permissions='["screen:pdv"]' WHERE user_id=u1;
  IF public.fiscal_can_emit_goods() THEN RAISE EXCEPTION 'Emissão permitida sem ação'; END IF;
  UPDATE public.user_permissions SET permissions='["fn:emit_fiscal_goods"]',is_active=false WHERE user_id=u1;
  IF public.fiscal_can_emit_goods() THEN RAISE EXCEPTION 'Emissão permitida para permissão inativa'; END IF;
  UPDATE public.user_permissions SET permissions='["fn:emit_fiscal_goods"]',is_active=true WHERE user_id=u1;
  DELETE FROM public.company_modules WHERE company_id=c1 AND module_code='nfe';
  IF public.fiscal_can_emit_goods() THEN RAISE EXCEPTION 'Emissão permitida sem módulo nfe'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO actual FROM public.nfce_documents WHERE id IN(doc1,doc2);
  IF actual<>0 THEN RAISE EXCEPTION 'RLS retornou documentos sem módulo'; END IF;
  EXECUTE 'RESET ROLE';
  IF has_function_privilege('authenticated','public.reserve_goods_fiscal_number(uuid,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.fiscal_get_goods_source_snapshot_internal_v1(text,uuid)','EXECUTE')
    OR has_table_privilege('authenticated','public.company_nfce_settings','UPDATE') THEN
    RAISE EXCEPTION 'Aprovação, numeração ou função interna exposta ao browser';
  END IF;
END $test$;
ROLLBACK;
