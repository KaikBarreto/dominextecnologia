-- Regressão da fonte canônica. Somente dados fictícios; nenhuma mudança persiste.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $fixture$
DECLARE
  ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
  account_a uuid:=gen_random_uuid(); account_b uuid:=gen_random_uuid();
  stock_a uuid; material uuid:=gen_random_uuid(); bonus uuid:=gen_random_uuid();
  sale_a uuid:=gen_random_uuid(); sale_b uuid:=gen_random_uuid();
  item_a uuid:=gen_random_uuid(); item_bonus uuid:=gen_random_uuid(); item_b uuid:=gen_random_uuid();
  reservation_a uuid:=gen_random_uuid(); reservation_bonus uuid:=gen_random_uuid();
  movement_a uuid:=gen_random_uuid(); movement_bonus uuid:=gen_random_uuid();
  movement_return uuid:=gen_random_uuid(); movement_reverse uuid:=gen_random_uuid();
  delivery_a uuid:=gen_random_uuid(); delivery_b uuid:=gen_random_uuid();
  delivered_a uuid:=gen_random_uuid(); delivered_bonus uuid:=gen_random_uuid(); delivered_b uuid:=gen_random_uuid();
  tx_a uuid:=gen_random_uuid(); tx_b uuid:=gen_random_uuid();
  request_return uuid:=gen_random_uuid(); request_reverse uuid:=gen_random_uuid();
  return_id uuid:=gen_random_uuid(); reverse_id uuid:=gen_random_uuid();
  return_item uuid:=gen_random_uuid();
  projection jsonb; facts_before text; facts_after text; projection_name text;
