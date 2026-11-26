-- Cenários de integração com dados fictícios. Não altera dados persistidos.
BEGIN;
DO $test$
DECLARE c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid();
 account uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); os uuid:=gen_random_uuid();
 request uuid:=gen_random_uuid(); child uuid; charge uuid:=gen_random_uuid(); root uuid; root2 uuid; result jsonb; rows jsonb;
 received numeric; doc jsonb; origin uuid:=gen_random_uuid(); reservation uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Empresa QA','active'),(c2,'Outro tenant QA','active');
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.profiles(user_id,company_id) VALUES(u,c);
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["*"]',true);
 INSERT INTO public.customers(id,company_id,name) VALUES(customer,c,'Cliente QA');
 INSERT INTO public.financial_accounts(id,company_id,name,type,is_active) VALUES(account,c,'Banco QA','banco',true);
 INSERT INTO public.financial_categories(company_id,name,type,is_active) VALUES(c,'Receita QA','entrada',true),(c,'Tarifa QA','saida',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.quotes(id,company_id,customer_id,quote_number,total_value,total_price) VALUES(q,c,customer,99,3300,9999);
 rows:=jsonb_build_array(jsonb_build_object('amount',3300,'category','Receita QA','account_id',account,
  'transaction_date','2026-11-26','paid_date','2026-11-26','payment_method','pix'));
 -- Falha na tarifa deve desfazer receita, aprovação e replay (nenhuma gravação parcial).
 BEGIN
  PERFORM public.approve_quote_financial_atomic(q,request,'recebido',rows,10,'Categoria inexistente');
  RAISE EXCEPTION 'Aprovação parcial foi aceita';
 EXCEPTION WHEN SQLSTATE 'OSC03' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE company_id=c) OR
  (SELECT financial_transaction_id FROM public.quotes WHERE id=q) IS NOT NULL THEN RAISE EXCEPTION 'Falha não atômica'; END IF;
 BEGIN
  PERFORM public.approve_quote_financial_atomic(q,request,'recebido',jsonb_set(rows,'{0,amount}','9999'),0,NULL);
  RAISE EXCEPTION 'Usou sugestão BDI como total comercial';
 EXCEPTION WHEN SQLSTATE 'OSC01' THEN NULL; END;
 rows:=jsonb_build_array(
  jsonb_build_object('amount',1100,'category','Receita QA','transaction_date','2026-11-30'),
  jsonb_build_object('amount',1100,'category','Receita QA','transaction_date','2026-12-30'),
  jsonb_build_object('amount',1100,'category','Receita QA','transaction_date','2027-01-30'));
 result:=public.approve_quote_financial_atomic(q,request,'a_receber',rows);
 root:=(result->>'primaryId')::uuid;
 IF result<>public.approve_quote_financial_atomic(q,request,'a_receber',rows) THEN RAISE EXCEPTION 'Replay da aprovação divergiu'; END IF;
 IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>3 OR
  (SELECT sum(amount) FROM public.financial_transactions WHERE company_id=c)<>3300 THEN RAISE EXCEPTION 'Parcelamento duplicado ou total errado'; END IF;
 BEGIN PERFORM public.approve_quote_financial_atomic(q,gen_random_uuid(),'a_receber',rows);
  RAISE EXCEPTION 'Segunda aprovação duplicou dívida'; EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
 INSERT INTO public.service_orders(id,company_id,customer_id,quote_id,status,total_value,order_number)
 VALUES(os,c,customer,q,'concluida',3300,99);
 -- Simula conversão antiga: raízes ainda sem service_order_id. A origem precisa ser reconhecida.
 UPDATE public.quotes SET converted_to_os_id=os,status='convertido' WHERE id=q;
 IF (public.os_billing_state(os)->>'revenue_total')::numeric<>3300 OR jsonb_array_length(public.get_os_manual_receivables(os))<>3 THEN
  RAISE EXCEPTION 'OS perdeu vínculo com parcelas do orçamento'; END IF;
 BEGIN PERFORM public.bill_os_receive_payment(os,gen_random_uuid(),NULL,3300,0,NULL,NULL,NULL,NULL,NULL,'Receita QA');
  RAISE EXCEPTION 'Refaturou orçamento através da OS'; EXCEPTION WHEN SQLSTATE 'OSC01' THEN NULL; END;
 result:=public.bill_os_receive_payment(os,gen_random_uuid(),root,3300,300,0,account,'pix','2026-11-26',NULL,'Receita QA');
 SELECT id INTO child FROM public.financial_transactions WHERE parent_transaction_id=root AND category='Recebimento parcial';
 PERFORM public.bill_os_receive_payment(os,gen_random_uuid(),root,3300,800,300,account,'pix','2026-11-26',NULL,'Receita QA');
 IF (public.get_os_commercial_document(os,true)#>>'{receipt,received}')::numeric<>1100 THEN RAISE EXCEPTION 'Recibo perdeu quitação final'; END IF;
 BEGIN UPDATE public.financial_transactions SET is_paid=false WHERE id=root;
  RAISE EXCEPTION 'Desfez a mãe sem desfazer os pagamentos'; EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
 BEGIN UPDATE public.financial_transactions SET is_paid=false,paid_date=NULL WHERE id=child;
  RAISE EXCEPTION 'Desfez filha fora do livro de recebimentos'; EXCEPTION WHEN SQLSTATE 'OSC03' THEN NULL; END;
 UPDATE public.financial_transactions SET cancelled_at=now() WHERE id=child;
 IF (SELECT amount_received FROM public.financial_transactions WHERE id=root)<>800 OR
  (SELECT is_paid FROM public.financial_transactions WHERE id=root) OR
  (public.get_os_commercial_document(os,true)#>>'{receipt,received}')::numeric<>800 THEN RAISE EXCEPTION 'Cancelamento apagou recebimento final'; END IF;
 -- Duplicidade por outra porta manual e parcela repetida do mesmo grupo.
 UPDATE public.financial_transactions SET service_order_id=os WHERE company_id=c AND parent_transaction_id IS NULL;
 BEGIN
  INSERT INTO public.financial_transactions(company_id,service_order_id,transaction_type,amount,is_paid) VALUES(c,os,'entrada',3300,false);
  RAISE EXCEPTION 'Receita manual duplicou a dívida'; EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
 BEGIN
  INSERT INTO public.financial_transactions(company_id,service_order_id,transaction_type,amount,is_paid,installment_group_id,installment_number,installment_total)
   SELECT c,os,'entrada',1100,false,installment_group_id,installment_number,installment_total FROM public.financial_transactions WHERE id=root;
  RAISE EXCEPTION 'Duplicou número da parcela'; EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
 -- Recebimento manual anterior + cobrança somente do saldo: 100 + 1000.
 SELECT id INTO root2 FROM public.financial_transactions WHERE company_id=c AND parent_transaction_id IS NULL AND id<>root ORDER BY due_date LIMIT 1;
 PERFORM public.bill_os_receive_payment(os,gen_random_uuid(),root2,3300,100,0,account,'pix','2026-11-26',NULL,'Receita QA');
 INSERT INTO public.tenant_charges(id,company_id,source_type,source_id,value,status,payment_date,billing_type)
 VALUES(charge,c,'receivable',root2,1000,'CONFIRMED','2026-11-26','PIX');
 UPDATE public.financial_transactions SET tenant_charge_id=charge WHERE id=root2;
 INSERT INTO public.financial_transactions(company_id,parent_transaction_id,transaction_type,amount,category,is_paid,paid_date,tenant_charge_id)
 VALUES(c,root2,'entrada',1000,'Recebimento parcial',true,'2026-11-26',charge);
 UPDATE public.tenant_charges SET payment_date='2026-11-27T02:30:00Z' WHERE id=charge;
 doc:=public.get_os_commercial_document(os,true);
 IF (doc#>>'{receipt,received}')::numeric<>1900 THEN RAISE EXCEPTION 'Cobrança do saldo perdeu parcial ou contou projeção duas vezes: %',doc; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc#>'{receipt,payments}') p
  WHERE p->>'reference'=charge::text AND p->>'paid_date'='2026-11-26') THEN RAISE EXCEPTION 'Recibo mudou o dia civil do pagamento'; END IF;
 IF NOT (public.os_billing_state(os)->>'has_charge')::boolean THEN RAISE EXCEPTION 'Cobrança do recebível não reconhecida'; END IF;
 -- Outra parcela livre continua recebível mesmo com um boleto em parcela diferente.
 DECLARE free_root uuid;
 BEGIN
  SELECT id INTO free_root FROM public.financial_transactions WHERE company_id=c AND parent_transaction_id IS NULL AND id NOT IN (root,root2) LIMIT 1;
  PERFORM public.bill_os_receive_payment(os,gen_random_uuid(),free_root,3300,50,0,account,'pix','2026-11-26',NULL,'Receita QA');
  IF (SELECT amount_received FROM public.financial_transactions WHERE id=free_root)<>50 THEN RAISE EXCEPTION 'Uma cobrança bloqueou outra parcela'; END IF;
  DELETE FROM public.financial_transactions WHERE parent_transaction_id=free_root;
 END;
 UPDATE public.tenant_charges SET status='REFUND_IN_PROGRESS' WHERE id=charge;
 IF NOT (public.os_billing_state(os)->>'has_charge')::boolean THEN RAISE EXCEPTION 'Estorno em andamento liberou faturamento'; END IF;
 UPDATE public.tenant_charges SET status='REFUNDED',payment_date=NULL WHERE id=charge;
 DELETE FROM public.financial_transactions WHERE parent_transaction_id=root2 AND tenant_charge_id=charge;
 IF (public.get_os_commercial_document(os,true)#>>'{receipt,received}')::numeric<>900 THEN RAISE EXCEPTION 'Estorno apagou parcial manual anterior'; END IF;
 IF NOT public.validate_os_charge_origin(c2,os)=false THEN RAISE EXCEPTION 'Preflight cruzou tenant'; END IF;
 IF public.validate_os_charge_origin(c,os) THEN RAISE EXCEPTION 'Gateway aceitou nova cobrança de dívida existente'; END IF;
 -- Conversão real: valor negociado 500, sugestão de BDI 900. Copia os valores e custos sem refaturar.
 DECLARE cq uuid:=gen_random_uuid(); co public.service_orders%ROWTYPE;
 BEGIN
  INSERT INTO public.quotes(id,company_id,customer_id,status,quote_number,total_value,total_price,use_bdi,tax_rate,admin_indirect_rate,profit_rate,bdi,total_cost)
  VALUES(cq,c,customer,'aprovado',101,500,900,false,10,12,10,0.68,120);
  INSERT INTO public.quote_items(id,quote_id,position,item_type,description,quantity,unit_price,total_price,pricing_mode,unit_total_cost)
  VALUES(gen_random_uuid(),cq,0,'servico','Serviço negociado',1,600,600,'manual',120);
  co:=public.generate_service_order_from_quote_with_values(cq,'[]',true);
  IF co.total_value<>500 OR co.commercial_adjustment<>-100 OR NOT co.show_values_to_customer OR
   (SELECT unit_total_cost FROM public.service_order_budget_items WHERE service_order_id=co.id)<>120 THEN
   RAISE EXCEPTION 'Conversão perdeu total negociado, desconto, preferência ou custo'; END IF;
  IF (public.generate_service_order_from_quote_with_values(cq,'[]',false)).id<>co.id THEN RAISE EXCEPTION 'Conversão repetida criou outra OS'; END IF;
  IF NOT (SELECT show_values_to_customer FROM public.service_orders WHERE id=co.id) THEN RAISE EXCEPTION 'Replay alterou a preferência'; END IF;
 END;
 -- Reserva de emissão bloqueia outro caminho mesmo antes de existir cobrança local.
 INSERT INTO public.service_orders(id,company_id,customer_id,status,total_value,order_number) VALUES(origin,c,customer,'concluida',500,100);
 IF NOT public.reserve_commercial_charge(c,'service_order',origin,reservation) THEN RAISE EXCEPTION 'Reserva recusada sem dívida'; END IF;
 IF public.reserve_commercial_charge(c,'service_order',origin,gen_random_uuid()) THEN RAISE EXCEPTION 'Duas emissões concorrentes aceitas'; END IF;
 BEGIN PERFORM public.bill_os_receive_payment(origin,gen_random_uuid(),NULL,500,0,NULL,NULL,NULL,NULL,NULL,'Receita QA');
  RAISE EXCEPTION 'Faturou enquanto emissão estava pendente'; EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
 PERFORM public.release_commercial_charge(c,reservation);
 PERFORM public.bill_os_receive_payment(origin,gen_random_uuid(),NULL,500,0,NULL,NULL,NULL,NULL,NULL,'Receita QA');
 IF has_table_privilege('anon','public.quote_financial_requests','SELECT') OR
  has_table_privilege('authenticated','public.os_charge_reservations','DELETE') OR
  has_function_privilege('authenticated','public.reserve_commercial_charge(uuid,text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Reserva ou replay expostos ao cliente'; END IF;
END;
$test$;
ROLLBACK;
