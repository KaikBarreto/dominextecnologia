-- Smoke W3. Executar após supabase db reset.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $contract$
DECLARE v_fn text;
BEGIN
  IF to_regclass('public.pdv_workflow_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'W3 criou uma segunda fonte para pdv_mode';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.pdv_delivery_receipt_snapshots'::regclass
    AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'W3 exige RLS/FORCE RLS no snapshot de retirada';
  END IF;
  IF has_table_privilege('authenticated','public.pdv_delivery_receipt_snapshots','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'W3 expôs tabelas internas diretamente';
  END IF;
  IF NOT has_function_privilege('authenticated','public.pdv_get_counter_capability_v2()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_capture_delivery_receipt_internal_v2(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'ACL das RPCs W3 está incorreta';
  END IF;
  -- Contratos públicos podem delegar gates/cálculos a helpers owner-only.
  -- Segurança observável e efeitos são verificados no bloco comportamental.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_list_cash_queue_v3(uuid,uuid)',
    'public.pdv_list_dispatch_queue_v2()',
    'public.pdv_get_dispatch_order_v2(uuid)',
    'public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)',
    'public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE')
       OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_fn::regprocedure
         AND p.prosecdef AND 'search_path=pg_catalog, public'=ANY(p.proconfig)) THEN
      RAISE EXCEPTION 'ACL/SECURITY DEFINER/search_path incorretos em %',v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.pdv_list_cash_queue_v2()','EXECUTE') THEN
    RAISE EXCEPTION 'fila sem contexto de caixa voltou a ser pública';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint constraint_row
     WHERE constraint_row.conname='pdv_orders_status_check'
       AND pg_get_constraintdef(constraint_row.oid) LIKE '%liberado_retirada%'
       AND pg_get_constraintdef(constraint_row.oid) LIKE '%retirada_parcial%'
  ) THEN RAISE EXCEPTION 'status W3 não foi incorporado ao pedido'; END IF;
END
$contract$;

DO $behavior$
<<fixture>>
DECLARE
  c uuid:='f3000000-0000-4000-8000-000000000001';
  c_other uuid:='f3000000-0000-4000-8000-000000000002';
  u uuid:='f3000000-0000-4000-8000-000000000003';
  u_denied uuid:='f3000000-0000-4000-8000-000000000004';
  u_stock_denied uuid:='f3000000-0000-4000-8000-000000000005';
  stock_id uuid:='f3000000-0000-4000-8000-000000000011';
  stock_other uuid:='f3000000-0000-4000-8000-000000000012';
  inventory_id uuid:='f3000000-0000-4000-8000-000000000021';
  cash_account uuid:='f3000000-0000-4000-8000-000000000031';
  bank_account uuid:='f3000000-0000-4000-8000-000000000032';
  terminal_id uuid:='f3000000-0000-4000-8000-000000000041';
  other_terminal uuid:='f3000000-0000-4000-8000-000000000042';
  customer_id uuid:='f3000000-0000-4000-8000-000000000051';
  preorder_id uuid:='f3000000-0000-4000-8000-000000000052';
  preorder_item uuid:='f3000000-0000-4000-8000-000000000053';
  order_id uuid:='f3000000-0000-4000-8000-000000000061';
  item_id uuid:='f3000000-0000-4000-8000-000000000062';
  card_order uuid:='f3000000-0000-4000-8000-000000000063';
  card_item uuid:='f3000000-0000-4000-8000-000000000064';
  credit_order uuid:='f3000000-0000-4000-8000-000000000065';
  credit_item uuid:='f3000000-0000-4000-8000-000000000066';
  other_order uuid:='f3000000-0000-4000-8000-000000000067';
  shortage_order uuid:='f3000000-0000-4000-8000-000000000068';
  shortage_item uuid:='f3000000-0000-4000-8000-000000000069';
  reservation_id uuid; session_id uuid; delivery_one uuid; delivery_two uuid;
  result jsonb; retry jsonb; capability jsonb; blocked boolean; v_today date;
  before_movements integer; after_movements integer; residual numeric;
  before_financial integer; competence jsonb; cash_dre jsonb; cash_flow jsonb;
  coverage_replay_denied boolean:=false; coverage_replay_detail text;
  retry_payments jsonb; retry_state text; retry_detail text;
  retry_scenario text; original_permissions jsonb;
  before_coverage_counts jsonb; after_coverage_counts jsonb;
