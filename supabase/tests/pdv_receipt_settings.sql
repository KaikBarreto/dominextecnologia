-- Smoke W2-03: configuracao nao fiscal isolada por empresa e fail-closed.
BEGIN;

DO $contract$
BEGIN
  IF has_function_privilege('anon','public.pdv_get_receipt_settings_v2()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_get_receipt_settings_v2()','EXECUTE')
     OR has_function_privilege('anon','public.pdv_get_order_receipt_snapshot_v2(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_get_order_receipt_snapshot_v2(uuid)','EXECUTE')
     OR has_table_privilege('authenticated','public.pdv_receipt_settings','SELECT')
     OR has_table_privilege('authenticated','public.pdv_order_receipt_snapshots','SELECT') THEN
    RAISE EXCEPTION 'ACL incorreta nas configuracoes de comprovante';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  c1 uuid := 'c3500000-0000-4000-8000-000000000001';
  c2 uuid := 'c3500000-0000-4000-8000-000000000002';
  u1 uuid := 'c3500000-0000-4000-8000-000000000003';
  u2 uuid := 'c3500000-0000-4000-8000-000000000004';
  no_screen uuid := 'c3500000-0000-4000-8000-000000000005';
  screen_only uuid := 'c3500000-0000-4000-8000-000000000017';
  restricted_user uuid := 'c3500000-0000-4000-8000-000000000018';
  retired_user uuid := 'c3500000-0000-4000-8000-000000000016';
  customer1 uuid := 'c3500000-0000-4000-8000-000000000006';
  stock1 uuid := 'c3500000-0000-4000-8000-000000000007';
  terminal1 uuid := 'c3500000-0000-4000-8000-000000000008';
  order1 uuid := 'c3500000-0000-4000-8000-000000000009';
  legacy_order uuid := 'c3500000-0000-4000-8000-000000000015';
  item1 uuid := 'c3500000-0000-4000-8000-000000000010';
  receivable1 uuid := 'c3500000-0000-4000-8000-000000000011';
  settlement1 uuid := 'c3500000-0000-4000-8000-000000000012';
  group1 uuid := 'c3500000-0000-4000-8000-000000000013';
  inventory1 uuid := 'c3500000-0000-4000-8000-000000000014';
  payload jsonb; denied_state text; denied_detail text;
  original_hash text;
  financial_before bigint;
  inventory_before bigint;
  fiscal_documents_before bigint;
  fiscal_outbox_before bigint;
  fiscal_events_before bigint;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','receipt-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','receipt-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',no_screen,'authenticated','authenticated','receipt-no-screen@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',screen_only,'authenticated','authenticated','receipt-screen-only@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',restricted_user,'authenticated','authenticated','receipt-restricted@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',retired_user,'authenticated','authenticated','receipt-retired@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Comprovante A','active'),(c2,'Comprovante B','active');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(u1,no_screen,screen_only,restricted_user);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=u2;
  INSERT INTO public.user_roles(user_id,role) VALUES(u1,'comercial'),(u2,'comercial'),(no_screen,'comercial'),
    (screen_only,'comercial'),(restricted_user,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u1,'["screen:pdv_settings","screen:pdv","fn:manage_pdv_settings"]',true),
    (u2,'["screen:pdv_settings","screen:pdv_orders","fn:manage_pdv_settings"]',true),
    (screen_only,'["screen:pdv_settings"]',true),
    (restricted_user,'["screen:pdv"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv'),(c2,'pdv');

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  payload := public.pdv_get_receipt_settings_v2();
  IF payload <> '{"copies": 1, "auto_print": false, "default_format": "80mm"}'::jsonb THEN
    RAISE EXCEPTION 'defaults inesperados: %',payload;
  END IF;
  payload := public.pdv_save_receipt_settings_v2('58mm',true,2);
  IF payload->>'default_format' <> '58mm' OR (payload->>'copies')::integer <> 2 THEN
    RAISE EXCEPTION 'salvamento falhou';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',screen_only,'role','authenticated')::text,true);
  PERFORM public.pdv_get_receipt_settings_v2();
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_save_receipt_settings_v2('80mm',false,1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501'
     OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_manage_denied' THEN
    RAISE EXCEPTION 'usuario somente com tela alterou configuracao: % %',denied_state,denied_detail;
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  UPDATE public.pdv_receipt_settings SET updated_by=retired_user WHERE company_id=c1;
  DELETE FROM auth.users WHERE id=retired_user;
  IF (SELECT updated_by FROM public.pdv_receipt_settings WHERE company_id=c1) IS NOT NULL THEN
    RAISE EXCEPTION 'desprovisionamento nao limpou autoria da configuracao';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
  payload := public.pdv_get_receipt_settings_v2();
  IF payload->>'default_format' <> '80mm' THEN RAISE EXCEPTION 'config vazou entre empresas'; END IF;

  -- Fixture equivalente a venda direta W2-02 mista. O snapshot nasce somente
  -- quando o pedido v2 chega a entregue, depois de itens e coberturas.
  INSERT INTO public.company_settings(
    company_id,name,timezone,document,address,address_number,neighborhood,city,state,zip_code,phone,
    logo_url,white_label_enabled,white_label_logo_url
  ) VALUES(
    c1,'Loja Snapshot','America/Sao_Paulo','00.000.000/0001-00','Rua Snapshot','10','Centro','São Paulo','SP','00000-000','(00) 0000-0000',
    'https://example.invalid/logo.png',true,'https://example.invalid/logo-white-label.png'
  )
  ON CONFLICT(company_id) DO UPDATE SET
    name=excluded.name,timezone=excluded.timezone,document=excluded.document,address=excluded.address,
    address_number=excluded.address_number,neighborhood=excluded.neighborhood,city=excluded.city,
    state=excluded.state,zip_code=excluded.zip_code,phone=excluded.phone,logo_url=excluded.logo_url,
    white_label_enabled=excluded.white_label_enabled,white_label_logo_url=excluded.white_label_logo_url;
  INSERT INTO public.customers(id,company_id,name,is_deleted)
  VALUES(customer1,c1,'Cliente Snapshot',false);
  INSERT INTO public.stocks(id,company_id,name,is_default)
  VALUES(stock1,c1,'Loja',true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
  VALUES(inventory1,c1,'CIM-50','Cimento CP II 50 kg','un',10,12,95);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id)
  VALUES(terminal1,c1,'Caixa 1',stock1);
  INSERT INTO public.financial_transactions(
    id,company_id,transaction_type,description,amount,category,
    transaction_date,due_date,is_paid,customer_id,origin,payment_method,
    created_by,pdv_financial_role,pdv_settlement_group_id
  ) VALUES
    (settlement1,c1,'entrada','Pix venda 1042',100,'Venda PDV',current_date,current_date,true,customer1,'pdv','pix',u1,'pdv_receivable_settlement',group1),
    (receivable1,c1,'entrada','Fiado venda 1042',85,'Venda no fiado',current_date,current_date+30,false,customer1,'pdv','fiado',u1,'pdv_receivable_principal',group1);
  INSERT INTO public.pdv_orders(
    id,company_id,number,customer_id,salesperson_id,stock_id,terminal_id,
    status,subtotal,discount_amount,total,notes,contract_version,
    operation_mode_snapshot,created_at,paid_at
  ) VALUES(
    order1,c1,1042,customer1,u1,stock1,terminal1,'pago',190,5,185,
    'Separar no depósito coberto.',2,'direct',now(),now()
  );
  INSERT INTO public.pdv_order_items(
    id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,
    discount_amount,total,sort_order,unit,item_type,unit_cost_v2,
    contract_version,gross_total_v2,line_discount_amount_v2,
    order_discount_allocated_v2
  ) VALUES(
    item1,c1,order1,inventory1,'Cimento CP II 50 kg',2,95,12,5,185,0,'un','material',12,2,190,5,0
  );
  INSERT INTO public.pdv_order_payments(
    company_id,order_id,method,amount,change_amount,created_by,
    contract_version,coverage_kind,coverage_status,settlement_status,
    settlement_transaction_id,receivable_transaction_id,authorized_at,settled_at
  ) VALUES
    (c1,order1,'pix',100,0,u1,2,'pix','authorized','settled',settlement1,NULL,now(),now()),
    (c1,order1,'fiado',85,0,u1,2,'receivable','authorized','open',NULL,receivable1,now(),NULL);
  UPDATE public.pdv_orders SET status='entregue',delivered_at=now() WHERE id=order1;

  -- Pedidos legados (contrato 1; NULL deixou de ser permitido pela W1B)
  -- não entram no contrato do comprovante v2 nem podem ter a entrega bloqueada.
  INSERT INTO public.pdv_orders(
    id,company_id,number,salesperson_id,stock_id,terminal_id,status,
    subtotal,discount_amount,total,contract_version
  ) VALUES(
    legacy_order,c1,1041,u1,stock1,terminal1,'pago',0,0,0,1
  );
  UPDATE public.pdv_orders SET status='entregue',delivered_at=now()
   WHERE id=legacy_order;
  IF EXISTS(
    SELECT 1 FROM public.pdv_order_receipt_snapshots snapshot
     WHERE snapshot.order_id=legacy_order
  ) THEN
    RAISE EXCEPTION 'pedido legado criou snapshot v2';
  END IF;

  SELECT count(*) INTO financial_before FROM public.financial_transactions;
  SELECT count(*) INTO inventory_before FROM public.inventory_movements;
  SELECT count(*) INTO fiscal_documents_before FROM public.nfce_documents;
  SELECT count(*) INTO fiscal_outbox_before FROM public.nfce_outbox;
  SELECT count(*) INTO fiscal_events_before FROM public.nfce_events;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  payload:=public.pdv_get_order_receipt_snapshot_v2(order1);
  IF payload->'order'->>'number'<>'1042'
     OR payload->'totals'->>'subtotal'<>'190'
     OR payload->'totals'->>'discount'<>'5'
     OR payload->'totals'->>'total'<>'185'
     OR payload->'company'->>'document'<>'00.000.000/0001-00'
     OR payload->'company'->>'phone'<>'(00) 0000-0000'
     OR payload->'company'->>'logo_url'<>'https://example.invalid/logo-white-label.png'
     OR payload->'company'->>'white_label_enabled'<>'true'
     OR payload->'company'->>'address' NOT LIKE '%Rua Snapshot%'
     OR jsonb_array_length(payload->'payments')<>2
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'payments') payment WHERE payment->>'method'='fiado' AND payment->>'amount'='85' AND payment->>'due_date'=(current_date+30)::text)
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'payments') payment WHERE payment->>'method'='pix' AND payment->>'amount'='100') THEN
    RAISE EXCEPTION 'snapshot nao preservou centavos, pagamento misto ou fiado: %',payload;
  END IF;
  IF (payload - 'company')::text ~ '(unit_cost|cost_price|credit_limit|customer_document|email|phone)' THEN
    RAISE EXCEPTION 'snapshot vazou custo, limite, documento ou contato do cliente';
  END IF;
  -- Ler/reimprimir e puro: nenhuma tabela financeira, estoque ou fiscal muda.
  PERFORM public.pdv_get_order_receipt_snapshot_v2(order1);
  IF financial_before<>(SELECT count(*) FROM public.financial_transactions)
     OR inventory_before<>(SELECT count(*) FROM public.inventory_movements)
     OR fiscal_documents_before<>(SELECT count(*) FROM public.nfce_documents)
     OR fiscal_outbox_before<>(SELECT count(*) FROM public.nfce_outbox)
     OR fiscal_events_before<>(SELECT count(*) FROM public.nfce_events) THEN
    RAISE EXCEPTION 'leitura/reimpressao criou fato financeiro, estoque ou fiscal';
  END IF;
  IF (SELECT count(*) FROM public.pdv_order_receipt_snapshots WHERE order_id=order1)<>1 THEN
    RAISE EXCEPTION 'snapshot nao e unico por pedido';
  END IF;

  SELECT snapshot_hash INTO original_hash
    FROM public.pdv_order_receipt_snapshots WHERE order_id=order1;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    UPDATE public.pdv_order_receipt_snapshots SET snapshot='{}'::jsonb
     WHERE order_id=order1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '55000'
     OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_snapshot_immutable' THEN
    RAISE EXCEPTION 'update avulso do snapshot nao foi bloqueado: % %',denied_state,denied_detail;
  END IF;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    DELETE FROM public.pdv_order_receipt_snapshots WHERE order_id=order1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '55000'
     OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_snapshot_immutable' THEN
    RAISE EXCEPTION 'delete avulso do snapshot nao foi bloqueado: % %',denied_state,denied_detail;
  END IF;
  IF (SELECT snapshot_hash FROM public.pdv_order_receipt_snapshots WHERE order_id=order1)
       IS DISTINCT FROM original_hash
     OR (SELECT snapshot FROM public.pdv_order_receipt_snapshots WHERE order_id=order1)
       IS DISTINCT FROM payload THEN
    RAISE EXCEPTION 'tentativa de mutacao alterou o snapshot imutavel';
  END IF;

  -- Outro tenant recebe not-found, sem descobrir o snapshot.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_get_order_receipt_snapshot_v2(order1);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_stock_denied' THEN
    RAISE EXCEPTION 'cross-tenant nao falhou sem vazamento: % %',denied_state,denied_detail;
  END IF;

  -- Mesmo tenant sem ACL do local não pode reimprimir nem observar o pedido.
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c1,stock1,u1);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',restricted_user,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_get_order_receipt_snapshot_v2(order1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501'
     OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_stock_denied' THEN
    RAISE EXCEPTION 'ACL same-tenant do comprovante falhou: % %',denied_state,denied_detail;
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',no_screen,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.pdv_get_receipt_settings_v2();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_screen_denied' THEN
    RAISE EXCEPTION 'usuario sem tela de configuracoes nao falhou fechado: % %',denied_state,denied_detail;
  END IF;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.pdv_get_order_receipt_snapshot_v2(order1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_order_denied' THEN
    RAISE EXCEPTION 'usuario sem tela nao falhou fechado: % %',denied_state,denied_detail;
  END IF;
END
$behavior$;

ROLLBACK;
