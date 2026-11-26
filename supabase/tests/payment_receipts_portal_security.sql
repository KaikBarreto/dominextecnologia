-- Executar em banco de homologação migrado. Todas as fixtures são revertidas.
BEGIN;
DO $test$
DECLARE company uuid; customer uuid; other_customer uuid; portal uuid; token text; payment uuid; other_payment uuid; charge uuid;
 session_token text:='sessao-ficticia-para-teste-de-recibos'; payload jsonb;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 SELECT id INTO company FROM public.companies WHERE public.company_has_module(id,'customer_portal') ORDER BY id LIMIT 1;
 IF company IS NULL THEN RAISE EXCEPTION 'fixture_company_with_customer_portal_unavailable'; END IF;
 UPDATE public.companies SET subscription_status='active',subscription_expires_at=NULL WHERE id=company;
 INSERT INTO public.customers(company_id,name,customer_type) VALUES(company,'Cliente fictício de recibos','pj') RETURNING id INTO customer;
 INSERT INTO public.customers(company_id,name,customer_type) VALUES(company,'Outro cliente fictício','pj') RETURNING id INTO other_customer;
 SELECT cp.id,cp.token INTO portal,token FROM public.customer_portals cp WHERE cp.customer_id=customer;
 UPDATE public.customer_portals SET is_active=true,is_public=true,password_enabled=false,permissions='{"charges":true}' WHERE id=portal;
 INSERT INTO public.financial_transactions(company_id,customer_id,transaction_type,description,amount,is_paid,paid_date,transaction_date,origin)
 VALUES(company,customer,'entrada','Recebimento fictício',100,true,'2026-11-26','2026-11-26','manual') RETURNING id INTO payment;
 INSERT INTO public.financial_transactions(company_id,customer_id,transaction_type,description,amount,is_paid,paid_date,transaction_date,origin)
 VALUES(company,other_customer,'entrada','Outro cliente',100,true,'2026-11-26','2026-11-26','manual') RETURNING id INTO other_payment;
 INSERT INTO public.tenant_charges(company_id,customer_id,source_type,value,status,payment_date,billing_type,description)
 VALUES(company,customer,'manual',250,'CONFIRMED','2026-11-26T12:00Z','PIX','Cobrança fictícia') RETURNING id INTO charge;
 payload:=public.get_customer_portal_payments(token,NULL);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload) p WHERE p->>'id'=payment::text) OR
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload) p WHERE p->>'id'=charge::text) OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(payload) p WHERE p->>'id'=other_payment::text) THEN RAISE EXCEPTION 'Lista perdeu pagamento ou vazou outro cliente'; END IF;
 PERFORM public.get_customer_portal_payment_receipt(token,NULL,'transaction',payment);
 PERFORM public.get_customer_portal_payment_receipt(token,NULL,'charge',charge);
 BEGIN PERFORM public.get_customer_portal_payment_receipt(token,NULL,'transaction',other_payment); RAISE EXCEPTION 'Recibo de outro cliente'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.customer_portals SET permissions='{"charges":false}' WHERE id=portal;
 BEGIN PERFORM public.get_customer_portal_payments(token,NULL); RAISE EXCEPTION 'Permissão financeira ocultada foi ignorada'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.customer_portals SET permissions='{"charges":true}',password_enabled=true,public_sections='{"service_orders":true}' WHERE id=portal;
 BEGIN PERFORM public.get_customer_portal_payment_receipt(token,NULL,'transaction',payment); RAISE EXCEPTION 'Seção com senha vazou recibo'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 INSERT INTO public.customer_portal_sessions(portal_id,token_hash,expires_at) VALUES(portal,encode(extensions.digest(session_token,'sha256'),'hex'),now()+interval '1 hour');
 PERFORM public.get_customer_portal_payment_receipt(token,session_token,'transaction',payment);
 UPDATE public.customer_portal_sessions SET expires_at=now()-interval '1 minute' WHERE portal_id=portal;
 BEGIN PERFORM public.get_customer_portal_payment_receipt(token,session_token,'transaction',payment); RAISE EXCEPTION 'Sessão expirada emitiu recibo'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.customer_portals SET password_enabled=false,is_public=false WHERE id=portal;
 BEGIN PERFORM public.get_customer_portal_payments(token,NULL); RAISE EXCEPTION 'Portal privado vazou pagamentos'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.customer_portals SET is_public=true,is_active=false WHERE id=portal;
 BEGIN PERFORM public.get_customer_portal_payments(token,NULL); RAISE EXCEPTION 'Portal inativo vazou pagamentos'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 UPDATE public.customer_portals SET is_active=true WHERE id=portal;
 UPDATE public.companies SET subscription_status='cancelled' WHERE id=company;
 BEGIN PERFORM public.get_customer_portal_payment_receipt(token,NULL,'charge',charge); RAISE EXCEPTION 'Assinatura inválida emitiu recibo'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END;
$test$;
ROLLBACK;
