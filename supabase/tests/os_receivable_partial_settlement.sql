-- Fixtures fictícias; executado em transação com rollback, sem gateway externo.
BEGIN;
DO $test$
DECLARE
 c uuid:=gen_random_uuid(); other_c uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 customer uuid:=gen_random_uuid(); os uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); cc uuid:=gen_random_uuid();
 plan text:='qa-os-partial-'||gen_random_uuid()::text;
 root uuid; old uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); reply jsonb; receipt jsonb; child uuid;
BEGIN
 INSERT INTO subscription_plans(code,name,included_modules) VALUES(plan,'Plano QA','["basic","finance","service_operations","customer_portal"]');
 INSERT INTO companies(id,name,subscription_status,subscription_plan) VALUES(c,'Empresa QA','active',plan),(other_c,'Outra QA','active',plan);
 INSERT INTO auth.users(id) VALUES(u),(outsider);
 INSERT INTO profiles(user_id,company_id,is_active) VALUES(u,c,true),(outsider,other_c,true)
  ON CONFLICT(user_id) DO UPDATE SET company_id=excluded.company_id,is_active=true;
 INSERT INTO user_permissions(user_id,permissions,is_active) VALUES(u,'["screen:finance","fn:manage_finance","fn:use_bank_accounts"]',true),(outsider,'["*"]',true);
 INSERT INTO customers(id,company_id,name) VALUES(customer,c,'Cliente QA');
 INSERT INTO company_settings(company_id,timezone,currency) VALUES(c,'America/Sao_Paulo','BRL');
 INSERT INTO financial_accounts(id,company_id,name,type,is_active) VALUES(account,c,'Banco QA','banco',true);
 INSERT INTO financial_categories(company_id,name,type,is_active) VALUES(c,'Receita QA','entrada',true),(c,'Tarifa QA','saida',true);
 INSERT INTO cost_centers(id,company_id,name) VALUES(cc,c,'Obra QA');
 INSERT INTO service_orders(id,company_id,customer_id,status,total_value,order_number,show_values_to_customer)
 VALUES(os,c,customer,'concluida',3300,123,true);
 INSERT INTO service_order_budget_items(service_order_id,company_id,position,item_type,description,quantity,unit_price,total_price)
 VALUES(os,c,0,'servico','Serviço QA',1,3300,3300);
 INSERT INTO financial_transactions(id,company_id,service_order_id,customer_id,transaction_type,amount,is_paid,paid_date,category,origin,transaction_date,description,account_id)
 VALUES(old,c,os,customer,'entrada',2600,true,'2026-11-26','Receita QA','geral','2026-11-26','Recebimento anterior',account);
 -- A criação do complemento continua exigindo a permissão de faturar a OS.
 UPDATE user_permissions SET permissions='["*"]' WHERE user_id=u;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 reply:=complement_os_manual_billing(os,request,3300,2600,'2026-12-26','Receita QA');
 root:=(reply->>'transaction_id')::uuid;
 UPDATE financial_transactions SET cost_center_id=cc WHERE id=root;
 UPDATE user_permissions SET permissions='["screen:finance","fn:manage_finance","fn:use_bank_accounts"]' WHERE user_id=u;
 IF can_work_os_commercial(os) THEN RAISE EXCEPTION 'Fixture deve ter somente permissão financeira'; END IF;
 request:=gen_random_uuid();
 reply:=bill_os_receive_payment(os,request,root,NULL,300,0,account,'pix','2026-11-26','2026-12-26',NULL,5,'Tarifa QA','Pagamento 1',true);
 IF (reply->>'remaining')::numeric<>400 THEN RAISE EXCEPTION 'Saldo após 300 deveria ser 400'; END IF;
 IF bill_os_receive_payment(os,request,root,NULL,300,0,account,'pix','2026-11-26','2026-12-26',NULL,5,'Tarifa QA','Pagamento 1',true)<>reply THEN RAISE EXCEPTION 'Replay divergente'; END IF;
 IF (SELECT amount FROM financial_transactions WHERE id=root)<>700 OR (SELECT amount_received FROM financial_transactions WHERE id=root)<>300
  OR (SELECT is_paid FROM financial_transactions WHERE id=root) THEN RAISE EXCEPTION 'Conta de 700 deve continuar aberta com 300 recebidos'; END IF;
 SELECT id INTO child FROM financial_transactions WHERE parent_transaction_id=root AND category='Recebimento parcial';
 receipt:=get_financial_payment_receipt(child);
 IF (receipt->>'received')::numeric<>300 OR NOT (receipt->>'is_partial')::boolean OR (receipt->>'remaining')::numeric<>400 THEN RAISE EXCEPTION 'Recibo parcial incorreto'; END IF;
 IF (SELECT count(*) FROM financial_transactions WHERE parent_transaction_id=child AND amount=5 AND cost_center_id=cc)<>1 THEN RAISE EXCEPTION 'Tarifa duplicada ou sem centro'; END IF;
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),root,NULL,300,0,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
  RAISE EXCEPTION 'Base antiga aceita'; EXCEPTION WHEN SQLSTATE 'OSC01' THEN NULL; END;
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),root,NULL,401,300,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
  RAISE EXCEPTION 'Recebeu além do saldo'; EXCEPTION WHEN SQLSTATE 'OSC03' THEN NULL; END;
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),NULL,3300,300,NULL,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
  RAISE EXCEPTION 'Financeiro criou nova dívida por atalho'; EXCEPTION WHEN SQLSTATE 'OSC03' THEN NULL; END;
 -- Cobrança viva continua sendo tratada no Financeiro depois da baixa manual.
 INSERT INTO tenant_charges(company_id,customer_id,source_type,source_id,value,status,billing_type)
 VALUES(c,customer,'receivable',root,400,'PENDING','PIX');
 UPDATE user_permissions SET permissions='["*"]' WHERE user_id=u;
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),root,3300,300,300,account,'pix','2026-11-26');
  RAISE EXCEPTION 'OS recebeu ignorando cobrança'; EXCEPTION WHEN SQLSTATE 'OSC02' THEN NULL; END;
 reply:=bill_os_receive_payment(os,gen_random_uuid(),root,NULL,300,300,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
 IF (reply->>'remaining')::numeric<>100 OR NOT EXISTS(SELECT 1 FROM tenant_charges WHERE source_id=root AND status='PENDING') THEN RAISE EXCEPTION 'Tratamento da cobrança ativa alterado'; END IF;
 -- Volta a esse ponto para testar também o caminho sem cobrança na mesma conta.
 DELETE FROM financial_transactions WHERE parent_transaction_id=root AND notes IS NULL;
 DELETE FROM tenant_charges WHERE source_id=root;
 -- Próxima baixa pela OS e última pelo Financeiro, na mesma conta.
 UPDATE user_permissions SET permissions='["*"]' WHERE user_id=u;
 reply:=bill_os_receive_payment(os,gen_random_uuid(),root,3300,300,300,account,'pix','2026-11-26');
 IF (reply->>'remaining')::numeric<>100 OR (SELECT is_paid FROM financial_transactions WHERE id=root) THEN RAISE EXCEPTION 'Segundo parcial deveria deixar 100'; END IF;
 UPDATE user_permissions SET permissions='["screen:finance","fn:manage_finance","fn:use_bank_accounts"]' WHERE user_id=u;
 reply:=bill_os_receive_payment(os,gen_random_uuid(),root,NULL,100,600,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
 IF (reply->>'remaining')::numeric<>0 OR NOT (SELECT is_paid FROM financial_transactions WHERE id=root) THEN RAISE EXCEPTION 'Quitação incorreta'; END IF;
 IF (SELECT amount FROM financial_transactions WHERE id=root)<>700 OR (SELECT count(*) FROM financial_transactions WHERE parent_transaction_id=root AND category='Recebimento parcial')<>3 THEN RAISE EXCEPTION 'Dívida alterada ou pagamento repetido'; END IF;
 IF EXISTS(SELECT 1 FROM financial_transactions WHERE parent_transaction_id=root AND cost_center_id IS DISTINCT FROM cc) THEN RAISE EXCEPTION 'Centro perdido'; END IF;
 IF (SELECT amount FROM financial_transactions WHERE id=old)<>2600 OR NOT (SELECT is_paid FROM financial_transactions WHERE id=old) THEN RAISE EXCEPTION 'Recebimento antigo alterado'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),root,NULL,1,700,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
  RAISE EXCEPTION 'Cruzou empresa'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 UPDATE profiles SET is_active=false WHERE user_id=u;
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),root,NULL,1,700,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
  RAISE EXCEPTION 'Perfil inativo recebeu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE profiles SET is_active=true WHERE user_id=u;
 UPDATE user_permissions SET permissions='[]' WHERE user_id=u;
 BEGIN PERFORM bill_os_receive_payment(os,gen_random_uuid(),root,NULL,1,700,account,'pix','2026-11-26',NULL,NULL,0,NULL,NULL,true);
  RAISE EXCEPTION 'Sem permissão recebeu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;$test$;
ROLLBACK;
