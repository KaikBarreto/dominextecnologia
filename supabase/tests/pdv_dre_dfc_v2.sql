-- Contrato/smoke W1C-01. Executar apos supabase db reset.
BEGIN;

DO $contract$
DECLARE v_function text; v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class table_row
    JOIN pg_namespace namespace ON namespace.oid=table_row.relnamespace
     WHERE namespace.nspname='public'
       AND table_row.relname='pdv_settlement_applications'
       AND table_row.relrowsecurity AND table_row.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'aplicações sem RLS FORCE'; END IF;
  IF has_table_privilege('authenticated','public.pdv_settlement_applications','SELECT')
     OR has_table_privilege('service_role','public.pdv_settlement_applications','INSERT')
  THEN RAISE EXCEPTION 'livro de aplicações exposto diretamente'; END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_apply_settlement_fifo_v2(uuid,uuid)',
    'public.pdv_reverse_settlement_application_v2(uuid,uuid,uuid)',
    'public.pdv_financial_projection_rows_v2(uuid)',
    'public.pdv_financial_projection_page_v2(uuid,text,date,date,integer,integer)'
  ] LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
       OR has_function_privilege('authenticated',v_function,'EXECUTE')
       OR has_function_privilege('service_role',v_function,'EXECUTE')
    THEN RAISE EXCEPTION 'helper owner-only exposto: %',v_function; END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_dre_competence_projection_v2(uuid,date,date,integer,integer)',
    'public.pdv_dre_cash_projection_v2(uuid,date,date,integer,integer)',
    'public.pdv_dfc_projection_v2(uuid,date,date,integer,integer)'
  ] LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
       OR has_function_privilege('authenticated',v_function,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_function,'EXECUTE')
    THEN RAISE EXCEPTION 'ACL da projeção fechada incorreta: %',v_function; END IF;
  END LOOP;

  SELECT pg_get_functiondef('public.pdv_apply_settlement_fifo_v2(uuid,uuid)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition,'FOR UPDATE')=0
     OR strpos(v_definition,'ORDER BY delivered.recognition_date')=0
     OR strpos(v_definition,'eligible_cmv')=0
  THEN RAISE EXCEPTION 'FIFO não prova lock/ordem/CMV proporcional'; END IF;
  SELECT pg_get_functiondef('public.pdv_financial_projection_rows_v2(uuid)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition,'pdv_receivable_principal')>0
     OR strpos(v_definition,'pdv_custody_transfer')>0
  THEN RAISE EXCEPTION 'projeção incluiu papel principal/custódia'; END IF;
END
$contract$;

DO $fixture$
DECLARE
  c uuid := 'c1000000-0000-4000-8000-000000000001';
  c2 uuid := 'c1000000-0000-4000-8000-000000000002';
  cash_account uuid := 'c1000000-0000-4000-8000-000000000011';
  bank_account uuid := 'c1000000-0000-4000-8000-000000000012';
  stock_id uuid := 'c1000000-0000-4000-8000-000000000013';
  inv_a uuid := 'c1000000-0000-4000-8000-000000000014';
  inv_b uuid := 'c1000000-0000-4000-8000-000000000015';
  inv_u uuid := 'c1000000-0000-4000-8000-000000000016';
  inv_free uuid := 'c1000000-0000-4000-8000-00000000001a';
  res_a uuid := 'c1000000-0000-4000-8000-000000000017';
  res_b uuid := 'c1000000-0000-4000-8000-000000000018';
  res_u uuid := 'c1000000-0000-4000-8000-000000000019';
  res_free uuid := 'c1000000-0000-4000-8000-00000000001b';
  order_id uuid := 'c1000000-0000-4000-8000-000000000021';
  order_auth uuid := 'c1000000-0000-4000-8000-000000000022';
  item_a uuid := 'c1000000-0000-4000-8000-000000000031';
  item_b uuid := 'c1000000-0000-4000-8000-000000000032';
  item_s uuid := 'c1000000-0000-4000-8000-000000000033';
  item_free uuid := 'c1000000-0000-4000-8000-000000000034';
  d1 uuid := 'c1000000-0000-4000-8000-000000000041';
  d2 uuid := 'c1000000-0000-4000-8000-000000000042';
  di_a1 uuid := 'c1000000-0000-4000-8000-000000000051';
  di_b1 uuid := 'c1000000-0000-4000-8000-000000000052';
  di_s1 uuid := 'c1000000-0000-4000-8000-000000000053';
  di_a2 uuid := 'c1000000-0000-4000-8000-000000000054';
  di_b2 uuid := 'c1000000-0000-4000-8000-000000000055';
  di_free uuid := 'c1000000-0000-4000-8000-000000000056';
  tx_cash uuid := 'c1000000-0000-4000-8000-000000000061';
  tx_card uuid := 'c1000000-0000-4000-8000-000000000062';
  tx_pix uuid := 'c1000000-0000-4000-8000-000000000063';
  tx_fee uuid := 'c1000000-0000-4000-8000-000000000064';
  tx_short uuid := 'c1000000-0000-4000-8000-000000000065';
  tx_refund uuid := 'c1000000-0000-4000-8000-000000000066';
  tx_supplier uuid := 'c1000000-0000-4000-8000-000000000067';
  tx_principal uuid := 'c1000000-0000-4000-8000-000000000068';
  group_cash uuid := 'c1000000-0000-4000-8000-000000000071';
  group_card uuid := 'c1000000-0000-4000-8000-000000000072';
  group_pix uuid := 'c1000000-0000-4000-8000-000000000073';
  result jsonb;
  dre_comp jsonb;
  dre_cash jsonb;
  dfc jsonb;
  original_app uuid;
  reversal_id uuid;
  blocked boolean;
  n integer;
  unknown_order uuid := 'c1000000-0000-4000-8000-000000000081';
  unknown_item uuid := 'c1000000-0000-4000-8000-000000000082';
  unknown_delivery uuid := 'c1000000-0000-4000-8000-000000000083';
  unknown_di uuid := 'c1000000-0000-4000-8000-000000000084';
  unknown_tx uuid := 'c1000000-0000-4000-8000-000000000085';
  unknown_tx2 uuid := 'c1000000-0000-4000-8000-000000000086';
  unknown_reversal_tx uuid := 'c1000000-0000-4000-8000-000000000087';
  unknown_receivable uuid := 'c1000000-0000-4000-8000-000000000089';
  unknown_customer uuid := 'c1000000-0000-4000-8000-00000000008a';
  unknown_request_settle uuid := 'c1000000-0000-4000-8000-00000000008b';
  unknown_request_reverse uuid := 'c1000000-0000-4000-8000-00000000008c';
  unknown_request_repay uuid := 'c1000000-0000-4000-8000-00000000008d';
  unknown_allocation uuid := 'c1000000-0000-4000-8000-00000000008e';
  unknown_app uuid;
  legacy_parent uuid := 'c2000000-0000-4000-8000-000000000001';
  legacy_child1 uuid := 'c2000000-0000-4000-8000-000000000002';
  legacy_child2 uuid := 'c2000000-0000-4000-8000-000000000003';
  legacy_external uuid := 'c2000000-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO public.companies(id,name,subscription_status)
  VALUES(c,'Fixture W1C','active'),(c2,'Fixture W1C B','active');
  INSERT INTO public.company_settings(company_id,name,timezone)
  VALUES(c,'Fixture W1C','America/Sao_Paulo');
  INSERT INTO public.customers(id,company_id,name)
  VALUES(unknown_customer,c,'Cliente custo desconhecido');
  INSERT INTO public.financial_transactions(
    id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,origin,parent_transaction_id
  ) VALUES
    (legacy_parent,c2,'entrada','Mãe PDV legada',100,'Venda','2026-11-01',NULL,false,'pdv',NULL),
    (legacy_child1,c2,'entrada','Baixa PDV legada 30',30,'Recebimento parcial','2026-11-02','2026-11-02',true,'pdv',legacy_parent),
    (legacy_child2,c2,'entrada','Baixa PDV legada 70',70,'Recebimento parcial','2026-11-03','2026-11-03',true,'pdv',legacy_parent),
    (legacy_external,c2,'entrada','Receita externa ao PDV',999,'Venda','2026-11-01','2026-11-01',true,'finance',NULL);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(cash_account,c,'Cofre','caixa',1000,true),
        (bank_account,c,'Banco','banco',500,true);
  INSERT INTO public.stocks(id,company_id,name,is_default)
  VALUES(stock_id,c,'Principal',true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price)
  VALUES(inv_a,c,'W1C-A','Material A','un',0,30),
        (inv_b,c,'W1C-B','Material B','un',0,40),
        (inv_u,c,'W1C-U','Custo desconhecido','un',0,NULL),
        (inv_free,c,'W1C-Z','Material bonificado','un',0,5);

  INSERT INTO public.pdv_orders(id,company_id,number,status,subtotal,discount_amount,total)
  VALUES(order_id,c,1,'pago',450,10,440),
        (order_auth,c,2,'pago',10,0,10),
        (unknown_order,c,3,'pago',10,0,10);
  INSERT INTO public.pdv_order_items(
    id,company_id,order_id,description,quantity,unit_price,unit_cost,
    discount_amount,total,sort_order,item_type,unit_cost_v2,contract_version,
    gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2
  ) VALUES
    (item_a,c,order_id,'Material A',4,50,30,4.45,195.55,1,'material',30,2,200,0,4.45),
    (item_b,c,order_id,'Material B',2,75,40,3.33,146.67,2,'material',40,2,150,0,3.33),
    (item_s,c,order_id,'Serviço',1,100,0,2.22,97.78,3,'service',0,2,100,0,2.22),
    (item_free,c,order_id,'Material bonificado',1,0,5,0,0,4,'material',5,2,0,0,0),
    (unknown_item,c,unknown_order,'Custo desconhecido',1,10,0,0,10,1,'material',NULL,2,10,0,0);
  UPDATE public.pdv_order_items SET inventory_id=inv_a WHERE id=item_a;
  UPDATE public.pdv_order_items SET inventory_id=inv_b WHERE id=item_b;
  UPDATE public.pdv_order_items SET inventory_id=inv_u WHERE id=unknown_item;
  UPDATE public.pdv_order_items SET inventory_id=inv_free WHERE id=item_free;

  INSERT INTO public.pdv_stock_reservation_items(
    id,company_id,inventory_id,stock_id,order_item_id,state,
    reserved_quantity,consumed_quantity,cost_price_snapshot
  ) VALUES
    (res_a,c,inv_a,stock_id,item_a,'consumed',4,4,30),
    (res_b,c,inv_b,stock_id,item_b,'consumed',2,2,40),
    (res_u,c,inv_u,stock_id,unknown_item,'consumed',1,1,NULL),
    (res_free,c,inv_free,stock_id,item_free,'consumed',1,1,5);
  INSERT INTO public.inventory_movements(
    id,company_id,inventory_id,stock_id,movement_type,quantity,notes
  ) VALUES
    ('c1000000-0000-4000-8000-0000000000a1',c,inv_a,stock_id,'saida',-2,'Entrega 1 A'),
    ('c1000000-0000-4000-8000-0000000000a2',c,inv_b,stock_id,'saida',-1,'Entrega 1 B'),
    ('c1000000-0000-4000-8000-0000000000a3',c,inv_a,stock_id,'saida',-2,'Entrega 2 A'),
    ('c1000000-0000-4000-8000-0000000000a4',c,inv_b,stock_id,'saida',-1,'Entrega 2 B'),
    ('c1000000-0000-4000-8000-0000000000a5',c,inv_u,stock_id,'saida',-1,'Entrega desconhecida'),
    ('c1000000-0000-4000-8000-0000000000a6',c,inv_free,stock_id,'saida',-1,'Entrega bonificada');

  INSERT INTO public.financial_transactions(
    id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,origin,
    pdv_financial_role,pdv_settlement_group_id
  ) VALUES
    (tx_cash,c,'entrada','Dinheiro confirmado',100,'Recebimento parcial','2026-11-03','2026-11-03',true,cash_account,'pdv','pdv_receivable_settlement',group_cash),
    (tx_card,c,'entrada','Cartão liquidado',40,'Recebimento parcial','2026-11-05','2026-11-05',true,bank_account,'pdv','pdv_receivable_settlement',group_card),
    (tx_pix,c,'entrada','Pix fiado',120,'Recebimento parcial','2026-11-07','2026-11-07',true,bank_account,'pdv','pdv_receivable_settlement',group_pix),
    (tx_fee,c,'saida','Tarifa cartão',1.20,'Tarifas e Taxas','2026-11-05','2026-11-05',true,bank_account,'pdv','pdv_card_fee',group_card),
    (tx_short,c,'saida','Falta de caixa',2,'Quebra de Caixa','2026-11-04','2026-11-04',true,cash_account,'pdv','pdv_cash_shortage',group_cash),
    (tx_refund,c,'saida','Reembolso Pix confirmado',18.89,'Reembolso','2026-11-09','2026-11-09',true,bank_account,'pdv','pdv_refund',group_cash),
    (tx_supplier,c,'saida','Pagamento fornecedor',300,'Fornecedor','2026-11-10','2026-11-10',true,bank_account,'pdv','pdv_supplier_payment','c1000000-0000-4000-8000-000000000074'),
    (tx_principal,c,'entrada','Principal fiado',300,'Venda no fiado','2026-11-03',NULL,false,NULL,'pdv','pdv_receivable_principal',group_pix);

  INSERT INTO public.financial_transactions(
    id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,
    pdv_financial_role,pdv_settlement_group_id
  ) VALUES
    (unknown_receivable,c,'entrada','Parcela custo desconhecido',10,'Venda no fiado','2026-10-20',NULL,false,NULL,unknown_customer,'pdv','pdv_receivable_principal','c1000000-0000-4000-8000-000000000075'),
    (unknown_tx,c,'entrada','Liquidação custo desconhecido',10,'Recebimento parcial','2026-10-20','2026-10-20',true,bank_account,unknown_customer,'pdv','pdv_receivable_settlement','c1000000-0000-4000-8000-000000000075'),
    (unknown_reversal_tx,c,'saida','Estorno pagamento desconhecido',10,'Recebimento parcial','2026-10-21','2026-10-21',true,bank_account,unknown_customer,'pdv','pdv_receivable_reversal','c1000000-0000-4000-8000-000000000075'),
    (unknown_tx2,c,'entrada','Repagamento custo desconhecido',10,'Recebimento parcial','2026-10-22','2026-10-22',true,bank_account,unknown_customer,'pdv','pdv_receivable_settlement','c1000000-0000-4000-8000-000000000076');

  INSERT INTO public.pdv_order_payments(
    company_id,order_id,method,amount,contract_version,coverage_kind,
    coverage_status,settlement_status,receivable_transaction_id,settlement_transaction_id
  ) VALUES
    (c,order_id,'dinheiro',100,2,'cash','authorized','settled',NULL,tx_cash),
    (c,order_id,'credito',40,2,'card_authorization','authorized','settled',NULL,tx_card),
    (c,order_id,'fiado',300,2,'receivable','authorized','settled',tx_principal,tx_pix),
    (c,order_auth,'credito',10,2,'card_authorization','authorized','open',NULL,NULL),
    (c,unknown_order,'fiado',10,2,'receivable','authorized','settled',unknown_receivable,NULL);

  INSERT INTO public.pdv_operation_requests(
    id,company_id,operation_type,idempotency_key,payload_hash
  ) VALUES
    (unknown_request_settle,c,'receivable.settle.v2','w1c-unknown-settle-0001',repeat('a',64)),
    (unknown_request_reverse,c,'receivable.reverse.v2','w1c-unknown-reverse-0001',repeat('b',64)),
    (unknown_request_repay,c,'receivable.settle.v2','w1c-unknown-repay-0001',repeat('c',64));
  INSERT INTO public.pdv_receivable_settlement_allocations(
    id,company_id,customer_id,settlement_transaction_id,
    receivable_transaction_id,operation_request_id,allocation_kind,
    amount,settlement_method,reversal_of_id
  ) VALUES
    (unknown_allocation,c,unknown_customer,unknown_tx,unknown_receivable,
     unknown_request_settle,'settlement',10,'pix',NULL),
    ('c1000000-0000-4000-8000-00000000008f',c,unknown_customer,
     unknown_reversal_tx,unknown_receivable,unknown_request_reverse,
     'reversal',-10,'pix',unknown_allocation),
    ('c1000000-0000-4000-8000-000000000090',c,unknown_customer,
     unknown_tx2,unknown_receivable,unknown_request_repay,
     'settlement',10,'pix',NULL);

  -- Recebimento antecipado: sem entrega, não há aplicação.
  result := public.pdv_apply_settlement_fifo_v2(c,tx_cash);
  IF (result->>'applied_now')::numeric<>0 OR (result->>'remaining')::numeric<>100 THEN
    RAISE EXCEPTION 'adiantamento foi reconhecido antes da entrega: %',result;
  END IF;

  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_at)
  VALUES(d1,c,order_id,'c1000000-0000-4000-8000-000000000091',repeat('a',64),'2026-11-04 12:00:00+00'),
        (d2,c,order_id,'c1000000-0000-4000-8000-000000000092',repeat('b',64),'2026-11-06 12:00:00+00'),
        (unknown_delivery,c,unknown_order,'c1000000-0000-4000-8000-000000000093',repeat('c',64),'2026-10-20 12:00:00+00');
  INSERT INTO public.pdv_delivery_items(
    id,company_id,delivery_id,order_item_id,reservation_id,inventory_movement_id,
    quantity,item_type,unit_cost_snapshot
  ) VALUES
    (di_a1,c,d1,item_a,res_a,'c1000000-0000-4000-8000-0000000000a1',2,'material',30),
    (di_b1,c,d1,item_b,res_b,'c1000000-0000-4000-8000-0000000000a2',1,'material',40),
    (di_s1,c,d1,item_s,NULL,NULL,1,'service',0),
    (di_a2,c,d2,item_a,res_a,'c1000000-0000-4000-8000-0000000000a3',2,'material',30),
    (di_b2,c,d2,item_b,res_b,'c1000000-0000-4000-8000-0000000000a4',1,'material',40),
    (di_free,c,d2,item_free,res_free,'c1000000-0000-4000-8000-0000000000a6',1,'material',5),
    (unknown_di,c,unknown_delivery,unknown_item,res_u,'c1000000-0000-4000-8000-0000000000a5',1,'material',NULL);

  result := public.pdv_apply_settlement_fifo_v2(c,tx_cash);
  IF (result->>'applied_now')::numeric<>100 OR (result->>'remaining')::numeric<>0 THEN
    RAISE EXCEPTION 'FIFO dinheiro não aplicou 100: %',result;
  END IF;
  result := public.pdv_apply_settlement_fifo_v2(c,tx_card);
  result := public.pdv_apply_settlement_fifo_v2(c,tx_pix);
  PERFORM public.pdv_apply_settlement_fifo_v2(c,unknown_tx);

  SELECT id INTO unknown_app FROM public.pdv_settlement_applications
   WHERE settlement_transaction_id=unknown_tx AND application_kind='settlement';
  result := public.pdv_dre_competence_projection_v2(c,'2026-10-20','2026-10-20',100,0);
  IF (result->>'revenue')::numeric<>10 OR result->>'cmv' IS NOT NULL THEN
    RAISE EXCEPTION 'competência custo desconhecido deveria ser receita 10/CMV NULL: %',result;
  END IF;
  result := public.pdv_dre_cash_projection_v2(c,'2026-10-20','2026-10-20',100,0);
  IF (result->>'revenue')::numeric<>10 THEN RAISE EXCEPTION 'caixa inicial desconhecido divergente'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_reverse_settlement_application_v2(
      c,unknown_app,'c1000000-0000-4000-8000-000000000088'
    );
  EXCEPTION WHEN check_violation THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'UUID sem reversão financeira canônica foi aceito'; END IF;
  reversal_id := public.pdv_reverse_settlement_application_v2(
    c,unknown_app,unknown_reversal_tx
  );
  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_settlement_applications
     WHERE id=reversal_id AND application_kind='payment_reversal'
       AND reversal_reference_id=unknown_reversal_tx
       AND effective_date='2026-10-21'
  ) THEN RAISE EXCEPTION 'data/vínculo do estorno financeiro não foram derivados'; END IF;
  result := public.pdv_dre_competence_projection_v2(c,'2026-10-20','2026-10-21',100,0);
  IF (result->>'revenue')::numeric<>10 THEN RAISE EXCEPTION 'estorno de pagamento desfez competência'; END IF;
  result := public.pdv_dre_cash_projection_v2(c,'2026-10-20','2026-10-21',100,0);
  IF (result->>'revenue')::numeric<>0 THEN RAISE EXCEPTION 'estorno de pagamento não zerou caixa'; END IF;
  result := public.pdv_dfc_projection_v2(c,'2026-10-21','2026-10-21',100,0);
  IF (result->>'cash_flow')::numeric<>-10 THEN
    RAISE EXCEPTION 'DRE caixa e DFC não reconheceram o estorno no mesmo dia';
  END IF;
  PERFORM public.pdv_apply_settlement_fifo_v2(c,unknown_tx2);
  result := public.pdv_dre_cash_projection_v2(c,'2026-10-20','2026-10-22',100,0);
  IF (result->>'revenue')::numeric<>10
     OR NOT EXISTS(SELECT 1 FROM public.pdv_settlement_applications
       WHERE settlement_transaction_id=unknown_tx2 AND commercial_amount=10)
  THEN RAISE EXCEPTION 'repagamento não reabriu/reaplicou a fatia'; END IF;

  IF (SELECT round(sum(cmv_amount),2) FROM public.pdv_settlement_applications
       WHERE settlement_transaction_id=tx_cash AND application_kind='settlement')<>61.21
     OR (SELECT round(sum(cmv_amount),2) FROM public.pdv_settlement_applications
       WHERE settlement_transaction_id=tx_card AND application_kind='settlement')<>21.82
     OR (SELECT round(sum(cmv_amount),2) FROM public.pdv_settlement_applications
       WHERE settlement_transaction_id=tx_pix AND application_kind='settlement')<>16.97
  THEN RAISE EXCEPTION 'CMV aplicado não fechou 61,21/21,82/16,97'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_settlement_applications
     WHERE settlement_transaction_id=unknown_tx
       AND commercial_amount=10 AND cmv_amount IS NULL
  ) THEN RAISE EXCEPTION 'custo NULL virou zero ou aplicação sumiu'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_settlement_applications
     WHERE settlement_transaction_id=tx_pix AND cmv_amount=0
       AND delivery_item_id=di_s1
  ) THEN RAISE EXCEPTION 'serviço com custo zero conhecido virou NULL'; END IF;
  PERFORM public.pdv_apply_settlement_fifo_v2(c,tx_pix);
  IF (SELECT count(*) FROM public.pdv_financial_projection_rows_v2(c) row
       WHERE row.projection_kind='dre_cash'
         AND row.source_type='zero_value_delivery_cmv_v2'
         AND row.event_id=di_free)<>1
     OR EXISTS(
       SELECT 1 FROM public.pdv_settlement_applications
        WHERE delivery_item_id=di_free
     )
  THEN RAISE EXCEPTION 'CMV do material bonificado duplicou ou entrou no FIFO'; END IF;

  SELECT id INTO original_app FROM public.pdv_settlement_applications
   WHERE settlement_transaction_id=tx_cash AND delivery_item_id=di_a1
     AND delivery_slice_sequence=1 AND application_kind='settlement';

  dre_comp := public.pdv_dre_competence_projection_v2(c,'2026-11-01','2026-11-10',500,0);
  dre_cash := public.pdv_dre_cash_projection_v2(c,'2026-11-01','2026-11-10',500,0);
  dfc := public.pdv_dfc_projection_v2(c,'2026-11-01','2026-11-10',500,0);
  IF (dre_comp->>'revenue')::numeric<>440 OR (dre_comp->>'cmv')::numeric<>205
     OR (dre_comp->>'expense')::numeric<>3.20 OR (dre_comp->>'result')::numeric<>231.80
  THEN RAISE EXCEPTION 'DRE competência divergente: %',dre_comp; END IF;
  IF (dre_cash->>'revenue')::numeric<>260 OR (dre_cash->>'cmv')::numeric<>105
     OR (dre_cash->>'expense')::numeric<>3.20 OR (dre_cash->>'result')::numeric<>151.80
  THEN RAISE EXCEPTION 'DRE caixa divergente: %',dre_cash; END IF;
  IF (dfc->>'cash_flow')::numeric<>-62.09
     OR dfc->>'scope'<>'pdv_partial'
     OR dfc->'opening_availability' IS DISTINCT FROM 'null'::jsonb
     OR dfc->'closing_availability' IS DISTINCT FROM 'null'::jsonb
  THEN RAISE EXCEPTION 'DFC/disponibilidade divergente: %',dfc; END IF;

  -- Período inclusivo, retroativo e paginação explícita.
  result := public.pdv_dre_cash_projection_v2(c,'2026-11-05','2026-11-07',2,0);
  IF (result->>'revenue')::numeric<>160 OR (result->>'cmv')::numeric<>43.79
     OR (result->>'expense')::numeric<>1.20
     OR jsonb_array_length(result->'entries')<>2
     OR (result->>'has_more')::boolean IS NOT TRUE
  THEN RAISE EXCEPTION 'período/paginação caixa divergente: %',result; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_settlement_applications
     WHERE settlement_transaction_id=tx_cash AND effective_date='2026-11-04'
  ) THEN RAISE EXCEPTION 'liquidação retroativa não esperou entrega'; END IF;

  blocked:=false;
  BEGIN
    PERFORM public.pdv_dfc_projection_v2(c,'2026-11-01','2026-11-10',501,0);
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'paginação aceitou limite silencioso >500'; END IF;
  result := public.pdv_dre_competence_projection_v2(c2,'2026-11-01','2026-11-10',100,0);
  IF (result->>'revenue')::numeric<>100 THEN RAISE EXCEPTION 'legado competência contou mãe+filhas: %',result; END IF;
  result := public.pdv_dre_cash_projection_v2(c2,'2026-11-01','2026-11-10',100,0);
  IF (result->>'revenue')::numeric<>100 THEN RAISE EXCEPTION 'legado caixa contou mãe+filhas: %',result; END IF;
  result := public.pdv_dfc_projection_v2(c2,'2026-11-01','2026-11-10',100,0);
  IF (result->>'cash_flow')::numeric<>100 THEN RAISE EXCEPTION 'legado DFC contou mãe+filhas: %',result; END IF;
  IF EXISTS(
    SELECT 1 FROM public.pdv_financial_projection_rows_v2(c2) row
     WHERE row.event_id=legacy_external
  ) THEN RAISE EXCEPTION 'projeção parcial PDV absorveu fato geral do Financeiro/RH'; END IF;

  blocked:=false;
  BEGIN
    UPDATE public.pdv_settlement_applications SET commercial_amount=1 WHERE id=original_app;
  EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'aplicação deixou de ser append-only'; END IF;

  PERFORM set_config('app.pdv_purge_company',c::text,true);
  DELETE FROM public.pdv_orders WHERE company_id=c;
  DELETE FROM public.pdv_settlement_applications WHERE company_id=c;
  PERFORM set_config('app.pdv_purge_company','',true);
  SELECT count(*) INTO n FROM public.pdv_settlement_applications WHERE company_id=c;
  IF n<>0 THEN RAISE EXCEPTION 'lifecycle deixou aplicações órfãs'; END IF;