BEGIN
  INSERT INTO auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) VALUES
    ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated',
     'counter@example.invalid','',now(),'{}','{"full_name":"Caixa Balcão"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u_denied,'authenticated','authenticated',
     'counter-denied@example.invalid','',now(),'{}','{"full_name":"Sem permissão"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u_stock_denied,'authenticated','authenticated',
     'counter-stock@example.invalid','',now(),'{}','{"full_name":"Sem local"}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status)
  VALUES(c,'Fixture Balcão','active'),(c_other,'Outro Balcão','active');
  UPDATE public.profiles SET company_id=c,is_active=true
   WHERE user_id IN(u,u_denied,u_stock_denied);
  INSERT INTO public.user_roles(user_id,role) VALUES
    (u,'comercial'::public.app_role),(u_denied,'comercial'::public.app_role),
    (u_stock_denied,'comercial'::public.app_role);
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u,'["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","screen:pdv_settings","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:cover_pdv_order","fn:deliver_pdv_order","fn:use_bank_accounts","fn:approve_pdv_credit"]',true),
    (u_denied,'["screen:pdv"]',true),
    (u_stock_denied,'["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","fn:cover_pdv_order","fn:deliver_pdv_order"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(cash_account,c,'Cofre Balcão','caixa',1000,true),
        (bank_account,c,'Banco Balcão','banco',500,true);
  INSERT INTO public.company_settings(
    company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode
  ) VALUES(c,'Fixture Balcão','America/Sao_Paulo',cash_account,true,'simples')
  ON CONFLICT (company_id) DO UPDATE SET name=EXCLUDED.name, timezone=EXCLUDED.timezone, pdv_cash_account_id=EXCLUDED.pdv_cash_account_id, pdv_strict_cash_tracking=EXCLUDED.pdv_strict_cash_tracking, pdv_mode=EXCLUDED.pdv_mode;
  INSERT INTO public.company_nfce_settings(
    company_id,enabled,homologation_approved,production_approved,uf,series
  ) VALUES(c,true,true,false,'SP',1);
  -- A criação da empresa já fornece um estoque padrão; a fixture escolhe outro explicitamente.
  UPDATE public.stocks SET is_default=false WHERE company_id IN (c, c_other) AND is_default IS TRUE;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock_id,c,'Depósito Balcão',true),(stock_other,c_other,'Outro Depósito',true);
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock_id,u);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
  VALUES(terminal_id,c,'Caixa Balcão',stock_id,true),(other_terminal,c_other,'Caixa outro tenant',stock_other,true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
  VALUES(inventory_id,c,'BAL-1','Cimento Balcão','un',5,10,50);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
  VALUES(c,inventory_id,stock_id,5,true);
  INSERT INTO public.customers(id,company_id,name,credit_limit)
  VALUES(customer_id,c,'Cliente Balcão',500);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  capability:=public.pdv_get_counter_capability_v2();
  IF capability->>'mode'<>'simples' OR (capability->>'counter_enabled')::boolean THEN
    RAISE EXCEPTION 'modo ausente não falhou fechado em simples';
  END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_list_cash_queue_v3(session_id,terminal_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'fila balcão abriu no modo simples'; END IF;
  PERFORM public.pdv_save_workflow_settings_v2('balcao');
  capability:=public.pdv_get_counter_capability_v2();
  IF capability->>'mode'<>'balcao' OR NOT(capability->>'counter_enabled')::boolean THEN
    RAISE EXCEPTION 'modo balcão não ativou capability';
  END IF;
  -- Vendedor que enxerga pedidos, mesmo com a ação nominal, não opera o caixa.
  UPDATE public.user_permissions SET permissions='["screen:pdv_orders","fn:cover_pdv_order"]'::jsonb
   WHERE user_id=u_denied;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u_denied,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_list_cash_queue_v3(session_id,terminal_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'vendedor sem tela do caixa listou a fila'; END IF;
  -- A tela do caixa isolada também falha fechado sem a ação nominal.
  UPDATE public.user_permissions SET permissions='["screen:pdv"]'::jsonb
   WHERE user_id=u_denied;
  blocked:=false;
  BEGIN PERFORM public.pdv_list_cash_queue_v3(session_id,terminal_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'tela do caixa sem ação nominal listou a fila'; END IF;
  -- Caixa com tela + ação, sem screen:pdv_orders, atravessa o gate nominal.
  UPDATE public.user_permissions SET permissions='["screen:pdv","fn:cover_pdv_order"]'::jsonb
   WHERE user_id=u_denied;
  blocked:=false;
  BEGIN PERFORM public.pdv_list_cash_queue_v3(session_id,terminal_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'fila aceitou operador sem uma abertura própria'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal_id,cash_account,50,'counter-open-0001');
  session_id:=(result->>'session_id')::uuid; v_today:=public.company_today(c);

  result:=public.pdv_save_preorder_v2(
    preorder_id,0,
    jsonb_build_object('stock_id',stock_id,'customer_id',customer_id,
      'operation_mode','counter','discount_amount',0),
    jsonb_build_array(jsonb_build_object(
      'id',preorder_item,'inventory_id',inventory_id,'item_type','material',
      'description','Cimento Balcão','quantity',2,'unit_price',50,
      'discount_amount',0,'unit_factor',1,'sort_order',0
    )),'counter-preorder-save-0001'
  );
  result:=public.pdv_assign_preorder_terminal_v3(preorder_id,1,terminal_id,'counter-preorder-destination-0001');
  result:=public.pdv_forward_preorder_v2(preorder_id,2,'counter-preorder-forward-0001');
  result:=public.pdv_convert_preorder_v2(preorder_id,3,'counter-preorder-convert-0001');
  order_id:=(result->>'order_id')::uuid;
  SELECT item.id INTO item_id FROM public.pdv_order_items item
   WHERE item.order_id=fixture.order_id AND item.inventory_id=fixture.inventory_id;
  IF order_id IS NULL OR item_id IS NULL OR EXISTS(
    SELECT 1 FROM public.pdv_stock_reservation_items reservation
     WHERE reservation.order_item_id=item_id
  ) THEN
    RAISE EXCEPTION 'conversão comum sem reserva não foi reproduzida';
  END IF;
  -- O caixa real não precisa da tela do vendedor: fila e cobertura usam
  -- screen:pdv + fn:cover_pdv_order. Mantém Expedição para as etapas seguintes.
  UPDATE public.user_permissions SET permissions=
    '["screen:pdv","screen:pdv_dispatch","screen:pdv_settings","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:cover_pdv_order","fn:deliver_pdv_order","fn:use_bank_accounts","fn:approve_pdv_credit"]'::jsonb
   WHERE user_id=u;
  IF jsonb_array_length(public.pdv_list_cash_queue_v3(session_id,terminal_id))<>1 THEN
    RAISE EXCEPTION 'pedido convertido não apareceu na fila do caixa';
  END IF;

  result:=public.pdv_cover_existing_order_v2(
    order_id,terminal_id,session_id,cash_account,
    jsonb_build_array(
      jsonb_build_object('method','dinheiro','amount',20),
      jsonb_build_object('method','pix','amount',30,'account_id',bank_account),
      jsonb_build_object('method','fiado','amount',50,'due_date',v_today+30)
    ),'counter-cover-main-0001'
  );
  SELECT count(*) INTO before_financial FROM public.financial_transactions WHERE company_id=c;
  BEGIN
    retry:=public.pdv_cover_existing_order_v2(
    order_id,terminal_id,session_id,cash_account,
    jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20),
      jsonb_build_object('method','pix','amount',30,'account_id',bank_account),
      jsonb_build_object('method','fiado','amount',50,'due_date',v_today+30)),
    'counter-cover-main-0001');
  EXCEPTION WHEN insufficient_privilege THEN
    coverage_replay_denied:=true;
    GET STACKED DIAGNOSTICS coverage_replay_detail=PG_EXCEPTION_DETAIL;
  END;
  IF NOT coverage_replay_denied AND (retry->>'order_id' IS DISTINCT FROM result->>'order_id'
     OR NOT COALESCE((retry->>'idempotent')::boolean,false)
     OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_financial) THEN
    RAISE EXCEPTION 'replay da cobertura mudou identidade ou duplicou financeiro';
  END IF;
  -- Cobertura paga deve aceitar a mesma intenção normalizada, não apenas
  -- o mesmo JSON serializado. Nenhum gate permite efetuar nova cobrança.
  retry_payments:=jsonb_build_array(
    jsonb_build_object('method','fiado','amount','50.00','due_date',v_today+30),
    jsonb_build_object('method','pix','amount',30,'account_id',bank_account),
    jsonb_build_object('method','dinheiro','amount',20));
  IF NOT coverage_replay_denied THEN
    retry:=public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
      retry_payments,'counter-cover-main-0001');
    IF retry->>'order_id' IS DISTINCT FROM result->>'order_id'
      OR NOT COALESCE((retry->>'idempotent')::boolean,false) THEN
      RAISE EXCEPTION 'reordenação/decimal equivalente alterou intenção idempotente';
    END IF;
  END IF;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.pdv_order_payments row WHERE row.company_id=c),
    (SELECT count(*) FROM public.financial_transactions row WHERE row.company_id=c),
    (SELECT count(*) FROM public.pdv_cash_custody_entries row WHERE row.company_id=c),
    (SELECT count(*) FROM public.pdv_stock_reservation_items row WHERE row.company_id=c),
    (SELECT count(*) FROM public.pdv_deliveries row WHERE row.company_id=c),
    (SELECT count(*) FROM public.inventory_movements movement WHERE movement.inventory_id=fixture.inventory_id)
  ) INTO before_coverage_counts;
  SELECT permissions INTO original_permissions FROM public.user_permissions WHERE user_id=u;
  FOREACH retry_scenario IN ARRAY ARRAY['amount','due_date','fresh_key','terminal','account','action','actor','tenant'] LOOP
    retry_state:=NULL; retry_detail:=NULL;
    BEGIN
      CASE retry_scenario
      WHEN 'amount' THEN
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
          jsonb_set(retry_payments,'{0,amount}','51'::jsonb),'counter-cover-main-0001');
      WHEN 'due_date' THEN
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
          jsonb_set(retry_payments,'{0,due_date}',to_jsonb(v_today+31)),'counter-cover-main-0001');
      WHEN 'fresh_key' THEN
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
          retry_payments,'counter-cover-new-key-denied');
      WHEN 'terminal' THEN
        PERFORM public.pdv_cover_existing_order_v2(order_id,other_terminal,session_id,cash_account,
          retry_payments,'counter-cover-main-0001');
      WHEN 'account' THEN
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,bank_account,
          retry_payments,'counter-cover-main-0001');
      WHEN 'action' THEN
        UPDATE public.user_permissions SET permissions='["screen:pdv"]'::jsonb WHERE user_id=u;
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
          retry_payments,'counter-cover-main-0001');
      WHEN 'actor' THEN
        -- Mesmo um gestor com acesso à gaveta não herda autoria do request.
        INSERT INTO public.user_roles(user_id,role) VALUES(u_denied,'admin'::public.app_role);
        UPDATE public.user_permissions SET permissions=permissions||'["fn:operate_other_pdv_cash"]'::jsonb
          WHERE user_id=u_denied;
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u_denied,'role','authenticated')::text,true);
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
          retry_payments,'counter-cover-main-0001');
      WHEN 'tenant' THEN
        UPDATE public.profiles SET company_id=c_other WHERE user_id=u;
        INSERT INTO public.company_modules(company_id,module_code) VALUES(c_other,'pdv') ON CONFLICT DO NOTHING;
        INSERT INTO public.company_settings(company_id,name,pdv_mode) VALUES(c_other,'Outro balcão fictício','balcao')
          ON CONFLICT(company_id) DO UPDATE SET pdv_mode='balcao';
        PERFORM public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
          retry_payments,'counter-cover-main-0001');
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS retry_state=RETURNED_SQLSTATE,retry_detail=PG_EXCEPTION_DETAIL;
    END;
    -- O sub-bloco revertido restaura também perfil, roles e permissões.
    IF retry_state IS NULL OR (retry_scenario IN('amount','due_date') AND retry_state<>'22023')
      OR (retry_scenario NOT IN('amount','due_date') AND retry_state<>'42501')
      OR (retry_scenario='actor' AND retry_detail<>'code=pdv_counter_replay_forbidden') THEN
      RAISE EXCEPTION 'gate de retry % falhou: SQLSTATE=%, detalhe=%',retry_scenario,retry_state,retry_detail;
    END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  END LOOP;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.pdv_order_payments row WHERE row.company_id=c),
    (SELECT count(*) FROM public.financial_transactions row WHERE row.company_id=c),
    (SELECT count(*) FROM public.pdv_cash_custody_entries row WHERE row.company_id=c),
    (SELECT count(*) FROM public.pdv_stock_reservation_items row WHERE row.company_id=c),
    (SELECT count(*) FROM public.pdv_deliveries row WHERE row.company_id=c),
    (SELECT count(*) FROM public.inventory_movements movement WHERE movement.inventory_id=fixture.inventory_id)
  ) INTO after_coverage_counts;
  IF before_coverage_counts IS DISTINCT FROM after_coverage_counts
    OR (SELECT permissions FROM public.user_permissions WHERE user_id=u) IS DISTINCT FROM original_permissions THEN
    RAISE EXCEPTION 'retry negado alterou cobertura/estoque/custódia ou fixture de autorização';
  END IF;
  IF result->>'status'<>'liberado_retirada'
     OR (SELECT paid_at IS NOT NULL FROM public.pdv_orders WHERE id=fixture.order_id) THEN
    RAISE EXCEPTION 'misto/fiado não liberou corretamente sem mentir quitação';
  END IF;
  SELECT reservation.id INTO reservation_id
    FROM public.pdv_stock_reservation_items reservation
   WHERE reservation.order_item_id=item_id AND reservation.state='guaranteed';
  SELECT reserved_quantity-consumed_quantity-released_quantity INTO residual
    FROM public.pdv_stock_reservation_items WHERE id=reservation_id;
  IF residual<>2 OR NOT EXISTS(
    SELECT 1 FROM public.pdv_stock_reservation_items reservation
     WHERE reservation.id=reservation_id AND reservation.cost_price_snapshot=10
  ) THEN
    RAISE EXCEPTION 'cobertura não criou a garantia com custo canônico';
  END IF;
  IF EXISTS(SELECT 1 FROM public.nfce_documents WHERE company_id=c)
     OR EXISTS(SELECT 1 FROM public.nfce_outbox WHERE company_id=c)
     OR EXISTS(SELECT 1 FROM public.nfce_events WHERE company_id=c) THEN
    RAISE EXCEPTION 'cobertura não fiscal disparou NFC-e';
  END IF;
  IF jsonb_array_length(public.pdv_list_dispatch_queue_v2())<>1
     OR public.pdv_list_dispatch_queue_v2()::text ~ 'total|amount|method|coverage|commercial' THEN
    RAISE EXCEPTION 'pedido coberto não apareceu na expedição';
  END IF;

  -- Falta de estoque desfaz reserva, cobertura e request na mesma transação.
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,salesperson_id,stock_id,
    status,subtotal,discount_amount,total,contract_version,operation_mode_snapshot,target_terminal_id)
  VALUES(shortage_order,c,9,NULL,u,stock_id,'aguardando_pagamento',500,0,500,2,'counter',terminal_id);
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,
    unit_price,unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,
    contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2,unit)
  VALUES(shortage_item,c,shortage_order,inventory_id,'Sem saldo',10,50,10,0,500,0,
    'material',10,2,500,0,0,'un');
  SELECT count(*) INTO before_financial FROM public.financial_transactions WHERE company_id=c;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_cover_existing_order_v2(
      shortage_order,terminal_id,session_id,cash_account,
      jsonb_build_array(jsonb_build_object('method','dinheiro','amount',500)),
      'counter-shortage-cover-0001'
    );
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked
     OR EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=shortage_order)
     OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_financial
     OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request
       WHERE request.company_id=c AND request.operation_type='counter.cover.v2'
         AND request.idempotency_key='counter-shortage-cover-0001') THEN
    RAISE EXCEPTION 'falha de estoque deixou cobertura, financeiro ou replay residual';
  END IF;

  -- Conflito pós-cobertura aparece sem exagerar saldo e falha fechado.
  PERFORM public.pdv_set_stock_reservation_shortage_internal_v2(c,reservation_id,1);
  result:=public.pdv_get_dispatch_order_v2(order_id);
  IF result::text ~ 'total|amount|method|coverage|commercial|cost|credit_limit|document'
     OR (result#>>'{items,0,reservations,0,available_quantity}')::numeric<>1
     OR NOT(result#>>'{items,0,reservations,0,has_conflict}')::boolean THEN
    RAISE EXCEPTION 'detalhe de expedição expôs financeiro ou exagerou reserva em conflito';
  END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_dispatch_delivery_v2(
      order_id,jsonb_build_array(jsonb_build_object(
        'order_item_id',item_id,'reservation_id',reservation_id,'quantity',1
      )),'dispatch-conflict-denied-0001'
    );
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'expedição consumiu reserva em conflito'; END IF;
  PERFORM public.pdv_set_stock_reservation_shortage_internal_v2(c,reservation_id,0);

  SELECT count(*) INTO before_movements
    FROM public.inventory_movements movement
   WHERE movement.inventory_id=fixture.inventory_id;
  result:=public.pdv_complete_dispatch_delivery_v2(
    order_id,jsonb_build_array(jsonb_build_object(
      'order_item_id',item_id,'reservation_id',reservation_id,'quantity',1
    )),'dispatch-main-partial-0001'
  );
  delivery_one:=(result->>'delivery_id')::uuid;
  IF result->>'status'<>'retirada_parcial' OR (result->>'remaining_items')::integer<>1 THEN
    RAISE EXCEPTION 'primeira retirada não ficou parcial';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_delivery_items delivery_item
    WHERE delivery_item.delivery_id=delivery_one AND delivery_item.commercial_amount_snapshot=50
      AND delivery_item.cmv_amount_snapshot=10) THEN
    RAISE EXCEPTION 'slice de receita/CMV da retirada parcial divergiu';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_delivery_receipt_snapshots snapshot
    WHERE snapshot.delivery_id=delivery_one
      AND snapshot.snapshot::text NOT LIKE '%cost%'
      AND snapshot.snapshot::text NOT LIKE '%credit_limit%'
      AND snapshot.snapshot::text NOT LIKE '%document%'
      AND snapshot.snapshot::text NOT LIKE '%amount%'
      AND snapshot.snapshot::text NOT LIKE '%method%'
      AND snapshot.snapshot::text NOT LIKE '%coverage%'
      AND snapshot.snapshot::text NOT LIKE '%commercial%'
      AND snapshot.snapshot#>>'{order,status}'='retirada_parcial') THEN
    RAISE EXCEPTION 'snapshot da retirada faltou ou expôs campo sensível';
  END IF;
  IF round(COALESCE((SELECT sum(application.commercial_amount)
    FROM public.pdv_settlement_applications application
    WHERE application.order_id=fixture.order_id AND application.application_kind='settlement'),0),2)<>50 THEN
    RAISE EXCEPTION 'FIFO não aplicou os recebimentos à primeira retirada';
  END IF;
  competence:=public.pdv_dre_competence_projection_v2(c,v_today,v_today,100,0);
  cash_dre:=public.pdv_dre_cash_projection_v2(c,v_today,v_today,100,0);
  cash_flow:=public.pdv_dfc_projection_v2(c,v_today,v_today,100,0);
  IF (competence->>'revenue')::numeric<>50 OR (competence->>'cmv')::numeric<>10
     OR (cash_dre->>'revenue')::numeric<>50 OR (cash_dre->>'cmv')::numeric<>10
     OR (cash_flow->>'cash_flow')::numeric<>50 THEN
    RAISE EXCEPTION 'DRE/DFC parcial não reconheceu a fatia uma única vez';
  END IF;
  retry:=public.pdv_complete_dispatch_delivery_v2(
    order_id,jsonb_build_array(jsonb_build_object(
      'order_item_id',item_id,'reservation_id',reservation_id,'quantity',1
    )),'dispatch-main-partial-0001'
  );
  IF NOT(retry->>'idempotent')::boolean OR retry->>'delivery_id'<>delivery_one::text THEN
    RAISE EXCEPTION 'retry da retirada duplicou ou perdeu identidade';
  END IF;
  SELECT count(*) INTO after_movements
    FROM public.inventory_movements movement
   WHERE movement.inventory_id=fixture.inventory_id;
  IF after_movements<>before_movements+1 THEN RAISE EXCEPTION 'retry duplicou Kardex'; END IF;
  competence:=public.pdv_dre_competence_projection_v2(c,v_today,v_today,100,0);
  cash_dre:=public.pdv_dre_cash_projection_v2(c,v_today,v_today,100,0);
  cash_flow:=public.pdv_dfc_projection_v2(c,v_today,v_today,100,0);
  IF (competence->>'revenue')::numeric<>50 OR (competence->>'cmv')::numeric<>10
     OR (cash_dre->>'revenue')::numeric<>50 OR (cash_dre->>'cmv')::numeric<>10
     OR (cash_flow->>'cash_flow')::numeric<>50 THEN
    RAISE EXCEPTION 'retry duplicou DRE/DFC';
  END IF;

  result:=public.pdv_complete_dispatch_delivery_v2(
    order_id,jsonb_build_array(jsonb_build_object(
      'order_item_id',item_id,'reservation_id',reservation_id,'quantity',1
    )),'dispatch-main-final-0001'
  );
  delivery_two:=(result->>'delivery_id')::uuid;
  IF result->>'status'<>'entregue' OR (result->>'remaining_items')::integer<>0 THEN
    RAISE EXCEPTION 'segunda retirada não concluiu o pedido';
  END IF;
  IF (SELECT count(*) FROM public.pdv_delivery_receipt_snapshots snapshot
       WHERE snapshot.order_id=fixture.order_id)<>2
     OR NOT EXISTS(SELECT 1 FROM public.pdv_order_receipt_snapshots snapshot
       WHERE snapshot.order_id=fixture.order_id) THEN
    RAISE EXCEPTION 'comprovantes de retirada/pedido não foram congelados';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_delivery_receipt_snapshots snapshot
    WHERE snapshot.delivery_id=delivery_two
      AND snapshot.snapshot#>>'{order,status}'='entregue') THEN
    RAISE EXCEPTION 'snapshot final não congelou o status entregue';
  END IF;
  IF round(COALESCE((SELECT sum(delivery_item.commercial_amount_snapshot)
    FROM public.pdv_delivery_items delivery_item
    JOIN public.pdv_deliveries delivery ON delivery.id=delivery_item.delivery_id
    WHERE delivery.order_id=fixture.order_id),0),2)<>100
     OR round(COALESCE((SELECT sum(delivery_item.cmv_amount_snapshot)
    FROM public.pdv_delivery_items delivery_item
    JOIN public.pdv_deliveries delivery ON delivery.id=delivery_item.delivery_id
    WHERE delivery.order_id=fixture.order_id),0),2)<>20 THEN
    RAISE EXCEPTION 'DRE/CMV das retiradas não fechou uma vez';
  END IF;
  competence:=public.pdv_dre_competence_projection_v2(c,v_today,v_today,100,0);
  cash_dre:=public.pdv_dre_cash_projection_v2(c,v_today,v_today,100,0);
  cash_flow:=public.pdv_dfc_projection_v2(c,v_today,v_today,100,0);
  IF (competence->>'revenue')::numeric<>100 OR (competence->>'cmv')::numeric<>20
     OR (cash_dre->>'revenue')::numeric<>50 OR (cash_dre->>'cmv')::numeric<>10
     OR (cash_flow->>'cash_flow')::numeric<>50 THEN
    RAISE EXCEPTION 'DRE/DFC final duplicou competência, caixa ou fluxo';
  END IF;
  IF EXISTS(SELECT 1 FROM public.nfce_documents WHERE company_id=c)
     OR EXISTS(SELECT 1 FROM public.nfce_outbox WHERE company_id=c)
     OR EXISTS(SELECT 1 FROM public.nfce_events WHERE company_id=c) THEN
    RAISE EXCEPTION 'retirada não fiscal disparou NFC-e';
  END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_dispatch_delivery_v2(
      order_id,jsonb_build_array(jsonb_build_object(
        'order_item_id',item_id,'reservation_id',reservation_id,'quantity',1
      )),'dispatch-main-over-0001'
    );
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'retirada acima do saldo foi aceita'; END IF;

  -- Cartão autorizado e fiado aprovado também liberam, sem marcar paid_at.
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,salesperson_id,stock_id,
    status,subtotal,discount_amount,total,contract_version,operation_mode_snapshot,target_terminal_id)
  VALUES(card_order,c,2,NULL,u,stock_id,'aguardando_pagamento',10,0,10,2,'counter',terminal_id),
        (credit_order,c,3,customer_id,u,stock_id,'aguardando_pagamento',10,0,10,2,'counter',terminal_id);
  INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,unit_price,
    unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,contract_version,
    gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2,unit)
  VALUES(card_item,c,card_order,'Serviço cartão',1,10,0,0,10,0,'service',NULL,2,10,0,0,'un'),
        (credit_item,c,credit_order,'Serviço fiado',1,10,0,0,10,0,'service',NULL,2,10,0,0,'un');
  PERFORM public.pdv_cover_existing_order_v2(card_order,terminal_id,session_id,cash_account,
    jsonb_build_array(jsonb_build_object('method','debito','amount',10)),'counter-card-0001');
  PERFORM public.pdv_cover_existing_order_v2(credit_order,terminal_id,session_id,cash_account,
    jsonb_build_array(jsonb_build_object('method','fiado','amount',10,'due_date',v_today+10)),'counter-credit-0001');
  IF EXISTS(SELECT 1 FROM public.pdv_orders WHERE id IN(card_order,credit_order)
    AND(status<>'liberado_retirada' OR paid_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'cartão/fiado não liberaram corretamente';
  END IF;

  -- Cross-tenant, tela nominal e ACL de local falham fechado.
  PERFORM set_config('request.jwt.claims','{}',true);
  INSERT INTO public.pdv_orders(id,company_id,number,status,subtotal,discount_amount,total,stock_id,
    contract_version,operation_mode_snapshot,target_terminal_id)
  VALUES(other_order,c_other,1,'aguardando_pagamento',0,0,0,stock_other,2,'counter',other_terminal);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_cover_existing_order_v2(other_order,terminal_id,session_id,cash_account,
    '[]'::jsonb,'counter-cross-tenant-0001');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'pedido de outro tenant foi aceito'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u_denied,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_list_dispatch_queue_v2();
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuário sem tela acessou expedição'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u_stock_denied,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_dispatch_order_v2(order_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuário sem ACL local acessou pedido'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_get_delivery_receipt_snapshot_v2(delivery_one);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuário sem ACL local acessou comprovante da retirada'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  IF (public.pdv_get_delivery_receipt_snapshot_v2(delivery_one)->>'notice') NOT LIKE 'Comprovante não fiscal%' THEN
    RAISE EXCEPTION 'comprovante da retirada perdeu aviso não fiscal';
  END IF;
  blocked:=false;
  BEGIN UPDATE public.pdv_delivery_receipt_snapshots SET snapshot='{}' WHERE delivery_id=delivery_one;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'snapshot de retirada foi alterado'; END IF;
  blocked:=false;
  BEGIN DELETE FROM public.pdv_delivery_receipt_snapshots WHERE delivery_id=delivery_one;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'snapshot de retirada foi excluído'; END IF;

  UPDATE public.company_settings SET pdv_mode='simples' WHERE company_id=c;
  capability:=public.pdv_get_counter_capability_v2();
  IF (capability->>'counter_enabled')::boolean THEN
    RAISE EXCEPTION 'modo simples não ocultou fluxo complexo';
  END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_list_dispatch_queue_v2();
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'servidor aceitou expedição no modo simples'; END IF;

  -- O reset operacional remove snapshots e os requests W3, mas preserva configuração.
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'::public.app_role) ON CONFLICT DO NOTHING;
  PERFORM public.reset_system_step(c,'pdv',gen_random_uuid());
  IF EXISTS(SELECT 1 FROM public.pdv_delivery_receipt_snapshots snapshot
       WHERE snapshot.order_id=fixture.order_id)
     OR EXISTS(SELECT 1 FROM public.pdv_order_receipt_snapshots snapshot
       WHERE snapshot.order_id=fixture.order_id)
     OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request
       WHERE request.company_id=c
         AND request.operation_type IN('counter.cover.v2','dispatch.deliver.v2'))
     OR NOT EXISTS(SELECT 1 FROM public.company_settings
       WHERE company_id=c AND pdv_mode='simples') THEN
    RAISE EXCEPTION 'lifecycle do reset apagou configuração ou deixou snapshot órfão';
  END IF;
  -- A falha continua VERMELHA; adiar o raise permite verificar os demais
  -- efeitos na mesma fixture em vez de mascará-los atrás do wrapper obsoleto.
  IF coverage_replay_denied THEN
    RAISE EXCEPTION 'replay de cobertura concluída foi negado pelo wrapper'
      USING ERRCODE='42501',DETAIL=COALESCE(coverage_replay_detail,'sem detalhe');
  END IF;
END
$behavior$;

ROLLBACK;