BEGIN
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan)
  VALUES(ca,'Regressão cancelamento A','active','personalizado'),
        (cb,'Regressão cancelamento B','active','personalizado');
  INSERT INTO public.company_settings(company_id,name,timezone)
  VALUES(ca,'Regressão A','America/Sao_Paulo'),(cb,'Regressão B','America/Sao_Paulo')
  ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone;
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(account_a,ca,'Banco fictício A','banco',0,true),(account_b,cb,'Banco fictício B','banco',0,true);
  SELECT id INTO STRICT stock_a FROM public.stocks WHERE company_id=ca AND is_default AND customer_id IS NULL;
  INSERT INTO public.inventory(id,company_id,name,unit,quantity,cost_price)
  VALUES(material,ca,'Material fictício','un',0,40),(bonus,ca,'Bonificado fictício','un',0,5);
  INSERT INTO public.pdv_orders(id,company_id,number,status,subtotal,total,contract_version)
  VALUES(sale_a,ca,1,'retirada_parcial',150,150,2),(sale_b,cb,1,'entregue',100,100,2);
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,
    unit_price,unit_cost,total,sort_order,item_type,unit_cost_v2,contract_version,
    gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES(item_a,ca,sale_a,material,'Material fictício',3,50,40,150,1,'material',40,2,150,0,0),
    (item_bonus,ca,sale_a,bonus,'Bonificado fictício',1,0,5,0,2,'material',5,2,0,0,0),
    (item_b,cb,sale_b,NULL,'Serviço fictício',1,100,0,100,1,'service',0,2,100,0,0);
  INSERT INTO public.pdv_stock_reservation_items(id,company_id,inventory_id,stock_id,
    order_item_id,state,reserved_quantity,consumed_quantity,cost_price_snapshot)
  VALUES(reservation_a,ca,material,stock_a,item_a,'consumed',2,2,40),
        (reservation_bonus,ca,bonus,stock_a,item_bonus,'consumed',1,1,5);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes)
  VALUES(movement_a,ca,material,stock_a,'saida',-2,40,'Entrega fictícia'),
        (movement_bonus,ca,bonus,stock_a,'saida',-1,5,'Bonificação fictícia'),
        (movement_return,ca,material,stock_a,'entrada',1,40,'Devolução fictícia'),
        (movement_reverse,ca,material,stock_a,'saida',-1,40,'Reversão fictícia');
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,origin,pdv_financial_role,pdv_settlement_group_id)
  VALUES(tx_a,ca,'entrada','Pix fictício A',100,'Recebimento parcial','2026-11-01','2026-11-01',true,account_a,'pdv','pdv_receivable_settlement',gen_random_uuid()),
        (tx_b,cb,'entrada','Pix fictício B',100,'Recebimento parcial','2026-11-01','2026-11-01',true,account_b,'pdv','pdv_receivable_settlement',gen_random_uuid());
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,contract_version,
    coverage_kind,coverage_status,settlement_status,settlement_transaction_id)
  VALUES(ca,sale_a,'pix',100,2,'pix','authorized','settled',tx_a),
        (cb,sale_b,'pix',100,2,'pix','authorized','settled',tx_b);
  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_at)
  VALUES(delivery_a,ca,sale_a,gen_random_uuid(),repeat('a',64),'2026-11-01 12:00:00+00'),
        (delivery_b,cb,sale_b,gen_random_uuid(),repeat('b',64),'2026-11-01 12:00:00+00');
  INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,reservation_id,
    inventory_movement_id,quantity,item_type,unit_cost_snapshot)
  VALUES(delivered_a,ca,delivery_a,item_a,reservation_a,movement_a,2,'material',40),
        (delivered_bonus,ca,delivery_a,item_bonus,reservation_bonus,movement_bonus,1,'material',5),
        (delivered_b,cb,delivery_b,item_b,NULL,NULL,1,'service',0);
  PERFORM public.pdv_apply_settlement_fifo_v2(ca,tx_a);
  PERFORM public.pdv_apply_settlement_fifo_v2(cb,tx_b);

  -- Valores conhecidos antes do cancelamento, incluindo CMV da bonificação.
  FOREACH projection_name IN ARRAY ARRAY['dre_competence','dre_cash'] LOOP
    projection:=public.pdv_financial_projection_page_v2(ca,projection_name,'2026-11-01','2026-11-10',100,0);
    IF (projection->>'revenue')::numeric IS DISTINCT FROM 100::numeric
       OR (projection->>'cmv')::numeric IS DISTINCT FROM 85::numeric THEN
      RAISE EXCEPTION 'base da regressão inválida em %: %',projection_name,projection;
    END IF;
  END LOOP;

  IF (SELECT sum(net_revenue) FROM public.pdv_commercial_facts_v2(ca)) IS DISTINCT FROM 100::numeric
     OR (SELECT sum(net_cmv) FROM public.pdv_commercial_facts_v2(ca)) IS DISTINCT FROM 85::numeric THEN
    RAISE EXCEPTION 'fonte comercial diverge da financeira antes do cancelamento';
  END IF;

  INSERT INTO public.pdv_operation_requests(id,company_id,operation_type,idempotency_key,payload_hash)
  VALUES(request_return,ca,'commercial.return.v2',gen_random_uuid()::text,repeat('c',64)),
        (request_reverse,ca,'commercial.return.reverse.v2',gen_random_uuid()::text,repeat('d',64));
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,reversal_of_id,operation_request_id)
  VALUES(return_id,ca,sale_a,'return','2026-11-05','Devolução fictícia',-50,-40,NULL,request_return),
        (reverse_id,ca,sale_a,'reversal','2026-11-06','Reversão fictícia',50,40,return_id,request_reverse);
  INSERT INTO public.pdv_commercial_return_items(id,company_id,commercial_return_id,delivery_item_id,
    inventory_id,destination,destination_stock_id,quantity,commercial_amount,cmv_amount,
    inventory_movement_id,reversal_of_item_id)
  VALUES(return_item,ca,return_id,delivered_a,material,'saleable',stock_a,1,-50,-40,movement_return,NULL),
        (gen_random_uuid(),ca,reverse_id,delivered_a,material,'saleable',stock_a,1,50,40,movement_reverse,return_item);

  -- cancelled_at também é usado no parcial: não excluir entrega/devolução por ele.
  UPDATE public.pdv_orders SET status='cancelado_parcial',cancelled_at='2026-11-08 12:00:00+00' WHERE id=sale_a;
  projection:=public.pdv_dre_competence_projection_v2(ca,'2026-11-05','2026-11-05',100,0);
  IF (projection->>'revenue')::numeric IS DISTINCT FROM -50::numeric
     OR (projection->>'cmv')::numeric IS DISTINCT FROM -40::numeric THEN
    RAISE EXCEPTION 'cancelamento parcial perdeu devolução/data/CMV: %',projection;
  END IF;
  projection:=public.pdv_dre_competence_projection_v2(ca,'2026-11-06','2026-11-06',100,0);
  IF (projection->>'revenue')::numeric IS DISTINCT FROM 50::numeric
     OR (projection->>'cmv')::numeric IS DISTINCT FROM 40::numeric THEN
    RAISE EXCEPTION 'cancelamento parcial perdeu reversão/data/CMV: %',projection;
  END IF;
  projection:=public.pdv_dre_cash_projection_v2(ca,'2026-11-01','2026-11-10',100,0);
  IF (projection->>'revenue')::numeric IS DISTINCT FROM 100::numeric
     OR (projection->>'cmv')::numeric IS DISTINCT FROM 85::numeric THEN
    RAISE EXCEPTION 'cancelamento parcial apagou recebimento/bonificação';
  END IF;

  IF (SELECT sum(net_revenue) FROM public.pdv_commercial_facts_v2(ca) WHERE event_date='2026-11-05') IS DISTINCT FROM -50::numeric
     OR (SELECT sum(net_cmv) FROM public.pdv_commercial_facts_v2(ca) WHERE event_date='2026-11-05') IS DISTINCT FROM -40::numeric
     OR (SELECT sum(net_revenue) FROM public.pdv_commercial_facts_v2(ca)) IS DISTINCT FROM 100::numeric
     OR (SELECT sum(net_cmv) FROM public.pdv_commercial_facts_v2(ca)) IS DISTINCT FROM 85::numeric THEN
    RAISE EXCEPTION 'fonte comercial perdeu entrega/devolução/reversão do parcial';
  END IF;

  SELECT md5(jsonb_build_object(
    'deliveries',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.pdv_delivery_items d WHERE d.company_id=ca),
    'applications',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.pdv_settlement_applications a WHERE a.company_id=ca),
    'returns',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.pdv_commercial_return_items r WHERE r.company_id=ca),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.inventory_movements m WHERE m.company_id=ca)
  )::text) INTO facts_before;
  UPDATE public.pdv_orders SET status='cancelado',cancelled_at='2026-11-12 12:00:00+00' WHERE id=sale_a;
  UPDATE public.financial_transactions SET cancelled_at='2026-11-12 12:00:00+00' WHERE id=tx_a;
  FOREACH projection_name IN ARRAY ARRAY['dre_competence','dre_cash','dfc'] LOOP
    projection:=public.pdv_financial_projection_page_v2(ca,projection_name,'2026-11-01','2026-11-12',100,0);
    IF (projection->>'revenue')::numeric IS DISTINCT FROM 0::numeric
       OR (projection->>'cmv')::numeric IS DISTINCT FROM 0::numeric
       OR (projection->>'cash_flow')::numeric IS DISTINCT FROM 0::numeric
       OR (projection->>'total_count')::integer IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'venda cancelada ainda compõe relatório %: %',projection_name,projection;
    END IF;
    projection:=public.pdv_financial_projection_page_v2(cb,projection_name,'2026-11-01','2026-11-12',100,0);
    IF (projection_name='dfc' AND (projection->>'cash_flow')::numeric IS DISTINCT FROM 100::numeric)
       OR (projection_name<>'dfc' AND (projection->>'revenue')::numeric IS DISTINCT FROM 100::numeric) THEN
      RAISE EXCEPTION 'cancelamento afetou outra empresa: %',projection;
    END IF;
  END LOOP;
  SELECT md5(jsonb_build_object(
    'deliveries',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.pdv_delivery_items d WHERE d.company_id=ca),
    'applications',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.pdv_settlement_applications a WHERE a.company_id=ca),
    'returns',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.pdv_commercial_return_items r WHERE r.company_id=ca),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.inventory_movements m WHERE m.company_id=ca)
  )::text) INTO facts_after;
  IF EXISTS(SELECT 1 FROM public.pdv_commercial_facts_v2(ca))
     OR (SELECT sum(net_revenue) FROM public.pdv_commercial_facts_v2(cb)) IS DISTINCT FROM 100::numeric THEN
    RAISE EXCEPTION 'fonte comercial incluiu venda cancelada ou afetou outra empresa';
  END IF;
  IF facts_after IS DISTINCT FROM facts_before THEN RAISE EXCEPTION 'projeção alterou fatos históricos'; END IF;
  IF has_function_privilege('anon','public.pdv_financial_projection_rows_v2(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_financial_projection_rows_v2(uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.pdv_financial_projection_rows_v2(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'helper interno ficou exposto';
  END IF;
END $fixture$;
SELECT 'pdv_cancelled_order_financial_projections: ok' AS result;
ROLLBACK;
