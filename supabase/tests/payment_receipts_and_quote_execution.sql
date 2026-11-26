-- Recibos individuais, replay, isolamento e execução independente do preço.
BEGIN;
DO $test$
DECLARE company uuid:=gen_random_uuid(); other_company uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid();
 other_customer uuid:=gen_random_uuid(); os uuid:=gen_random_uuid(); root uuid:=gen_random_uuid(); child uuid:=gen_random_uuid(); child2 uuid:=gen_random_uuid();
 charge uuid:=gen_random_uuid(); equipment uuid:=gen_random_uuid(); template uuid:=gen_random_uuid(); service uuid:=gen_random_uuid(); quote uuid:=gen_random_uuid();
 quote2 uuid:=gen_random_uuid(); generated public.service_orders%ROWTYPE; receipt jsonb; replay public.service_orders%ROWTYPE;
BEGIN
 INSERT INTO public.companies(id,name,subscription_status) VALUES(company,'Empresa fictícia','active'),(other_company,'Outro tenant','active');
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.profiles(user_id,company_id,is_active) VALUES(actor,company,true);
 INSERT INTO public.user_roles(user_id,role) VALUES(actor,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(actor,'["*"]',true);
 INSERT INTO public.customers(id,company_id,name) VALUES(customer,company,'Cliente fictício'),(other_customer,company,'Outro cliente');
 INSERT INTO public.company_settings(company_id,name,currency,timezone) VALUES(company,'Empresa fictícia','BRL','America/Sao_Paulo');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 INSERT INTO public.service_orders(id,company_id,customer_id,status,total_value,order_number,show_values_to_customer)
 VALUES(os,company,customer,'concluida',3300,123,true);
 INSERT INTO public.service_order_budget_items(service_order_id,company_id,position,item_type,description,quantity,unit_price,total_price)
 VALUES(os,company,0,'servico','Manutenção de refrigeração',1,3300,3300);
 INSERT INTO public.financial_transactions(id,company_id,customer_id,service_order_id,transaction_type,description,amount,is_paid)
 VALUES(root,company,customer,os,'entrada','Serviço OS #123',3300,false);
 INSERT INTO public.financial_transactions(id,company_id,parent_transaction_id,transaction_type,amount,category,is_paid,paid_date,payment_method)
 VALUES(child,company,root,'entrada',2600,'Recebimento parcial',true,'2026-11-26','pix');
 receipt:=public.get_financial_payment_receipt(child);
 IF (receipt->>'received')::numeric<>2600 OR NOT (receipt->>'is_partial')::boolean OR (receipt->>'remaining')::numeric<>700
  OR receipt#>>'{items,0,description}'<>'Manutenção de refrigeração' THEN RAISE EXCEPTION 'Recibo parcial sem valor, saldo ou item correto: %',receipt; END IF;
 INSERT INTO public.financial_transactions(id,company_id,parent_transaction_id,transaction_type,amount,category,is_paid,paid_date)
 VALUES(child2,company,root,'entrada',700,'Recebimento parcial',true,'2026-11-27');
 receipt:=public.get_financial_payment_receipt(child2);
 IF (receipt->>'received')::numeric<>700 OR NOT (receipt->>'is_partial')::boolean OR (receipt->>'remaining')::numeric<>0 THEN
  RAISE EXCEPTION 'Último parcial virou recibo integral: %',receipt; END IF;
 BEGIN PERFORM public.get_financial_payment_receipt(root); RAISE EXCEPTION 'Mãe quitada por filhas gerou recibo duplicado'; EXCEPTION WHEN SQLSTATE 'ORC01' THEN NULL; END;
 UPDATE public.financial_transactions SET cancelled_at=now() WHERE id=child2;
 BEGIN PERFORM public.get_financial_payment_receipt(child2); RAISE EXCEPTION 'Recibo de estornado aceito'; EXCEPTION WHEN SQLSTATE 'ORC01' THEN NULL; END;
 UPDATE public.service_orders SET show_values_to_customer=false WHERE id=os;
 receipt:=public.get_os_commercial_document(os,true)->'receipt';
 IF receipt#>'{items,0,unit_price}' IS NOT NULL OR receipt->>'source_total' IS NOT NULL OR receipt#>>'{items,0,description}' IS NULL THEN
  RAISE EXCEPTION 'Recibo vazou preços ocultos ou perdeu descrição'; END IF;
 -- Leitor público não tem sessão interna: o entitlement interno da empresa
 -- deve valer sem dar ao visitante acesso à RPC de assinatura autenticada.
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 IF public.get_os_commercial_document(os,true)->'receipt' IS NULL THEN RAISE EXCEPTION 'Visitante perdeu recibo público'; END IF;
 UPDATE public.companies SET subscription_status='cancelled' WHERE id=company;
 IF public.get_os_commercial_document(os,true) IS NOT NULL THEN RAISE EXCEPTION 'Assinatura cancelada vazou documento'; END IF;
 UPDATE public.companies SET subscription_status='active',subscription_expires_at=now()-interval '3 days' WHERE id=company;
 IF public.get_os_commercial_document(os,true) IS NOT NULL THEN RAISE EXCEPTION 'Assinatura vencida vazou documento'; END IF;
 UPDATE public.companies SET subscription_expires_at=NULL WHERE id=company;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 -- Cobrança sem espelho financeiro tem recibo próprio e perde-o ao ser estornada.
 INSERT INTO public.tenant_charges(id,company_id,customer_id,source_type,source_id,value,status,payment_date,billing_type,description)
 VALUES(charge,company,customer,'manual',NULL,250,'CONFIRMED','2026-11-27T02:30Z','PIX','Peças de reposição');
 receipt:=public.get_charge_payment_receipt(charge);
 IF (receipt->>'received')::numeric<>250 OR receipt#>>'{payments,0,paid_date}'<>'2026-11-26' THEN RAISE EXCEPTION 'Recibo sem espelho ou fuso incorreto'; END IF;
 UPDATE public.tenant_charges SET status='REFUND_IN_PROGRESS' WHERE id=charge;
 BEGIN PERFORM public.get_charge_payment_receipt(charge); RAISE EXCEPTION 'Cobrança em estorno emitiu recibo'; EXCEPTION WHEN SQLSTATE 'ORC01' THEN NULL; END;
 UPDATE public.tenant_charges SET status='CONFIRMED' WHERE id=charge;
 UPDATE public.profiles SET company_id=other_company WHERE user_id=actor;
 BEGIN PERFORM public.get_financial_payment_receipt(child); RAISE EXCEPTION 'Vazou outro tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN PERFORM public.get_charge_payment_receipt(charge); RAISE EXCEPTION 'Vazou cobrança de outro tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.profiles SET company_id=company,is_active=false WHERE user_id=actor;
 BEGIN PERFORM public.get_financial_payment_receipt(child); RAISE EXCEPTION 'Perfil inativo emitiu'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.profiles SET is_active=true WHERE user_id=actor;
 DELETE FROM public.user_roles WHERE user_id=actor; UPDATE public.user_permissions SET permissions='[]' WHERE user_id=actor;
 BEGIN PERFORM public.get_financial_payment_receipt(child); RAISE EXCEPTION 'Sem leitura financeira emitiu'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.user_permissions SET permissions='["screen:finance","fn:create_os"]' WHERE user_id=actor;
 PERFORM public.get_financial_payment_receipt(child);
 -- Conversão padrão sem equipamento/checklist mesmo com serviços e equipamentos no cliente.
 INSERT INTO public.equipment(id,company_id,customer_id) VALUES(equipment,company,customer);
 INSERT INTO public.form_templates(id,company_id,is_active) VALUES(template,company,true);
 INSERT INTO public.service_types(id,company_id,name,is_active) VALUES(service,company,'Serviço comercial',true);
 INSERT INTO public.quotes(id,company_id,customer_id,status,quote_number,total_value,total_price)
 VALUES(quote,company,customer,'aprovado',1,100,100),(quote2,company,customer,'aprovado',2,100,100);
 INSERT INTO public.quote_items(id,quote_id,position,item_type,description,quantity,unit_price,total_price,service_type_id)
 VALUES(gen_random_uuid(),quote,0,'servico','Serviço',1,100,100,service),(gen_random_uuid(),quote2,0,'servico','Serviço',1,100,100,service);
 generated:=public.generate_service_order_from_quote_prepared(quote,'[]',true);
 IF generated.total_value<>100 OR EXISTS(SELECT 1 FROM public.service_order_equipment WHERE service_order_id=generated.id) THEN RAISE EXCEPTION 'Conversão padrão exige execução'; END IF;
 generated:=public.generate_service_order_from_quote_prepared(quote2,jsonb_build_array(jsonb_build_object('equipment_id',equipment,'form_template_ids',jsonb_build_array(template))),false);
 IF NOT EXISTS(SELECT 1 FROM public.service_order_equipment WHERE service_order_id=generated.id AND equipment_id=equipment AND form_template_id=template) THEN RAISE EXCEPTION 'Checklist independente não aplicado'; END IF;
 replay:=public.generate_service_order_from_quote_prepared(quote2,'[]',true);
 IF replay.id<>generated.id OR replay.show_values_to_customer THEN RAISE EXCEPTION 'Retry alterou execução/preferência'; END IF;
 -- Pagamento do orçamento antes de existir OS também discrimina os itens.
 DECLARE q3 uuid:=gen_random_uuid(); payment3 uuid:=gen_random_uuid();
 BEGIN
  INSERT INTO public.financial_transactions(id,company_id,customer_id,transaction_type,description,amount,is_paid,paid_date)
   VALUES(payment3,company,customer,'entrada','Orçamento fictício',100,true,'2026-11-26');
  INSERT INTO public.quotes(id,company_id,customer_id,quote_number,status,total_value,total_price,financial_transaction_id)
   VALUES(q3,company,customer,3,'aprovado',100,100,payment3);
  INSERT INTO public.quote_items(id,quote_id,position,item_type,description,quantity,unit_price,total_price)
   VALUES(gen_random_uuid(),q3,0,'servico','Inspeção antes da OS',1,100,100);
  receipt:=public.get_financial_payment_receipt(payment3);
  IF receipt#>>'{items,0,description}'<>'Inspeção antes da OS' THEN RAISE EXCEPTION 'Recibo perdeu itens do orçamento sem OS'; END IF;
 END;
 IF has_function_privilege('anon','public._financial_payment_receipt(uuid)','EXECUTE') OR has_function_privilege('authenticated','public._os_receipt_context(uuid)','EXECUTE')
  OR has_function_privilege('anon','public.get_financial_payment_receipt(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Helper interno público'; END IF;
END;
$test$;
ROLLBACK;