END
$fixture$;

-- Regressão N:N: uma liquidação única não pode consumir no pedido A a fatia
-- comercial que foi explicitamente coberta para o pedido B.
DO $multi_order$
DECLARE
  c uuid := 'd3000000-0000-4000-8000-000000000001';
  account_id uuid := 'd3000000-0000-4000-8000-000000000002';
  order_a uuid := 'd3000000-0000-4000-8000-000000000003';
  order_b uuid := 'd3000000-0000-4000-8000-000000000004';
  item_a uuid := 'd3000000-0000-4000-8000-000000000005';
  item_b uuid := 'd3000000-0000-4000-8000-000000000006';
  delivery_a uuid := 'd3000000-0000-4000-8000-000000000007';
  delivery_b uuid := 'd3000000-0000-4000-8000-000000000008';
  settlement_id uuid := 'd3000000-0000-4000-8000-000000000009';
  result jsonb;
BEGIN
  INSERT INTO public.companies(id,name,subscription_status)
  VALUES(c,'Fixture W1C N:N','active');
  INSERT INTO public.company_settings(company_id,name,timezone)
  VALUES(c,'Fixture W1C N:N','America/Sao_Paulo');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(account_id,c,'Banco N:N','banco',0,true);
  INSERT INTO public.pdv_orders(id,company_id,number,status,subtotal,discount_amount,total)
  VALUES(order_a,c,1,'pago',200,0,200),(order_b,c,2,'pago',200,0,200);
  INSERT INTO public.pdv_order_items(
    id,company_id,order_id,description,quantity,unit_price,unit_cost,
    discount_amount,total,sort_order,item_type,unit_cost_v2,contract_version,
    gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2
  ) VALUES
    (item_a,c,order_a,'Serviço A',1,200,0,0,200,1,'service',0,2,200,0,0),
    (item_b,c,order_b,'Serviço B',1,200,0,0,200,1,'service',0,2,200,0,0);
  INSERT INTO public.financial_transactions(
    id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,origin,
    pdv_financial_role,pdv_settlement_group_id
  ) VALUES(
    settlement_id,c,'entrada','Liquidação N:N',120,'Recebimento parcial',
    '2026-10-03','2026-10-03',true,account_id,'pdv',
    'pdv_receivable_settlement','d3000000-0000-4000-8000-00000000000a'
  );
  INSERT INTO public.pdv_order_payments(
    company_id,order_id,method,amount,contract_version,coverage_kind,
    coverage_status,settlement_status,settlement_transaction_id
  ) VALUES
    (c,order_a,'pix',100,2,'pix','authorized','settled',settlement_id),
    (c,order_b,'pix',20,2,'pix','authorized','settled',settlement_id);
  INSERT INTO public.pdv_deliveries(
    id,company_id,order_id,client_request_id,payload_hash,created_at
  ) VALUES
    (delivery_a,c,order_a,'d3000000-0000-4000-8000-00000000000b',repeat('d',64),'2026-10-01 12:00:00+00'),
    (delivery_b,c,order_b,'d3000000-0000-4000-8000-00000000000c',repeat('e',64),'2026-10-02 12:00:00+00');
  INSERT INTO public.pdv_delivery_items(
    company_id,delivery_id,order_item_id,quantity,item_type,unit_cost_snapshot
  ) VALUES(c,delivery_a,item_a,1,'service',0),(c,delivery_b,item_b,1,'service',0);

  result := public.pdv_apply_settlement_fifo_v2(c,settlement_id);
  IF (result->>'applied_now')::numeric<>120
     OR (SELECT round(sum(commercial_amount),2)
           FROM public.pdv_settlement_applications
          WHERE settlement_transaction_id=settlement_id AND order_id=order_a)<>100
     OR (SELECT round(sum(commercial_amount),2)
           FROM public.pdv_settlement_applications
          WHERE settlement_transaction_id=settlement_id AND order_id=order_b)<>20
  THEN RAISE EXCEPTION 'FIFO N:N ignorou tetos A=100/B=20: %',result; END IF;
END
$multi_order$;

ROLLBACK;
