-- Somente fixtures fictícias, sempre ROLLBACK. Depende de 210000/211000/212000.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $test$
DECLARE v_company uuid:='f4162120-0000-4000-8000-000000000001';
 second_company uuid:='f4162120-0000-4000-8000-000000000002';
 closer uuid:='f4162120-0000-4000-8000-000000000003'; sdr uuid:='f4162120-0000-4000-8000-000000000004';
 affiliate uuid:='f4162120-0000-4000-8000-000000000005';
 root_actor uuid:='f4162120-0000-4000-8000-000000000006';
 tenant_actor uuid:='f4162120-0000-4000-8000-000000000007';
 sale_company uuid:='f4162120-0000-4000-8000-000000000008';
 backup_admin uuid:='f4162120-0000-4000-8000-000000000009';
 boundary_paid_at timestamptz:='2026-02-01T03:00:00Z';
 q jsonb; same_quote jsonb; target jsonb; snapshot jsonb; result jsonb;
 denied boolean; n integer; v_paid_at timestamptz:=now()-interval '2 days'; expiry timestamptz;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 IF has_function_privilege('authenticated','public.prepare_initial_subscription_activation(uuid,uuid,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.claim_initial_subscription_activation_payment(uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.apply_subscription_upgrade_payment_legacy_v1(uuid,text,numeric,text)','EXECUTE') THEN
  RAISE EXCEPTION 'RPC inicial exposta ou implementação interna acessível';
 END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM(VALUES(root_actor,'initial-master-212@example.invalid'),(tenant_actor,'initial-tenant-212@example.invalid'),(backup_admin,'initial-backup-212@example.invalid'))u(id,email);
 INSERT INTO public.user_roles(user_id,role) VALUES(root_actor,'super_admin'),(tenant_actor,'admin'),(backup_admin,'admin');
 UPDATE public.profiles SET is_active=true WHERE user_id IN(root_actor,tenant_actor,backup_admin);
 UPDATE public.subscription_plans SET price=197,is_active=true WHERE code='retail_start';
 INSERT INTO public.salespeople(id,name,email) VALUES(closer,'Closer fictício','closer-212@example.invalid'),(sdr,'SDR fictício','sdr-212@example.invalid');
 INSERT INTO public.affiliates(id,name,email,first_payment_pct,recurring_pct,is_active)
 VALUES(affiliate,'Afiliado fictício','affiliate-212@example.invalid',20,10,true);
 INSERT INTO public.companies(id,name,business_core,subscription_status,subscription_plan,subscription_value,
 custom_price,custom_price_permanent,plan_locked,ltv,subscription_expires_at,trial_days)
 VALUES(v_company,'Ativação fictícia','retail','testing','retail_start',197,NULL,false,false,0,now()-interval '1 day',7),
 (second_company,'Segunda ativação fictícia','retail','testing','retail_start',197,NULL,false,false,0,now()+interval '7 days',7),
 (sale_company,'Venda real fictícia','retail','pending_payment','retail_master',999,NULL,false,false,0,now(),0);
 -- O autor pode ser desativado sem violar a proteção do último administrador.
 UPDATE public.profiles SET company_id=v_company WHERE user_id IN(tenant_actor,backup_admin);
 INSERT INTO public.company_modules(company_id,module_code,quantity) VALUES(v_company,'service_operations',1);
 UPDATE public.companies SET salesperson_id=closer,sdr_id=sdr WHERE id IN(v_company,second_company);
 UPDATE public.companies SET affiliate_id=affiliate WHERE id=second_company;
 target:=jsonb_build_object('plan_code','personalizado','monthly_value',300,'billing_cycle','monthly',
 'modules','["basic","finance_advanced","pricing_advanced","service_operations","customer_portal","video_questions"]'::jsonb,
 'max_users',7,'extra_users',2,'nfse_tier',1,'whatsapp_tier',1);
 snapshot:=public.initial_subscription_activation_snapshot(v_company);
 q:=public.prepare_initial_subscription_activation(v_company,tenant_actor,snapshot,target);
 same_quote:=public.prepare_initial_subscription_activation(v_company,tenant_actor,snapshot,target);
 IF q->>'id' IS DISTINCT FROM same_quote->>'id' OR (q->>'amount_due')::numeric<>300
 OR (q->>'credit_amount')::numeric<>0 THEN RAISE EXCEPTION 'Cotação integral não é canônica/idempotente'; END IF;
 IF (SELECT subscription_value FROM public.companies WHERE id=v_company)<>197

 OR public.company_has_module(v_company,'service_operations') THEN RAISE EXCEPTION 'Cotação liberou acesso antes de pagar'; END IF;
 IF EXISTS(SELECT 1 FROM public.salesperson_sales WHERE company_id=v_company)
 OR EXISTS(SELECT 1 FROM public.affiliate_commissions WHERE company_id IN(v_company,second_company)) THEN RAISE EXCEPTION 'Cotação não paga gerou comissão'; END IF;
 denied:=false;
 BEGIN PERFORM public.prepare_initial_subscription_activation(v_company,tenant_actor,snapshot,jsonb_set(target,'{monthly_value}','301'));
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Cotação pendente foi substituída'; END IF;
 -- Perfis desativados e mudanças de quantidade/presença nos módulos invalidam a origem.
 UPDATE public.profiles SET is_active=false WHERE user_id=tenant_actor;
 IF public.claim_initial_subscription_activation_payment((q->>'id')::uuid) THEN RAISE EXCEPTION 'Claim aceitou autor desativado'; END IF;
 UPDATE public.profiles SET is_active=true WHERE user_id=tenant_actor;
 DELETE FROM public.company_modules WHERE company_id=v_company AND module_code='service_operations';
 IF public.claim_initial_subscription_activation_payment((q->>'id')::uuid) THEN RAISE EXCEPTION 'Claim ignorou revogação de módulo'; END IF;
 INSERT INTO public.company_modules(company_id,module_code,quantity) VALUES(v_company,'service_operations',2);
 IF public.claim_initial_subscription_activation_payment((q->>'id')::uuid) THEN RAISE EXCEPTION 'Claim ignorou quantidade alterada'; END IF;
 UPDATE public.company_modules SET quantity=1 WHERE company_id=v_company AND module_code='service_operations';
 IF NOT public.claim_initial_subscription_activation_payment((q->>'id')::uuid)
 OR public.claim_initial_subscription_activation_payment((q->>'id')::uuid) THEN RAISE EXCEPTION 'Claim permitiu dois envios'; END IF;
 -- O próprio transporte pode vincular a assinatura, sem alterar a oferta.
 UPDATE public.companies SET asaas_subscription_id='sub_fictitious_initial' WHERE id=v_company;
 UPDATE public.subscription_change_requests SET payment_creation_state='created',status='payment_pending',
 asaas_payment_id='pay_fictitious_initial',next_renewal_at=now()-interval '1 day' WHERE id=(q->>'id')::uuid;
 INSERT INTO public.subscription_payments(company_id,asaas_payment_id,amount,status,billing_type,billing_cycle,type,subscription_change_request_id)
 VALUES(v_company,NULL,1,'PENDING','CREDIT_CARD','monthly','primeira_venda',(q->>'id')::uuid);
 denied:=false;
 BEGIN PERFORM public.apply_initial_subscription_activation_payment((q->>'id')::uuid,'pay_fictitious_initial',300,'CREDIT_CARD',v_paid_at);
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Pagamento persistido divergente foi sobrescrito'; END IF;
 UPDATE public.subscription_payments SET amount=300 WHERE subscription_change_request_id=(q->>'id')::uuid;
 result:=public.apply_initial_subscription_activation_payment((q->>'id')::uuid,'pay_fictitious_initial',300,'CREDIT_CARD',v_paid_at);
 IF coalesce((result->>'failed')::boolean,false) THEN RAISE EXCEPTION 'Ativação válida falhou: %',result; END IF;
 expiry:=public.compute_next_expiration(v_paid_at,'monthly');
 IF (SELECT subscription_status FROM public.companies WHERE id=v_company)<>'active'
 OR (SELECT subscription_expires_at FROM public.companies WHERE id=v_company) IS DISTINCT FROM expiry
 OR (SELECT ltv FROM public.companies WHERE id=v_company)<>300 THEN RAISE EXCEPTION 'Ativação/âncora/LTV incorretos'; END IF;
 IF NOT public.company_has_module(v_company,'service_operations')
 OR NOT EXISTS(SELECT 1 FROM public.service_types WHERE company_id=v_company)
 OR NOT EXISTS(SELECT 1 FROM public.equipment_field_config WHERE company_id=v_company) THEN RAISE EXCEPTION 'Adicional pago não recebeu seed após vigência'; END IF;
 SELECT count(*) INTO n FROM public.company_modules WHERE company_id=v_company;
 IF n<>6 OR EXISTS(SELECT 1 FROM public.company_modules WHERE company_id=v_company AND module_code<>ALL(ARRAY['basic','finance_advanced','pricing_advanced','service_operations','customer_portal','video_questions'])) THEN
  RAISE EXCEPTION 'Alvo pago não substituiu exatamente os módulos anteriores';
 END IF;
 IF (SELECT type FROM public.subscription_payments WHERE asaas_payment_id='pay_fictitious_initial')<>'primeira_venda'
 OR (SELECT paid_at FROM public.subscription_payments WHERE asaas_payment_id='pay_fictitious_initial') IS DISTINCT FROM v_paid_at
 OR (SELECT category FROM public.admin_financial_transactions WHERE asaas_transaction_id='pay_fictitious_initial' AND type='income')<>'sale' THEN
  RAISE EXCEPTION 'Classificação/paid_at de primeira venda incorretos';
 END IF;
 result:=public.apply_subscription_upgrade_payment((q->>'id')::uuid,'pay_fictitious_initial',300,'CREDIT_CARD');
 IF NOT (result->>'already_applied')::boolean OR (SELECT ltv FROM public.companies WHERE id=v_company)<>300
 OR (SELECT count(*) FROM public.company_payments WHERE asaas_payment_id='pay_fictitious_initial')<>1
 OR (SELECT count(*) FROM public.admin_financial_transactions WHERE asaas_transaction_id='pay_fictitious_initial' AND type='income')<>1 THEN
  RAISE EXCEPTION 'Replay duplicou receita/LTV ou bypassou wrapper inicial';
 END IF;
 PERFORM public.record_subscription_first_sale_attribution(v_company,'pay_fictitious_initial');
 PERFORM public.record_subscription_first_sale_attribution(v_company,'pay_fictitious_initial');
 IF (SELECT count(*) FROM public.salesperson_sales WHERE company_id=v_company)<>1
 OR (SELECT commission_amount FROM public.salesperson_sales WHERE company_id=v_company)<>300
 OR (SELECT closer_commission FROM public.salesperson_sales WHERE company_id=v_company)<>240
 OR (SELECT sdr_commission FROM public.salesperson_sales WHERE company_id=v_company)<>60 THEN
  RAISE EXCEPTION 'Comissão mensal/SDR mudou ou duplicou';
 END IF;
 -- Oferta anual: o prazo começa no pagamento, nunca na criação da cotação.
 snapshot:=public.initial_subscription_activation_snapshot(second_company);
 target:=jsonb_build_object('plan_code','retail_start','monthly_value',197,'billing_cycle','yearly',
 'modules',(SELECT included_modules FROM public.subscription_plans WHERE code='retail_start'),'max_users',(SELECT max_users FROM public.subscription_plans WHERE code='retail_start'),'extra_users',0,'nfse_tier',1,'whatsapp_tier',1);
 q:=public.prepare_initial_subscription_activation(second_company,root_actor,snapshot,target);
 IF (q->>'amount_due')::numeric<>1891 THEN RAISE EXCEPTION 'Anual perdeu regra canônica'; END IF;
 UPDATE public.companies SET plan_locked=true WHERE id=second_company;
 IF public.claim_initial_subscription_activation_payment((q->>'id')::uuid) THEN RAISE EXCEPTION 'Claim ignorou edição comercial'; END IF;
 UPDATE public.companies SET plan_locked=false WHERE id=second_company;
 result:=public.apply_initial_subscription_activation_payment((q->>'id')::uuid,'pay_fictitious_yearly',1891,'PIX',boundary_paid_at);
 PERFORM public.record_subscription_first_sale_attribution(second_company,'pay_fictitious_yearly');
 IF EXISTS(SELECT 1 FROM public.salesperson_sales WHERE company_id=second_company)
 OR (SELECT count(*) FROM public.affiliate_commissions WHERE company_id=second_company)<>1
 OR (SELECT kind FROM public.affiliate_commissions WHERE company_id=second_company)<>'first'
 OR (SELECT commission_amount FROM public.affiliate_commissions WHERE company_id=second_company)<>39.40
 OR (SELECT reference_month FROM public.affiliate_commissions WHERE company_id=second_company)
 IS DISTINCT FROM DATE '2026-02-01' THEN
  RAISE EXCEPTION 'Comissão do afiliado/ano/mês real incorreta ou vendedor remunerado junto';
 END IF;
 IF (SELECT subscription_expires_at FROM public.companies WHERE id=second_company)
 IS DISTINCT FROM public.compute_next_expiration(boundary_paid_at,'yearly') THEN RAISE EXCEPTION 'Âncora anual usa cotação vencida'; END IF;
 -- Venda real não vira trial mesmo quando preço=catálogo e o link não está travado.
 snapshot:=public.initial_subscription_activation_snapshot(sale_company);
 denied:=false;
 BEGIN PERFORM public.prepare_initial_subscription_activation(sale_company,root_actor,snapshot,target);
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Venda pending_payment foi reclassificada como trial'; END IF;
 UPDATE public.companies SET subscription_status='testing' WHERE id=sale_company;
 snapshot:=public.initial_subscription_activation_snapshot(sale_company);
 denied:=false;
 BEGIN PERFORM public.prepare_initial_subscription_activation(sale_company,root_actor,snapshot,target);
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Ausência de trial_days permitiu reclassificação'; END IF;
 denied:=false;
 BEGIN PERFORM public.prepare_initial_subscription_activation(sale_company,NULL,snapshot,target);
 EXCEPTION WHEN raise_exception THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Ator ausente passou autorização SQL'; END IF;
 IF public.compute_next_expiration(boundary_paid_at,'monthly') IS DISTINCT FROM '2026-03-01T03:00:00Z'::timestamptz
 OR public.compute_next_expiration(boundary_paid_at,'yearly') IS DISTINCT FROM '2027-02-01T03:00:00Z'::timestamptz THEN
  RAISE EXCEPTION 'Calendário BRT perdeu dia civil na fronteira';
 END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $test$;
ROLLBACK;
