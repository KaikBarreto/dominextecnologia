-- Integração transacional; somente dados fictícios.
BEGIN;
DO $test$
DECLARE
 c uuid:='d3310000-0000-4000-8000-000000000101';
 c2 uuid:='d3310000-0000-4000-8000-000000000102';
 u uuid:='d3310000-0000-4000-8000-000000000103';
 other_u uuid:='d3310000-0000-4000-8000-000000000104';
 customer uuid:='d3310000-0000-4000-8000-000000000105';
 os uuid:='d3310000-0000-4000-8000-000000000106';
 service uuid:='d3310000-0000-4000-8000-000000000107';
 charge uuid:='d3310000-0000-4000-8000-000000000108';
 revenue uuid:='d3310000-0000-4000-8000-000000000109';
 op uuid:='d3310000-0000-4000-8000-000000000110';
 payload jsonb; result jsonb; items jsonb; rev bigint;
BEGIN
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Empresa de teste','active'),(c2,'Outra empresa de teste','active');
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(u,'os-commercial-a@example.invalid'),(other_u,'os-commercial-b@example.invalid')) fixture(id,email);
 INSERT INTO public.profiles(user_id,company_id) VALUES(u,c),(other_u,c2)
 ON CONFLICT (user_id) DO UPDATE SET company_id=EXCLUDED.company_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'tecnico'),(other_u,'tecnico');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'[]',true),(other_u,'[]',true);
 INSERT INTO public.customers(id,company_id,name) VALUES(customer,c,'Cliente fictício');
 INSERT INTO public.service_types(id,company_id,name,default_price,is_active) VALUES(service,c,'Limpeza',100,true);
 INSERT INTO public.service_orders(id,company_id,customer_id,technician_id,status,order_number,total_value)
 VALUES(os,c,customer,u,'concluida',123,100);
 INSERT INTO public.service_order_budget_items(service_order_id,company_id,position,item_type,description,quantity,unit_price,total_price,service_type_id,unit_total_cost,pricing_mode)
 VALUES(os,c,0,'servico','Limpeza',1,100,100,service,30,'registered');
 payload:=public.get_os_commercial_document(os,true);
 IF payload->'summary'<>'null'::jsonb OR payload->'receipt'<>'null'::jsonb THEN RAISE EXCEPTION 'Vazamento de valor com opção desligada'; END IF;
 UPDATE public.service_orders SET show_values_to_customer=true WHERE id=os;
 payload:=public.get_os_commercial_document(os,true);
 IF (payload#>>'{summary,total}')::numeric<>100 OR payload::text LIKE '%unit_total_cost%' OR payload::text LIKE '%bdi%' THEN RAISE EXCEPTION 'Resumo ou allowlist indevidos'; END IF;
 INSERT INTO public.financial_transactions(id,company_id,service_order_id,transaction_type,amount,is_paid,paid_date)
 VALUES(revenue,c,os,'entrada',100,false,null);
 payload:=public.get_os_commercial_document(os,true);
 IF payload->'receipt'<>'null'::jsonb THEN RAISE EXCEPTION 'Recibo liberado para receita em aberto'; END IF;
 UPDATE public.financial_transactions SET is_paid=true,paid_date='2026-11-26' WHERE id=revenue;
 payload:=public.get_os_commercial_document(os,true);
 IF (payload#>>'{receipt,received}')::numeric<>100 THEN RAISE EXCEPTION 'Recebimento manual incorreto'; END IF;
 UPDATE public.financial_transactions SET amount_received=40 WHERE id=revenue;
 INSERT INTO public.financial_transactions(company_id,transaction_type,amount,is_paid,paid_date,parent_transaction_id,category)
 VALUES(c,'entrada',40,true,'2026-11-25',revenue,'Recebimento parcial');
 UPDATE public.financial_transactions SET is_paid=true,paid_date='2026-11-26' WHERE id=revenue;
 payload:=public.get_os_commercial_document(os,true);
 IF (payload#>>'{receipt,received}')::numeric<>100 THEN RAISE EXCEPTION 'Recebimento parcial contado duas vezes'; END IF;
 INSERT INTO public.financial_transactions(company_id,transaction_type,amount,is_paid,paid_date,parent_transaction_id,category)
 VALUES(c,'entrada',60,true,'2026-11-26',revenue,'Recebimento parcial');
 DELETE FROM public.financial_transactions WHERE parent_transaction_id=revenue AND amount=60;
 payload:=public.get_os_commercial_document(os,true);
 IF (payload#>>'{receipt,received}')::numeric<>40 THEN RAISE EXCEPTION 'Parcial em aberto deveria comprovar somente 40'; END IF;
 UPDATE public.financial_transactions SET cancelled_at=now() WHERE id=revenue OR parent_transaction_id=revenue;
 INSERT INTO public.tenant_charges(id,company_id,source_id,source_type,status,value,payment_date,billing_type)
 VALUES(charge,c,os,'service_order','RECEIVED',100,'2026-11-26','PIX');
 INSERT INTO public.financial_transactions(company_id,service_order_id,transaction_type,amount,is_paid,paid_date,tenant_charge_id)
 VALUES(c,os,'entrada',100,true,'2026-11-26',charge);
 payload:=public.get_os_commercial_document(os,true);
 IF (payload#>>'{receipt,received}')::numeric<>100 THEN RAISE EXCEPTION 'Cobrança e projeção contadas duas vezes'; END IF;
 UPDATE public.tenant_charges SET status='REFUNDED' WHERE id=charge;
 payload:=public.get_os_commercial_document(os,true);
 IF payload->'receipt'<>'null'::jsonb THEN RAISE EXCEPTION 'Recibo de cobrança estornada liberado'; END IF;
 UPDATE public.service_orders SET entry_type='tarefa' WHERE id=os;
 IF public.get_os_commercial_document(os,true) IS NOT NULL THEN RAISE EXCEPTION 'Tarefa pública'; END IF;
 UPDATE public.service_orders SET entry_type='os',status='em_andamento' WHERE id=os;
 IF public.get_os_commercial_document(os,true) IS NOT NULL THEN RAISE EXCEPTION 'Relatório comercial prematuro'; END IF;
 UPDATE public.financial_transactions SET cancelled_at=now() WHERE service_order_id=os;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_u,'role','authenticated')::text,true);
 BEGIN PERFORM public.get_os_field_budget(os); RAISE EXCEPTION 'Leitura cruzou tenant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 IF public.can_price_os(u) THEN RAISE EXCEPTION 'Preço liberado sem permissão explícita'; END IF;
 items:=jsonb_build_array(jsonb_build_object('item_type','servico','description','Limpeza','quantity',2,'unit_price',100,'service_type_id',service));
 SELECT commercial_revision INTO rev FROM public.service_orders WHERE id=os;
 result:=public.save_os_field_budget(os,rev,op,items,true);
 IF (result->>'total')::numeric<>200 THEN RAISE EXCEPTION 'Total não recalculado'; END IF;
 IF public.save_os_field_budget(os,rev,op,items,true)<>result THEN RAISE EXCEPTION 'Replay não idempotente'; END IF;
 BEGIN PERFORM public.save_os_field_budget(os,0,gen_random_uuid(),items,true); RAISE EXCEPTION 'Sobrescreveu versão nova'; EXCEPTION WHEN SQLSTATE 'OSC01' THEN NULL; END;
 rev:=(result->>'revision')::bigint;
 items:=jsonb_set(items,'{0,unit_price}','1');
 BEGIN PERFORM public.save_os_field_budget(os,rev,gen_random_uuid(),items,true); RAISE EXCEPTION 'Técnico mudou preço'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.user_permissions SET permissions='["fn:os_edit_prices"]' WHERE user_id=u;
 result:=public.save_os_field_budget(os,rev,gen_random_uuid(),items,false);
 IF (result->>'total')::numeric<>2 OR (result->>'show_values')::boolean THEN RAISE EXCEPTION 'Permissão de preço não aplicada'; END IF;
 UPDATE public.companies SET subscription_status='expired' WHERE id=c;
 IF public.get_os_commercial_document(os,true) IS NOT NULL THEN RAISE EXCEPTION 'Assinatura vencida leu documento'; END IF;
 IF has_table_privilege('authenticated','public.service_order_budget_items','INSERT') OR has_table_privilege('anon','public.os_commercial_requests','SELECT')
 OR has_function_privilege('authenticated','public._sync_os_budget_internal(uuid,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Bypass de ACL'; END IF;
END;
$test$;

-- Caso confirmado: total 3.300, entrada de 2.600, saldo de 700; novas baixas na mesma conta.
DO $test$
DECLARE
 c uuid:='d3310000-0000-4000-8000-000000000101'; u uuid:='d3310000-0000-4000-8000-000000000103';
 os uuid:='d3310000-0000-4000-8000-000000000106'; account uuid:='d3310000-0000-4000-8000-000000000111';
 op uuid:=gen_random_uuid(); result jsonb; parent uuid; receipt jsonb;
BEGIN
 UPDATE public.companies SET subscription_status='active' WHERE id=c;
 UPDATE public.user_permissions SET permissions='["fn:os_finish_revenue","fn:manage_finance","screen:finance","fn:use_bank_accounts","fn:os_edit_prices"]' WHERE user_id=u;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.financial_accounts(id,company_id,name,type,is_active) VALUES(account,c,'Conta de teste','banco',true);
 INSERT INTO public.financial_categories(company_id,name,type,is_active) VALUES(c,'Vendas de Serviços','entrada',true);
 DELETE FROM public.service_order_budget_items WHERE service_order_id=os;
 UPDATE public.service_orders SET total_value=0,status='concluida' WHERE id=os;
 result:=public.bill_os_receive_payment(os,op,NULL,3300,2600,NULL,account,'pix','2026-11-26','2026-12-26','Vendas de Serviços');
 parent:=(result->>'transaction_id')::uuid;
 IF (result->>'remaining')::numeric<>700 THEN RAISE EXCEPTION 'Saldo inicial incorreto'; END IF;
 IF public.bill_os_receive_payment(os,op,NULL,3300,2600,NULL,account,'pix','2026-11-26','2026-12-26','Vendas de Serviços')<>result THEN RAISE EXCEPTION 'Replay do recebimento divergiu'; END IF;
 IF (SELECT amount_received FROM public.financial_transactions WHERE id=parent)<>2600 THEN RAISE EXCEPTION 'Entrada parcial não registrada na conta'; END IF;
 receipt:=public.get_os_commercial_document(os,true);
 IF (receipt#>>'{receipt,received}')::numeric<>2600 THEN RAISE EXCEPTION 'Recibo deve comprovar apenas 2600'; END IF;
 BEGIN PERFORM public.bill_os_receive_payment(os,gen_random_uuid(),parent,3300,100,0,account,'pix','2026-11-26','2026-12-26','Vendas de Serviços'); RAISE EXCEPTION 'Saldo antigo aceito'; EXCEPTION WHEN SQLSTATE 'OSC01' THEN NULL; END;
 result:=public.bill_os_receive_payment(os,gen_random_uuid(),parent,3300,400,2600,account,'pix','2026-11-26','2026-12-26','Vendas de Serviços');
 IF (result->>'remaining')::numeric<>300 THEN RAISE EXCEPTION 'Segundo parcial não manteve o saldo'; END IF;
 result:=public.bill_os_receive_payment(os,gen_random_uuid(),parent,3300,300,3000,account,'pix','2026-11-26','2026-12-26','Vendas de Serviços');
 IF (result->>'remaining')::numeric<>0 OR NOT (SELECT is_paid FROM public.financial_transactions WHERE id=parent) THEN RAISE EXCEPTION 'Quitação final incorreta'; END IF;
 receipt:=public.get_os_commercial_document(os,true);
 IF (receipt#>>'{receipt,received}')::numeric<>3300 THEN RAISE EXCEPTION 'Recibo final contou parcela duas vezes'; END IF;
 result:=public.get_os_field_budget(os);
 IF NOT (result->>'is_billed')::boolean THEN RAISE EXCEPTION 'Editor não reconheceu faturamento'; END IF;
 result:=public.save_os_field_budget(os,(result->>'revision')::bigint,gen_random_uuid(),result->'items',true);
 IF NOT (result->>'show_values')::boolean THEN RAISE EXCEPTION 'Preferência deveria poder mudar após faturamento'; END IF;
 IF (public.os_billing_state(os)->>'revenue_total')::numeric<>3300 THEN RAISE EXCEPTION 'Estado de faturamento somou parciais em duplicidade'; END IF;
 IF (SELECT count(*) FROM public.financial_transactions WHERE service_order_id=os AND parent_transaction_id IS NULL AND cancelled_at IS NULL AND tenant_charge_id IS NULL)<>1 THEN RAISE EXCEPTION 'Conta duplicada'; END IF;
END;
$test$;
-- Exercita a guarda sob o papel REST, não somente sob o owner do banco.
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 BEGIN
  UPDATE public.service_orders SET total_value=3301 WHERE id='d3310000-0000-4000-8000-000000000106';
  RAISE EXCEPTION 'REST alterou o total faturado';
 EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
END;
$test$;
RESET ROLE;
ROLLBACK;
