-- Contrato/smoke W2-02. Executar após supabase db reset.
BEGIN;

DO $contract$
DECLARE v_definition text;
BEGIN
  IF has_function_privilege(
       'anon','public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE'
     ) OR has_function_privilege(
       'authenticated','public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role','public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE'
     ) THEN
    RAISE EXCEPTION 'venda direta foi ativada para o cliente antes do gate';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc function
     WHERE function.oid=
       'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
       AND function.prosecdef
       AND 'search_path=pg_catalog, public, extensions'=ANY(function.proconfig)
  ) THEN RAISE EXCEPTION 'RPC sem SECURITY DEFINER/search_path fixo'; END IF;

  SELECT pg_get_functiondef(
    'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition,'pdv_claim_operation_request')=0
     OR strpos(v_definition,'pdv_lock_treasury_accounts')=0
     OR strpos(v_definition,'pdv_reserve_stock_internal_v2')=0
     OR strpos(v_definition,'pdv_complete_delivery_internal_v2')=0
     OR strpos(v_definition,'pdv_create_receivable_financial_v2')=0
     OR strpos(v_definition,'pdv_apply_settlement_fifo_v2')=0
     OR strpos(v_definition,'fn:complete_direct_sale')=0
     OR strpos(v_definition,'fn:override_pdv_sale_price')=0
     OR strpos(v_definition,'fn:apply_pdv_discount')=0
     OR strpos(v_definition,'fn:backdate_pdv_sale')=0
     OR strpos(v_definition,'transaction_date_v2')=0
     OR strpos(v_definition,'status=''pago''')>0
     OR strpos(v_definition,'pdv_lock_treasury_accounts')>
        strpos(v_definition,'FROM public.pdv_cash_sessions')
  THEN RAISE EXCEPTION 'RPC perdeu idempotência, lock, autorização ou primitivas W1'; END IF;
  IF strpos(pg_get_functiondef(
       'public.reset_system_step(uuid,text,uuid)'::regprocedure
     ),'direct_sale.complete.v2')=0
  THEN RAISE EXCEPTION 'reset deixa request de venda direta órfão'; END IF;
END
$contract$;

DO $behavior$
DECLARE
  c uuid := 'e2000000-0000-4000-8000-000000000001';
  c_other uuid := 'e2000000-0000-4000-8000-000000000002';
  u uuid := 'e2000000-0000-4000-8000-000000000003';
  u_denied uuid := 'e2000000-0000-4000-8000-000000000004';
  stock_id uuid := 'e2000000-0000-4000-8000-000000000011';
  stock_other uuid := 'e2000000-0000-4000-8000-000000000012';
  inventory_id uuid := 'e2000000-0000-4000-8000-000000000021';
  inventory_zero uuid := 'e2000000-0000-4000-8000-000000000022';
  inventory_other uuid := 'e2000000-0000-4000-8000-000000000023';
  inventory_credit uuid := 'e2000000-0000-4000-8000-000000000024';
  inventory_discount_a uuid := 'e2000000-0000-4000-8000-000000000025';
  inventory_discount_b uuid := 'e2000000-0000-4000-8000-000000000026';
  cash_account uuid := 'e2000000-0000-4000-8000-000000000031';
  bank_account uuid := 'e2000000-0000-4000-8000-000000000032';
  other_account uuid := 'e2000000-0000-4000-8000-000000000033';
  terminal_id uuid := 'e2000000-0000-4000-8000-000000000041';
  terminal_other uuid := 'e2000000-0000-4000-8000-000000000042';
  customer_id uuid := 'e2000000-0000-4000-8000-000000000051';
  session_id uuid;
  order_id uuid;
  zero_order_id uuid;
  immediate_order_id uuid;
  discount_order_id uuid;
  result jsonb;
  retry_result jsonb;
  dre_comp jsonb;
  dre_cash jsonb;
  dfc jsonb;
  cart jsonb;
  payments jsonb;
  blocked boolean;
  before_orders integer;
  before_requests integer;
  after_orders integer;
  after_requests integer;
  custody numeric;
  oversized_cart jsonb;
  credit_balance numeric;
  v_today date;
  v_backdate date;
BEGIN
  INSERT INTO auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) VALUES
    ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated',
     'direct-sale@example.invalid','',now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Caixa Direct"}'::jsonb,now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u_denied,'authenticated','authenticated',
     'direct-denied@example.invalid','',now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Sem capacidade"}'::jsonb,now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status)
  VALUES(c,'Fixture Direct Sale','active'),(c_other,'Outro tenant Direct','active');
  UPDATE public.profiles SET company_id=c,is_active=true
   WHERE user_id IN(u,u_denied);
  INSERT INTO public.user_roles(user_id,role) VALUES
    (u,'comercial'::public.app_role),(u_denied,'comercial'::public.app_role);
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u,'["screen:pdv","fn:complete_direct_sale","fn:use_bank_accounts","fn:approve_pdv_credit","fn:override_pdv_sale_price","fn:apply_pdv_discount","fn:backdate_pdv_sale"]'::jsonb,true),
    (u_denied,'["screen:pdv"]'::jsonb,true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  INSERT INTO public.financial_accounts(
    id,company_id,name,type,initial_balance,is_active
  ) VALUES
    (cash_account,c,'Cofre Direct','caixa',1000,true),
    (bank_account,c,'Banco Direct','banco',500,true),
    (other_account,c_other,'Cofre Other','caixa',100,true);
  INSERT INTO public.company_settings(
    company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode
  ) VALUES(c,'Fixture Direct','America/Sao_Paulo',cash_account,true,'simples');
  INSERT INTO public.company_nfce_settings(
    company_id,enabled,homologation_approved,production_approved,uf,series
  ) VALUES(c,true,true,false,'SP',1);
  v_today := public.company_today(c);
  v_backdate := v_today-1;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock_id,c,'Loja Direct',true),(stock_other,c_other,'Outro estoque',true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES
    (terminal_id,c,'Terminal Direct',stock_id,true),
    (terminal_other,c_other,'Terminal Other',stock_other,true);
  INSERT INTO public.inventory(
    id,company_id,sku,name,unit,quantity,cost_price,sale_price
  ) VALUES
    (inventory_id,c,'DIR-1','Última unidade','un',1,7,200),
    (inventory_zero,c,'DIR-0','Bonificado','un',1,5,0),
    (inventory_credit,c,'DIR-C','Teste limite','un',1,0,1),
    (inventory_discount_a,c,'DIR-DA','Preço especial','un',1,20,100),
    (inventory_discount_b,c,'DIR-DB','Desconto geral','un',2,10,50),
    (inventory_other,c_other,'DIR-X','Outro tenant','un',1,3,10);
  INSERT INTO public.inventory_stock_levels(
    company_id,inventory_id,stock_id,quantity,is_present
  ) VALUES
    (c,inventory_id,stock_id,1,true),
    (c,inventory_zero,stock_id,1,true),
    (c,inventory_credit,stock_id,1,true),
    (c,inventory_discount_a,stock_id,1,true),
    (c,inventory_discount_b,stock_id,2,true),
    (c_other,inventory_other,stock_other,1,true);
  INSERT INTO public.customers(id,company_id,name,credit_limit)
  VALUES(customer_id,c,'Cliente Direct',80);
  INSERT INTO public.customer_credit_ledger(
    company_id,customer_id,kind,amount,created_by,notes
  ) VALUES
    (c,customer_id,'ajuste',30,u,'Ajuste positivo legado'),
    (c,customer_id,'ajuste',-10,u,'Ajuste negativo legado');

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',u,'role','authenticated')::text,true
  );
  result := public.pdv_open_cash_session_v2(
    terminal_id,cash_account,50,'direct-open-session-0001'
  );
  session_id := (result->>'session_id')::uuid;

  -- Especiais numéricos e carrinho excessivo falham antes do claim/fatos.
  SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
  SELECT count(*) INTO before_requests FROM public.pdv_operation_requests
   WHERE company_id=c AND operation_type='direct_sale.complete.v2';
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_id,'stock_id',stock_id,'quantity','NaN'
      )),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',200)),
      'direct-sale-nan-quantity-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'NaN em quantidade foi aceito'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1
      )),jsonb_build_array(jsonb_build_object('method','dinheiro','amount','Infinity')),
      'direct-sale-infinity-amount-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Infinity em cobertura foi aceito'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1
      )),jsonb_build_array(jsonb_build_object(
        'method','credito','amount',200,'change_amount',1
      )),'direct-sale-card-change-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'troco em cobertura sem dinheiro foi aceito'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1
  )) INTO oversized_cart FROM generate_series(1,101);
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,oversized_cart,
      jsonb_build_array(jsonb_build_object('method','dinheiro','amount',200)),
      'direct-sale-too-many-items-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'carrinho acima de 100 itens foi aceito'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object(
        'items',jsonb_build_array(jsonb_build_object(
          'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1
        )),
        'order_discount_amount',0,'notes',repeat('x',2001),
        'transaction_date',v_today
      ),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',200)),
      'direct-sale-notes-too-long-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'observação acima do limite foi aceita'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object(
        'items',jsonb_build_array(jsonb_build_object(
          'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1,
          'discount_amount',200.01
        )),
        'order_discount_amount',0,'transaction_date',v_today
      ),'[]'::jsonb,'direct-sale-line-discount-exceeded-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'desconto de linha acima do bruto foi aceito'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object(
        'items',jsonb_build_array(jsonb_build_object(
          'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1
        )),
        'order_discount_amount',200.01,'transaction_date',v_today
      ),'[]'::jsonb,'direct-sale-order-discount-exceeded-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  SELECT count(*) INTO after_orders FROM public.pdv_orders WHERE company_id=c;
  SELECT count(*) INTO after_requests FROM public.pdv_operation_requests
   WHERE company_id=c AND operation_type='direct_sale.complete.v2';
  IF NOT blocked OR after_orders<>before_orders OR after_requests<>before_requests
  THEN RAISE EXCEPTION 'payload inválido deixou pedido/request parcial'; END IF;

  cart := jsonb_build_object(
    'items',jsonb_build_array(jsonb_build_object(
      'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1,
      'unit_cost',999,'unit_price',200,'discount_amount',0
    )),
    'order_discount_amount',0,
    'notes','  Venda mista do balcão  ',
    'transaction_date',v_today
  );
  payments := jsonb_build_array(
    jsonb_build_object('method','dinheiro','amount',50,'change_amount',10),
    jsonb_build_object('method','pix','amount',50,'account_id',bank_account),
    jsonb_build_object('method','credito','amount',40,'account_id',bank_account),
    jsonb_build_object(
      'method','fiado','amount',60,
      'due_date',(v_today + interval '1 month')::date
    )
  );
  result := public.pdv_complete_direct_sale_v2(
    terminal_id,session_id,cash_account,customer_id,cart,payments,
    'direct-sale-mixed-0001'
  );
  order_id := (result->>'order_id')::uuid;

  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_orders order_row
     WHERE order_row.id=order_id AND order_row.company_id=c
       AND order_row.status='entregue' AND order_row.contract_version=2
       AND order_row.operation_mode_snapshot='direct' AND order_row.total=200
       AND order_row.subtotal=200 AND order_row.discount_amount=0
       AND order_row.notes='Venda mista do balcão'
       AND order_row.transaction_date_v2=v_today
       AND order_row.paid_at IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM public.pdv_order_items item
     WHERE item.order_id=order_id AND item.inventory_id=inventory_id
       AND item.unit_price=200 AND item.unit_cost_v2=7 AND item.unit_cost=7
       AND item.contract_version=2
  ) THEN RAISE EXCEPTION 'pedido/item não congelou preço e custo do servidor'; END IF;
  IF (SELECT count(*) FROM public.pdv_order_payments payment
       WHERE payment.order_id=order_id AND payment.contract_version=2)<>4
     OR NOT EXISTS(
       SELECT 1 FROM public.pdv_order_payments payment
        WHERE payment.order_id=order_id AND payment.method='dinheiro'
          AND payment.amount=50 AND payment.change_amount=10
     )
     OR NOT EXISTS(
       SELECT 1 FROM public.pdv_order_payments payment
        WHERE payment.order_id=order_id
          AND payment.coverage_kind='card_authorization'
          AND payment.settlement_transaction_id IS NULL
     ) OR NOT EXISTS(
       SELECT 1 FROM public.pdv_order_payments payment
        WHERE payment.order_id=order_id AND payment.coverage_kind='receivable'
          AND payment.receivable_transaction_id IS NOT NULL
     )
  THEN RAISE EXCEPTION 'cobertura mista dinheiro/Pix/cartão/fiado divergente'; END IF;
  IF (SELECT count(*) FROM public.pdv_stock_reservation_items reservation
       WHERE reservation.order_item_id IN(
         SELECT id FROM public.pdv_order_items WHERE order_id=order_id
       ) AND reservation.state='consumed')<>1
     OR (SELECT count(*) FROM public.pdv_delivery_items item
          JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id
         WHERE delivery.order_id=order_id)<>1
     OR (SELECT count(*) FROM public.inventory_movements movement
         WHERE movement.company_id=c AND movement.inventory_id=inventory_id
           AND movement.quantity=-1)<>1
     OR NOT EXISTS(
       SELECT 1 FROM public.pdv_delivery_items item
        JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id
       WHERE delivery.order_id=order_id AND item.recognition_date=v_today
     )
  THEN RAISE EXCEPTION 'reserva/entrega/Kardex não fecharam uma vez'; END IF;
  SELECT position.custody_amount INTO custody
    FROM public.pdv_cash_custody_position(c,session_id) position;
  IF custody<>100 THEN RAISE EXCEPTION 'custódia esperada 100, obtida %',custody; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.company_id=c AND transaction.customer_id=customer_id
       AND transaction.pdv_financial_role='pdv_receivable_principal'
       AND transaction.amount=60 AND transaction.is_paid IS FALSE
  ) THEN RAISE EXCEPTION 'fiado não criou recebível canônico'; END IF;
  IF (SELECT count(*) FROM public.financial_transactions transaction
       WHERE transaction.company_id=c
         AND transaction.pdv_financial_role='pdv_receivable_settlement'
         AND transaction.paid_date=v_today)<>2
  THEN RAISE EXCEPTION 'liquidações não usaram o dia civil da empresa'; END IF;

  dre_comp := public.pdv_dre_competence_projection_v2(
    c,v_today,v_today,100,0
  );
  dre_cash := public.pdv_dre_cash_projection_v2(
    c,v_today,v_today,100,0
  );
  dfc := public.pdv_dfc_projection_v2(c,v_today,v_today,100,0);
  IF (dre_comp->>'revenue')::numeric<>200 OR (dre_comp->>'cmv')::numeric<>7
     OR (dre_cash->>'revenue')::numeric<>100 OR (dre_cash->>'cmv')::numeric<>3.50
     OR (dfc->>'cash_flow')::numeric<>100
  THEN RAISE EXCEPTION 'DRE/DFC da venda mista divergente: % / % / %',dre_comp,dre_cash,dfc; END IF;

  -- Retry equivalente ignora custo enviado pelo cliente e não duplica.
  retry_result := public.pdv_complete_direct_sale_v2(
    terminal_id,session_id,cash_account,customer_id,
    jsonb_build_object(
      'items',jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_id,'stock_id',stock_id,'quantity',1,
        'unit_cost',0,'unit_price',200,'discount_amount',0
      )),
      'order_discount_amount',0,
      'notes','Venda mista do balcão',
      'transaction_date',v_today
    ),payments,'direct-sale-mixed-0001'
  );
  IF (retry_result - 'idempotent') IS DISTINCT FROM (result - 'idempotent')
     OR (retry_result->>'idempotent')::boolean IS NOT TRUE
     OR (SELECT count(*) FROM public.pdv_orders WHERE id=order_id)<>1
     OR (SELECT count(*) FROM public.inventory_movements
          WHERE company_id=c AND inventory_id=inventory_id AND quantity=-1)<>1
  THEN RAISE EXCEPTION 'retry equivalente duplicou ou mudou resultado'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,customer_id,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_id,'stock_id',stock_id,'quantity',2
      )),payments,'direct-sale-mixed-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'mesma chave aceitou payload divergente'; END IF;

  -- Preço especial, descontos e retrodatação são capacidades independentes e
  -- fail-closed. Cada recusa volta inclusive o request idempotente.
  SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
  SELECT count(*) INTO before_requests FROM public.pdv_operation_requests
   WHERE company_id=c AND operation_type='direct_sale.complete.v2';

  UPDATE public.user_permissions
     SET permissions=permissions-'fn:override_pdv_sale_price'
   WHERE user_id=u;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_discount_a,'stock_id',stock_id,
        'quantity',1,'unit_price',120,'discount_amount',0
      )),'order_discount_amount',0,'notes',NULL,'transaction_date',v_today),
      '[]'::jsonb,'direct-sale-override-denied-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'preço especial sem capacidade foi aceito'; END IF;
  UPDATE public.user_permissions
     SET permissions=permissions||'["fn:override_pdv_sale_price"]'::jsonb
   WHERE user_id=u;

  UPDATE public.user_permissions
     SET permissions=permissions-'fn:apply_pdv_discount'
   WHERE user_id=u;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_discount_a,'stock_id',stock_id,
        'quantity',1,'discount_amount',1
      )),'order_discount_amount',0,'transaction_date',v_today),
      '[]'::jsonb,'direct-sale-discount-denied-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'desconto sem capacidade foi aceito'; END IF;
  UPDATE public.user_permissions
     SET permissions=permissions||'["fn:apply_pdv_discount"]'::jsonb
   WHERE user_id=u;

  UPDATE public.user_permissions
     SET permissions=permissions-'fn:backdate_pdv_sale'
   WHERE user_id=u;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_discount_a,'stock_id',stock_id,'quantity',1
      )),'order_discount_amount',0,'transaction_date',v_backdate),
      '[]'::jsonb,'direct-sale-backdate-denied-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'retrodatação sem capacidade foi aceita'; END IF;
  UPDATE public.user_permissions
     SET permissions=permissions||'["fn:backdate_pdv_sale"]'::jsonb
   WHERE user_id=u;

  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_discount_a,'stock_id',stock_id,'quantity',1
      )),'order_discount_amount',0,'transaction_date',v_today+1),
      '[]'::jsonb,'direct-sale-future-date-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  SELECT count(*) INTO after_orders FROM public.pdv_orders WHERE company_id=c;
  SELECT count(*) INTO after_requests FROM public.pdv_operation_requests
   WHERE company_id=c AND operation_type='direct_sale.complete.v2';
  IF NOT blocked OR after_orders<>before_orders OR after_requests<>before_requests
  THEN RAISE EXCEPTION 'gates de preço/desconto/data deixaram fatos parciais'; END IF;

  -- Objeto v2 completo: preço 120 (override), desconto de linha 10 e desconto
  -- geral 30 sobre subtotal líquido 210. Rateio centesimal: 15,71 / 14,29.
  result := public.pdv_complete_direct_sale_v2(
    terminal_id,session_id,cash_account,NULL,
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object(
          'inventory_id',inventory_discount_a,'stock_id',stock_id,
          'quantity',1,'unit_price',120,'discount_amount',10,'cost',9999
        ),
        jsonb_build_object(
          'inventory_id',inventory_discount_b,'stock_id',stock_id,
          'quantity',2,'unit_price',NULL,'discount_amount',0
        )
      ),
      'order_discount_amount',30,
      'notes','  Venda retroativa com desconto  ',
      'transaction_date',v_backdate
    ),
    jsonb_build_array(jsonb_build_object(
      'method','pix','amount',180,'account_id',bank_account
    )),
    'direct-sale-discount-backdate-0001'
  );
  discount_order_id := (result->>'order_id')::uuid;
  IF (result->>'subtotal')::numeric<>210
     OR (result->>'discount_amount')::numeric<>30
     OR (result->>'total')::numeric<>180
     OR (result->>'transaction_date')::date<>v_backdate
     OR NOT EXISTS(
       SELECT 1 FROM public.pdv_orders order_row
        WHERE order_row.id=discount_order_id AND order_row.subtotal=210
          AND order_row.discount_amount=30 AND order_row.total=180
          AND order_row.notes='Venda retroativa com desconto'
          AND order_row.transaction_date_v2=v_backdate
          AND (order_row.paid_at AT TIME ZONE 'America/Sao_Paulo')::date=v_backdate
     ) OR NOT EXISTS(
       SELECT 1 FROM public.pdv_order_items item
        WHERE item.order_id=discount_order_id
          AND item.inventory_id=inventory_discount_a
          AND item.unit_price=120 AND item.unit_cost_v2=20
          AND item.gross_total_v2=120 AND item.line_discount_amount_v2=10
          AND item.order_discount_allocated_v2=15.71
          AND item.discount_amount=25.71 AND item.total=94.29
     ) OR NOT EXISTS(
       SELECT 1 FROM public.pdv_order_items item
        WHERE item.order_id=discount_order_id
          AND item.inventory_id=inventory_discount_b
          AND item.unit_price=50 AND item.unit_cost_v2=10
          AND item.gross_total_v2=100 AND item.line_discount_amount_v2=0
          AND item.order_discount_allocated_v2=14.29
          AND item.discount_amount=14.29 AND item.total=85.71
     ) OR EXISTS(
       SELECT 1 FROM public.pdv_delivery_items item
        JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id
       WHERE delivery.order_id=discount_order_id
         AND item.recognition_date IS DISTINCT FROM v_backdate
     ) OR NOT EXISTS(
       SELECT 1 FROM public.financial_transactions transaction
        WHERE transaction.pdv_financial_role='pdv_receivable_settlement'
          AND transaction.amount=180 AND transaction.paid_date=v_backdate
     )
  THEN RAISE EXCEPTION 'snapshots/totais/data da venda v2 divergentes: %',result; END IF;

  dre_comp := public.pdv_dre_competence_projection_v2(
    c,v_backdate,v_backdate,100,0
  );
  dre_cash := public.pdv_dre_cash_projection_v2(
    c,v_backdate,v_backdate,100,0
  );
  dfc := public.pdv_dfc_projection_v2(c,v_backdate,v_backdate,100,0);
  IF (dre_comp->>'revenue')::numeric<>180 OR (dre_comp->>'cmv')::numeric<>40
     OR (dre_cash->>'revenue')::numeric<>180 OR (dre_cash->>'cmv')::numeric<>40
     OR (dfc->>'cash_flow')::numeric<>180
  THEN RAISE EXCEPTION 'competência retroativa DRE/DFC divergente: % / % / %',dre_comp,dre_cash,dfc; END IF;

  -- Saldo do extrato inclui ajustes legados: 30-10+fiado60 = limite 80.
  SELECT round(sum(statement.amount),2) INTO credit_balance
    FROM public.pdv_customer_credit_statement_v2(customer_id) statement;
  IF credit_balance<>80 THEN RAISE EXCEPTION 'saldo canônico esperado 80, obtido %',credit_balance; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,customer_id,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_credit,'stock_id',stock_id,'quantity',1
      )),jsonb_build_array(jsonb_build_object(
        'method','fiado','amount',1,
        'due_date',(v_today + interval '1 month')::date
      )),'direct-sale-credit-limit-0001'
    );
  EXCEPTION WHEN check_violation THEN blocked:=true;
  END;
  IF NOT blocked OR EXISTS(
    SELECT 1 FROM public.pdv_operation_requests request
     WHERE request.company_id=c
       AND request.operation_type='direct_sale.complete.v2'
       AND request.idempotency_key='direct-sale-credit-limit-0001'
  ) THEN RAISE EXCEPTION 'ajustes legados foram ignorados no limite ou deixaram request'; END IF;

  -- Cobertura exclusivamente liquidada preenche paid_at.
  result := public.pdv_complete_direct_sale_v2(
    terminal_id,session_id,cash_account,NULL,
    jsonb_build_array(jsonb_build_object(
      'inventory_id',inventory_credit,'stock_id',stock_id,'quantity',1
    )),jsonb_build_array(jsonb_build_object(
      'method','pix','amount',1,'account_id',bank_account
    )),'direct-sale-immediate-0001'
  );
  immediate_order_id := (result->>'order_id')::uuid;
  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_orders order_row
     WHERE order_row.id=immediate_order_id AND order_row.status='entregue'
       AND order_row.paid_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'cobertura imediata não marcou paid_at'; END IF;

  -- Última unidade: a segunda venda perde a disputa e deixa zero fatos parciais.
  SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
  SELECT count(*) INTO before_requests FROM public.pdv_operation_requests
   WHERE company_id=c AND operation_type='direct_sale.complete.v2';
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,customer_id,cart,payments,
      'direct-sale-last-unit-0002'
    );
  EXCEPTION WHEN check_violation THEN blocked:=true;
  END;
  SELECT count(*) INTO after_orders FROM public.pdv_orders WHERE company_id=c;
  SELECT count(*) INTO after_requests FROM public.pdv_operation_requests
   WHERE company_id=c AND operation_type='direct_sale.complete.v2';
  IF NOT blocked OR after_orders<>before_orders OR after_requests<>before_requests
  THEN RAISE EXCEPTION 'falha de estoque deixou pedido/request parcial'; END IF;

  -- Preço zero com custo conhecido: sem pagamento, entrega e CMV uma vez.
  result := public.pdv_complete_direct_sale_v2(
    terminal_id,session_id,cash_account,NULL,
    jsonb_build_object(
      'items',jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_zero,'stock_id',stock_id,'quantity',1,
        'unit_price',0,'discount_amount',0
      )),
      'order_discount_amount',0,'notes',NULL,'transaction_date',v_today
    ),'[]'::jsonb,'direct-sale-zero-price-0001'
  );
  zero_order_id := (result->>'order_id')::uuid;
  IF (result->>'total')::numeric<>0
     OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=zero_order_id)
     OR NOT EXISTS(
       SELECT 1 FROM public.pdv_order_items
        WHERE order_id=zero_order_id AND unit_cost_v2=5 AND total=0
     )
  THEN RAISE EXCEPTION 'venda bonificada/custo ausente no cliente divergente'; END IF;
  dre_comp := public.pdv_dre_competence_projection_v2(
    c,v_today,v_today,100,0
  );
  dre_cash := public.pdv_dre_cash_projection_v2(
    c,v_today,v_today,100,0
  );
  dfc := public.pdv_dfc_projection_v2(c,v_today,v_today,100,0);
  IF (dre_comp->>'revenue')::numeric<>201 OR (dre_comp->>'cmv')::numeric<>12
     OR (dre_cash->>'revenue')::numeric<>101 OR (dre_cash->>'cmv')::numeric<>8.50
     OR (dfc->>'cash_flow')::numeric<>101
  THEN RAISE EXCEPTION 'preço zero duplicou ou omitiu CMV/DFC'; END IF;

  -- Outro tenant não atravessa o terminal/local da empresa autenticada.
  SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_other,'stock_id',stock_other,'quantity',1
      )),jsonb_build_array(jsonb_build_object('method','pix','amount',10,'account_id',bank_account)),
      'direct-sale-cross-tenant-0001'
    );
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN blocked:=true;
  END;
  IF NOT blocked OR (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>before_orders
  THEN RAISE EXCEPTION 'ID de outro tenant criou fato parcial'; END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',u_denied,'role','authenticated')::text,true
  );
  blocked:=false;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_v2(
      terminal_id,session_id,cash_account,NULL,
      jsonb_build_array(jsonb_build_object(
        'inventory_id',inventory_zero,'stock_id',stock_id,'quantity',1
      )),'[]'::jsonb,'direct-sale-denied-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'screen:pdv sem capacidade concluiu venda direta'; END IF;
  IF EXISTS(SELECT 1 FROM public.nfce_documents document WHERE document.company_id=c)
     OR EXISTS(SELECT 1 FROM public.nfce_outbox outbox WHERE outbox.company_id=c)
     OR EXISTS(SELECT 1 FROM public.nfce_events event WHERE event.company_id=c)
  THEN RAISE EXCEPTION 'venda direta não fiscal acionou pipeline NFC-e legado'; END IF;
END
$behavior$;

ROLLBACK;
