-- Executar em transação descartável; não altera dados de cliente.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION public.test_business_core_definer_20261116(p_action text,p_company uuid,p_id uuid,p_parent uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_action='insert' THEN INSERT INTO public.service_types(company_id,name,color,requires_equipment,is_active) VALUES(p_company,'Tentativa definer','#000000',false,true);
 ELSIF p_action='move_item' THEN UPDATE public.quote_items SET quote_id=p_parent WHERE id=p_id;
 ELSIF p_action='orphan_item' THEN INSERT INTO public.quote_items(id,quote_id,description) VALUES(p_id,p_parent,'Origem inexistente');
 ELSIF p_action='contract_insert' THEN INSERT INTO public.contracts(id,company_id,customer_id,name,start_date) VALUES(p_id,p_company,p_parent,'Contrato de teste autorizado',current_date);
 ELSIF p_action='contract_order' THEN INSERT INTO public.service_orders(id,company_id,customer_id,contract_id,origin,scheduled_date,order_number) SELECT p_id,p_company,customer_id,id,'contract',current_date,2146210030 FROM public.contracts WHERE id=p_parent;
 ELSIF p_action='contract_item_insert' THEN INSERT INTO public.contract_items(contract_id,item_name) VALUES(p_parent,'Tentativa de item contratual');
 ELSIF p_action='generic_document' THEN INSERT INTO public.service_order_pmoc_documents(id,company_id,service_order_id,doc_type,version,content_hash,pdf_storage_path,file_name,snapshot) VALUES(p_id,p_company,p_parent,'relatorio_servico',42,repeat('b',64),p_company::text||'/fixture-generico.pdf','fixture-generico.pdf','{}');
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.test_business_core_definer_20261116(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_business_core_definer_20261116(text,uuid,uuid,uuid) TO authenticated;
DO $behavior$
DECLARE c_service uuid:='f4162100-0000-4000-8000-000000000001';
 c_retail uuid:='f4162100-0000-4000-8000-000000000002';
 actor uuid:='f4162100-0000-4000-8000-000000000003';
 another uuid:='f4162100-0000-4000-8000-000000000004';
 root_actor uuid:='f4162100-0000-4000-8000-000000000005';
 quote_service uuid:='f4162100-0000-4000-8000-000000000006'; quote_retail uuid:='f4162100-0000-4000-8000-000000000007';
 item_retail uuid:='f4162100-0000-4000-8000-000000000008'; item_service uuid:='f4162100-0000-4000-8000-000000000009';
 cascade_customer uuid:='f4162100-0000-4000-8000-000000000011'; cascade_equipment uuid:='f4162100-0000-4000-8000-000000000012';
 affiliate_uuid uuid:='f4162100-0000-4000-8000-000000000013'; affiliate_token uuid; paid_affiliate_token uuid;
 order_retail uuid:='f4162100-0000-4000-8000-000000000014'; activity_retail uuid:='f4162100-0000-4000-8000-000000000015';
 customer_retail uuid:='f4162100-0000-4000-8000-000000000021'; customer_service uuid:='f4162100-0000-4000-8000-000000000022';
 contract_retail uuid:='f4162100-0000-4000-8000-000000000023'; contract_service uuid:='f4162100-0000-4000-8000-000000000024';
 contract_item_retail uuid:='f4162100-0000-4000-8000-000000000025'; generic_doc uuid:='f4162100-0000-4000-8000-000000000026'; certificate_doc uuid:='f4162100-0000-4000-8000-000000000027';
 expired_retail uuid:='f4162100-0000-4000-8000-000000000041';
 new_contract uuid:='f4162100-0000-4000-8000-000000000028';
 old_contract_order uuid:='f4162100-0000-4000-8000-000000000029'; new_contract_order uuid:='f4162100-0000-4000-8000-000000000030';
 generic_template uuid:='f4162100-0000-4000-8000-000000000031'; norm_template uuid:='f4162100-0000-4000-8000-000000000032'; generic_question uuid:='f4162100-0000-4000-8000-000000000033';
 offer_token uuid; offer jsonb; denied boolean; n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c_service,c_retail)) THEN RAISE EXCEPTION 'Fixture já existe'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM(VALUES(actor,'core-retail@example.invalid'),(another,'core-other@example.invalid'),(root_actor,'core-master@example.invalid'))u(id,email);
 INSERT INTO public.companies(id,name,subscription_status,subscription_plan,subscription_expires_at)
 VALUES(c_service,'Serviços fictício','active','start',now()+interval '10 days');
 INSERT INTO public.companies(id,name,business_core,subscription_status,subscription_plan,subscription_expires_at)
 VALUES(c_retail,'Loja fictícia','retail','testing','retail_start',now()+interval '7 days');
 UPDATE public.profiles SET company_id=c_retail,is_active=true WHERE user_id=actor;
 UPDATE public.profiles SET company_id=c_service,is_active=true WHERE user_id=another;
 INSERT INTO public.user_roles(user_id,role) VALUES(actor,'admin'),(another,'admin'),(root_actor,'super_admin');
 IF (SELECT business_core FROM public.companies WHERE id=c_service)<>'services' THEN RAISE EXCEPTION 'Legado mudou de núcleo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans retail JOIN public.subscription_plans services ON services.code='start'
  WHERE retail.code='retail_start' AND retail.business_core='retail' AND retail.price=services.price
   AND retail.max_users=services.max_users AND retail.is_active=services.is_active) THEN RAISE EXCEPTION 'Kit Loja Start não herdou o preço-base aprovado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_modules services JOIN public.subscription_modules pdv ON pdv.code='pdv' WHERE services.code='service_operations' AND services.price IS NOT DISTINCT FROM pdv.price AND services.is_active IS NOT DISTINCT FROM pdv.is_active) THEN RAISE EXCEPTION 'Adicional Serviços não herdou preço/ativação do PDV'; END IF;
 IF (SELECT business_core_version FROM public.companies WHERE id=c_service)<>2 THEN RAISE EXCEPTION 'Nova empresa não recebeu contrato v2'; END IF;
 UPDATE public.companies SET subscription_status='testing' WHERE id=c_service;
 IF public.company_has_module(c_service,'pdv') THEN RAISE EXCEPTION 'Trial Serviços novo ativou PDV sem escolha'; END IF;
 UPDATE public.companies SET subscription_status='active' WHERE id=c_service;
 denied:=false;
 BEGIN UPDATE public.companies SET business_core_version=1 WHERE id=c_service; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Novo contrato foi rebaixado ao trial legado'; END IF;
 IF NOT public.company_has_module(c_retail,'pdv') OR public.company_has_module(c_retail,'service_operations') OR public.company_has_module(c_retail,'contracts') THEN RAISE EXCEPTION 'Trial Loja concedeu núcleo errado'; END IF;
 IF NOT public.company_has_module(c_service,'service_operations') OR public.company_has_module(c_service,'pdv') THEN RAISE EXCEPTION 'Serviços perdeu contrato ou ganhou PDV'; END IF;
 IF EXISTS(SELECT 1 FROM public.equipment_field_config WHERE company_id=c_retail) THEN RAISE EXCEPTION 'Loja recebeu seed de equipamentos'; END IF;
 PERFORM public.seed_company_catalog(c_retail,'pt-br');
 PERFORM public.seed_company_catalog(c_service,'pt-br');
 IF EXISTS(SELECT 1 FROM public.service_types WHERE company_id=c_retail) OR NOT EXISTS(SELECT 1 FROM public.service_types WHERE company_id=c_service) THEN RAISE EXCEPTION 'Seed não respeita núcleo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE company_id=c_retail) THEN RAISE EXCEPTION 'Loja não recebeu PDV'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_terminals t JOIN public.company_settings settings ON settings.company_id=t.company_id
  WHERE t.company_id=c_retail AND t.stock_binding_mode='store_default' AND t.stock_id=settings.pdv_default_stock_id) THEN RAISE EXCEPTION 'Primeiro caixa da Loja não herdou estoque automaticamente'; END IF;
 INSERT INTO public.quotes(id,company_id,quote_number) VALUES(quote_service,c_service,2146210001),(quote_retail,c_retail,2146210002);
 INSERT INTO public.quote_items(id,quote_id,description) VALUES(item_service,quote_service,'Serviço fictício'),(item_retail,quote_retail,'Origem bloqueada fictícia');
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(cascade_customer,c_service,'Cliente de cascata fictício',false);
 INSERT INTO public.equipment(id,company_id,customer_id,name) VALUES(cascade_equipment,c_service,cascade_customer,'Equipamento de cascata fictício');
 INSERT INTO public.service_orders(id,company_id,order_number,description) VALUES(order_retail,c_retail,2146210003,'OS histórica fictícia');
 INSERT INTO public.service_order_activities(id,company_id,service_order_id,description) VALUES(activity_retail,c_retail,order_retail,'Atividade histórica fictícia');

 denied:=false;
 BEGIN UPDATE public.companies SET business_core='services' WHERE id=c_retail; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Perfil alterado depois da criação'; END IF;
 denied:=false;
 BEGIN UPDATE public.companies SET subscription_plan='master' WHERE id=c_retail; EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Plano de outro núcleo aceito'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN INSERT INTO public.service_types(company_id,name,color,requires_equipment,is_active) VALUES(c_retail,'Negado','#000000',false,true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'RLS/trigger permitiu serviço no varejo sem addon'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('insert',c_retail,NULL,NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'SECURITY DEFINER ignorou núcleo de Serviços'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('orphan_item',NULL,'f4162100-0000-4000-8000-000000000010','f4162100-0000-4000-8000-000000000099'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Filho sem origem passou por SECURITY DEFINER'; END IF;
 SELECT count(*) INTO n FROM public.service_types WHERE company_id=c_service;
 IF n<>0 THEN RAISE EXCEPTION 'Leitura cruzada de serviços'; END IF;
 denied:=false;
 BEGIN PERFORM public.create_registration_core_offer_v1('retail','{}'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Administrador tenant gerou condições comerciais master'; END IF;
 denied:=false;
 BEGIN INSERT INTO public.service_core_delete_context_v1(backend_pid,transaction_id,parent_table,parent_id,company_id,actor_id,actor_role)
 VALUES(pg_backend_pid(),txid_current(),'quotes',quote_service,c_service,actor,'authenticated');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Usuário forjou contexto privado de exclusão'; END IF;
 SELECT count(*) INTO n FROM public.quote_items WHERE id=item_retail;
 IF n<>0 THEN RAISE EXCEPTION 'Filho quote_items vazou sem Serviços'; END IF;
 SELECT count(*) INTO n FROM public.service_order_activities WHERE id=activity_retail;
 IF n<>0 THEN RAISE EXCEPTION 'Atividade company_id vazou sem Serviços'; END IF;
 IF public.service_core_can_read_row_v1(jsonb_build_object('quote_id','f4162100-0000-4000-8000-000000000099'),'quote_items') THEN RAISE EXCEPTION 'Orfão de leitura não falhou fechado'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',another)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('move_item',NULL,item_retail,quote_service); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'UPDATE de origem bloqueada para destino permitido escapou do guard'; END IF;
 -- Serviços continua podendo excluir um orçamento com filhos em cascata.
 DELETE FROM public.quotes WHERE id=quote_service;
 IF EXISTS(SELECT 1 FROM public.quote_items WHERE id=item_service) THEN RAISE EXCEPTION 'Cascata de Serviços não concluiu'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()) THEN RAISE EXCEPTION 'Contexto de cascata escapou da exclusão'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',another)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 DELETE FROM public.customers WHERE id=cascade_customer;
 IF EXISTS(SELECT 1 FROM public.equipment WHERE id=cascade_equipment) THEN RAISE EXCEPTION 'Cascata externa cliente/equipamento não concluiu'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()) THEN RAISE EXCEPTION 'Cascata externa default deixou contexto'; END IF;
 -- Mesmo caso com constraints IMMEDIATE antes da operação.
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET CONSTRAINTS ALL IMMEDIATE;
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(cascade_customer,c_service,'Cliente imediato fictício',false);
 INSERT INTO public.equipment(id,company_id,customer_id,name) VALUES(cascade_equipment,c_service,cascade_customer,'Equipamento imediato fictício');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',another)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 DELETE FROM public.customers WHERE id=cascade_customer;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.equipment WHERE id=cascade_equipment) OR EXISTS(SELECT 1 FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()) THEN RAISE EXCEPTION 'Cascata IMMEDIATE não concluiu/limpou contexto'; END IF;
 -- E com DEFERRED→IMMEDIATE depois da operação.
 SET CONSTRAINTS ALL DEFERRED;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(cascade_customer,c_service,'Cliente deferred fictício',false);
 INSERT INTO public.equipment(id,company_id,customer_id,name) VALUES(cascade_equipment,c_service,cascade_customer,'Equipamento deferred fictício');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',another)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 DELETE FROM public.customers WHERE id=cascade_customer;
 EXECUTE 'RESET ROLE';
 SET CONSTRAINTS ALL IMMEDIATE;
 IF EXISTS(SELECT 1 FROM public.equipment WHERE id=cascade_equipment) OR EXISTS(SELECT 1 FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()) THEN RAISE EXCEPTION 'Cascata DEFERRED→IMMEDIATE deixou contexto'; END IF;
 SET CONSTRAINTS ALL DEFERRED;

 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',root_actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 offer:=public.create_registration_core_offer_v1('retail','{"link_type":"venda","locked_plan":"retail_start","locked_price":200,"password":"proibido","email":"proibido@example.invalid"}');
 offer_token:=(offer->>'token')::uuid;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 EXECUTE 'SET LOCAL ROLE anon';
 offer:=public.get_public_registration_core_offer_v1(offer_token);
 IF offer->>'business_core'<>'retail' OR offer->'configuration' ? 'password' OR offer->'configuration' ? 'email' THEN RAISE EXCEPTION 'Oferta perdeu escopo ou vazou campo não permitido'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.registration_core_offers SET revoked_at=now() WHERE registration_core_offers.token=offer_token;
 IF public.get_public_registration_core_offer_v1(offer_token) IS NOT NULL THEN RAISE EXCEPTION 'Oferta revogada continua ativa'; END IF;
 INSERT INTO public.affiliates(id,name,user_id,is_active) VALUES(affiliate_uuid,'Afiliado fictício',actor,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',root_actor)::text,true);
 offer:=public.create_registration_core_offer_v1('retail',jsonb_build_object('link_type','teste','affiliate_id',affiliate_uuid::text));
 affiliate_token:=(offer->>'token')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.registration_core_offers WHERE token=affiliate_token AND expires_at='infinity'::timestamptz) THEN RAISE EXCEPTION 'Link simples de afiliado ganhou expiração'; END IF;
 offer:=public.create_registration_core_offer_v1('retail',jsonb_build_object('link_type','venda','affiliate_id',affiliate_uuid::text,'locked_price',200));
 paid_affiliate_token:=(offer->>'token')::uuid;
 IF EXISTS(SELECT 1 FROM public.registration_core_offers WHERE token=paid_affiliate_token AND expires_at='infinity'::timestamptz) THEN RAISE EXCEPTION 'Condição comercial ganhou validade infinita'; END IF;
 offer:=public.create_registration_core_offer_v1('retail',jsonb_build_object('link_type','teste','affiliate_id',affiliate_uuid::text,'trial_days',15));
 IF EXISTS(SELECT 1 FROM public.registration_core_offers WHERE token=(offer->>'token')::uuid AND expires_at='infinity'::timestamptz) THEN RAISE EXCEPTION 'Prazo de teste customizado ganhou validade infinita'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.affiliates SET is_active=false WHERE id=affiliate_uuid;
 IF public.get_public_registration_core_offer_v1(affiliate_token) IS NOT NULL THEN RAISE EXCEPTION 'Afiliado inativo manteve permalink'; END IF;
 UPDATE public.affiliates SET is_active=true WHERE id=affiliate_uuid;
 -- Um emissor comercial que vira apenas afiliado não mantém poder sobre sua oferta antiga.
 UPDATE public.registration_core_offers SET created_by=actor WHERE token=paid_affiliate_token;
 IF public.get_public_registration_core_offer_v1(paid_affiliate_token) IS NOT NULL THEN RAISE EXCEPTION 'Downgrade admin→afiliado manteve oferta de venda'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 offer:=public.create_registration_core_offer_v1('retail',jsonb_build_object('link_type','teste','affiliate_id',affiliate_uuid::text));
 affiliate_token:=(offer->>'token')::uuid;
 IF public.get_public_registration_core_offer_v1(affiliate_token) IS NULL THEN RAISE EXCEPTION 'Afiliado não conseguiu indicar teste'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.affiliates SET user_id=NULL WHERE id=affiliate_uuid;
 IF public.get_public_registration_core_offer_v1(affiliate_token) IS NOT NULL THEN RAISE EXCEPTION 'Emissor perdeu vínculo mas permalink continuou ativo'; END IF;

 -- Contratos/PMOC também são licença real, independente de só ter Serviços.
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer_retail,c_retail,'Cliente loja fictício',false),(customer_service,c_service,'Cliente serviços fictício',false);
 INSERT INTO public.contracts(id,company_id,customer_id,name,start_date) VALUES(contract_retail,c_retail,customer_retail,'Contrato loja fictício',current_date),(contract_service,c_service,customer_service,'Contrato serviços fictício',current_date);
 INSERT INTO public.contract_items(id,contract_id,item_name) VALUES(contract_item_retail,contract_retail,'Item fictício');
 INSERT INTO public.service_orders(id,company_id,customer_id,contract_id,origin,scheduled_date,order_number) VALUES(old_contract_order,c_service,customer_service,contract_service,'contract',current_date,2146210029);
 INSERT INTO public.form_templates(id,company_id,name,is_pmoc_default) VALUES(generic_template,c_service,'Formulário comum com legado PMOC',false),(norm_template,c_service,'Template normativo PMOC',true);
 INSERT INTO public.form_questions(id,template_id,question,pmoc_catalog_activity_id) VALUES(generic_question,generic_template,'Questão histórica',(SELECT id FROM public.pmoc_activity_catalog LIMIT 1));
 INSERT INTO public.contract_attachments(company_id,contract_id,display_name,storage_path) VALUES(c_retail,contract_retail,'Anexo fictício',c_retail::text||'/fixture-anexo.pdf');
 INSERT INTO storage.objects(bucket_id,name) VALUES('contract-attachments',c_retail::text||'/fixture-anexo.pdf');
 INSERT INTO public.service_order_pmoc_documents(id,company_id,service_order_id,doc_type,version,content_hash,pdf_storage_path,file_name,snapshot)
 VALUES(certificate_doc,c_retail,order_retail,'certificado_conformidade',1,repeat('a',64),c_retail::text||'/fixture-certificado.pdf','fixture-certificado.pdf','{}');
 INSERT INTO storage.objects(bucket_id,name) VALUES('pmoc-documents',c_retail::text||'/fixture-certificado.pdf');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.contracts WHERE id=contract_retail) OR EXISTS(SELECT 1 FROM public.contract_items WHERE id=contract_item_retail) OR EXISTS(SELECT 1 FROM public.service_order_pmoc_documents WHERE id=certificate_doc) THEN RAISE EXCEPTION 'Loja sem Serviços leu contratos/PMOC'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('contract_insert',c_retail,new_contract,customer_retail); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Loja sem Serviços escreveu contrato via definer'; END IF;
 IF public.service_core_can_upload_pmoc_storage_v1(c_retail::text||'/novo.pdf') THEN RAISE EXCEPTION 'Loja sem Serviços ganhou upload PMOC'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c_retail,'service_operations');
 IF NOT public.company_has_module(c_retail,'service_operations') OR NOT EXISTS(SELECT 1 FROM public.service_types WHERE company_id=c_retail) OR NOT EXISTS(SELECT 1 FROM public.equipment_field_config WHERE company_id=c_retail) THEN RAISE EXCEPTION 'Contratação de Serviços não completou seed'; END IF;
 -- Trial preserva a avaliação dos adicionais; a fase paga abaixo testa
 -- Serviços contratado sem conceder o adicional Contratos implicitamente.
 IF NOT public.company_has_module(c_retail,'contracts') THEN RAISE EXCEPTION 'Trial com Serviços perdeu avaliação dos adicionais'; END IF;
 UPDATE public.companies SET subscription_status='active' WHERE id=c_retail;
 IF public.company_has_module(c_retail,'contracts') THEN RAISE EXCEPTION 'Loja paga com Serviços ganhou Contratos sem contratação'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.contracts WHERE id=contract_retail) OR EXISTS(SELECT 1 FROM public.contract_items WHERE id=contract_item_retail) OR EXISTS(SELECT 1 FROM public.service_order_pmoc_documents WHERE id=certificate_doc) THEN RAISE EXCEPTION 'Loja com Serviços sem Contratos leu contrato/certificado'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('contract_insert',c_retail,new_contract,customer_retail); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Loja com Serviços sem Contratos escreveu contrato'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='pmoc-documents' AND name=c_retail::text||'/fixture-certificado.pdf') THEN RAISE EXCEPTION 'Certificado vazou pelo storage sem licença'; END IF;
 -- Relatório genérico de OS segue funcionando sem contratar PMOC.
 PERFORM public.test_business_core_definer_20261116('generic_document',c_retail,generic_doc,order_retail);
 IF NOT EXISTS(SELECT 1 FROM public.service_order_pmoc_documents WHERE id=generic_doc) THEN RAISE EXCEPTION 'Relatório comum de OS foi bloqueado por Contratos'; END IF;
 IF NOT public.service_core_can_read_pmoc_storage_v1(c_retail::text||'/fixture-generico.pdf') OR NOT public.service_core_can_upload_pmoc_storage_v1(c_retail::text||'/novo.pdf') THEN RAISE EXCEPTION 'Origem de relatório comum de OS foi bloqueada'; END IF;
 IF public.service_core_can_read_pmoc_storage_v1(c_retail::text||'/sem-metadata.pdf') THEN RAISE EXCEPTION 'Arquivo sem documento ficou legível'; END IF;
 IF public.service_core_can_upload_contract_storage_v1(c_retail::text||'/novo-anexo.pdf') OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='contract-attachments' AND name=c_retail::text||'/fixture-anexo.pdf') THEN RAISE EXCEPTION 'Anexo contratual ficou acessível sem Contratos'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- Serviços básico mantém OS antiga de contrato, execução e formulário comum.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',another)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.service_orders WHERE id=old_contract_order) THEN RAISE EXCEPTION 'Histórico de OS contratual sumiu de Serviços básico'; END IF;
 IF EXISTS(SELECT 1 FROM public.form_templates WHERE id=norm_template) OR NOT EXISTS(SELECT 1 FROM public.form_templates WHERE id=generic_template) OR NOT EXISTS(SELECT 1 FROM public.form_questions WHERE id=generic_question) THEN RAISE EXCEPTION 'Licença PMOC alterou formulário genérico histórico'; END IF;
 UPDATE public.service_orders SET status='concluida',completed_at=now() WHERE id=old_contract_order;
 IF NOT EXISTS(SELECT 1 FROM public.service_orders WHERE id=old_contract_order AND status='concluida') THEN RAISE EXCEPTION 'Serviços básico não concluiu OS contratual antiga'; END IF;
 SELECT count(*) INTO n FROM public.service_orders WHERE contract_id=contract_service;
 IF n<>1 THEN RAISE EXCEPTION 'Concluir OS básica gerou visita contratual sem licença'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('contract_order',c_service,new_contract_order,contract_service); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'RPC definer gerou nova visita sem Contratos'; END IF;
 denied:=false;
 BEGIN INSERT INTO public.form_templates(company_id,name,is_pmoc_default) VALUES(c_service,'Norma não licenciada',true); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Novo template normativo dispensou licença Contratos'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c_retail,'contracts'),(c_service,'contracts') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.contracts WHERE id=contract_retail) OR NOT EXISTS(SELECT 1 FROM public.contract_items WHERE id=contract_item_retail) OR NOT EXISTS(SELECT 1 FROM public.service_order_pmoc_documents WHERE id=certificate_doc) THEN RAISE EXCEPTION 'Loja com Serviços/Contratos perdeu leitura'; END IF;
 PERFORM public.test_business_core_definer_20261116('contract_insert',c_retail,new_contract,customer_retail);
 INSERT INTO public.contract_items(contract_id,item_name) VALUES(new_contract,'Filho da cascata contratual');
 IF EXISTS(SELECT 1 FROM public.contracts WHERE id=contract_service) OR public.service_core_can_read_row_v1(jsonb_build_object('contract_id',contract_service),'contract_items') THEN RAISE EXCEPTION 'Contrato cross-tenant vazou'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('contract_item_insert',NULL,NULL,contract_service); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Item contratual cross-tenant foi escrito por definer'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('contract_item_insert',NULL,NULL,'f4162100-0000-4000-8000-000000000099'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Item contratual órfão foi escrito por definer'; END IF;
 denied:=false;
 BEGIN PERFORM public.test_business_core_definer_20261116('contract_insert',c_retail,'f4162100-0000-4000-8000-000000000034',customer_service); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Contrato aceitou cliente de outro tenant'; END IF;
 -- A policy legada ALL do bucket PMOC nega também SELECT autenticado;
 -- o download autorizado usa URL assinada dos geradores já protegidos.
 IF NOT public.service_core_can_read_pmoc_storage_v1(c_retail::text||'/fixture-certificado.pdf') THEN RAISE EXCEPTION 'Contrato licenciado perdeu origem/licença do arquivo'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='pmoc-documents' AND name=c_retail::text||'/fixture-certificado.pdf') THEN RAISE EXCEPTION 'Policy legada de acesso direto PMOC foi afrouxada'; END IF;
 IF NOT public.service_core_can_upload_contract_storage_v1(c_retail::text||'/novo-anexo.pdf') OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='contract-attachments' AND name=c_retail::text||'/fixture-anexo.pdf') THEN RAISE EXCEPTION 'Contrato licenciado perdeu anexos'; END IF;
 DELETE FROM public.contracts WHERE id=new_contract;
 IF EXISTS(SELECT 1 FROM public.contract_items WHERE contract_id=new_contract) THEN RAISE EXCEPTION 'Cascata do contrato licenciado falhou'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',another)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.contracts WHERE id=contract_service) THEN RAISE EXCEPTION 'Serviços com Contratos perdeu acesso anterior'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.companies SET subscription_status='inactive' WHERE id=c_retail;
 IF public.company_has_module(c_retail,'pdv') OR public.company_has_module(c_retail,'service_operations') THEN RAISE EXCEPTION 'Varejo inativo manteve acesso'; END IF;
 -- Pedido de módulo pode preceder o pagamento; não bootstrapar vencido.
 INSERT INTO public.companies(id,name,business_core,subscription_status,subscription_plan,subscription_expires_at)
 VALUES(expired_retail,'Loja de teste vencida','retail','testing','retail_start',now()-interval '2 days');
 INSERT INTO public.company_modules(company_id,module_code) VALUES(expired_retail,'service_operations');
 IF public.company_has_module(expired_retail,'service_operations') OR EXISTS(SELECT 1 FROM public.service_types WHERE company_id=expired_retail) THEN RAISE EXCEPTION 'Módulo pendente liberou operação ou seed antes de pagar'; END IF;
 UPDATE public.companies SET subscription_status='active',subscription_expires_at=now()+interval '10 days' WHERE id=expired_retail;
 PERFORM public.seed_company_catalog(expired_retail,'pt-br');
 IF NOT public.company_has_module(expired_retail,'service_operations') OR NOT EXISTS(SELECT 1 FROM public.service_types WHERE company_id=expired_retail) THEN RAISE EXCEPTION 'Seed pago não recuperou módulo contratado antes da ativação'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger guard JOIN pg_class tbl ON tbl.oid=guard.tgrelid JOIN pg_namespace ns ON ns.oid=tbl.relnamespace
  WHERE ns.nspname='public' AND guard.tgname='guard_service_business_core_v1'
   AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=tbl.oid AND p.polname='business_core_dependency_read_v1' AND p.polpermissive IS FALSE)) THEN
  RAISE EXCEPTION 'Uma tabela de Serviços ficou sem restrição de leitura';
 END IF;
 -- Excluir o emissor fictício não pode ser bloqueado pelos links que criou.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',root_actor)::text,true);
 offer:=public.create_registration_core_offer_v1('retail','{"link_type":"teste"}'::jsonb);
 offer_token:=(offer->>'token')::uuid;
 IF public.get_public_registration_core_offer_v1(offer_token) IS NULL THEN RAISE EXCEPTION 'Oferta do emissor fictício não foi criada'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 DELETE FROM auth.users WHERE id=root_actor;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='guard_service_business_core_v1' AND tgrelid IN ('public.financial_transactions'::regclass,'public.employee_contracts'::regclass)) THEN RAISE EXCEPTION 'Financeiro/RH genérico recebeu licença Contratos'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=root_actor) OR EXISTS(SELECT 1 FROM public.registration_core_offers WHERE created_by=root_actor) THEN RAISE EXCEPTION 'Links bloquearam exclusão do emissor fictício'; END IF;
 IF public.get_public_registration_core_offer_v1(offer_token) IS NOT NULL THEN RAISE EXCEPTION 'Link continuou ativo após excluir seu emissor'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()) THEN RAISE EXCEPTION 'Contexto privado persistiria após fechar a transação'; END IF;
END $behavior$;
ROLLBACK;
