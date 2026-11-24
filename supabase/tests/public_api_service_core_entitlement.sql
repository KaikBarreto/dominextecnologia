-- Fixtures fictícias; nenhum dado persiste após o ROLLBACK.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL statement_timeout='120s';
DO $test$
DECLARE retail uuid:='f4162130-0000-4000-8000-000000000001';
 services uuid:='f4162130-0000-4000-8000-000000000002';
 retail_integration uuid:='f4162130-0000-4000-8000-000000000003';
 services_integration uuid:='f4162130-0000-4000-8000-000000000004';
 customer uuid:='f4162130-0000-4000-8000-000000000005';
 service_type uuid:='f4162130-0000-4000-8000-000000000006';
 payload jsonb; result jsonb; created_id uuid; denied boolean; attempt text;
 starts timestamptz:=date_trunc('day',now()+interval '3 days')+interval '12 hours';
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.companies(id,name,business_core,subscription_status,subscription_plan,subscription_expires_at)
 VALUES(retail,'Loja API fictícia','retail','testing','retail_start',now()+interval '10 days'),
 (services,'Serviços API fictícia','services','active','start',now()+interval '10 days');
 UPDATE public.app_feature_flags SET enabled=false,company_allowlist=ARRAY[retail,services] WHERE key='public_api_v1';
 INSERT INTO public.company_settings(company_id,timezone) VALUES(retail,'America/Sao_Paulo'),(services,'America/Sao_Paulo')
 ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone;
 INSERT INTO public.public_api_integrations(id,company_id,name,scopes,distribution_mode)
 SELECT id,company_id,'Integração API fictícia',ARRAY['catalogs:read','availability:read','customers:resolve','service_orders:create','service_orders:read','crm_cards:read'],'unassigned'
 FROM(VALUES(retail_integration,retail),(services_integration,services)) f(id,company_id);
 INSERT INTO public.customers(id,company_id,name,email,is_deleted) VALUES(customer,retail,'Cliente API fictício','api-core-213@example.invalid',false);
 INSERT INTO public.service_types(id,company_id,name,color,requires_equipment,is_active) VALUES(service_type,retail,'Serviço API fictício','#000000',false,true);
 INSERT INTO public.schedule_booking_settings(company_id,booking_enabled,slot_interval_minutes,default_duration_minutes,minimum_notice_minutes,booking_horizon_days,weekly_hours)
 VALUES(retail,true,30,60,0,60,'{"0":[["00:00","23:59"]],"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]]}'::jsonb);
 payload:=jsonb_build_object('external_id','api-core-213-os','customer',jsonb_build_object('id',customer),
 'service_type_id',service_type,'os_type','manutencao_preventiva','description','Atendimento API fictício',
 'scheduled_at',starts,'duration_minutes',60);
 IF has_function_privilege('service_role','public.public_api_assert_integration(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.public_api_get_catalogs(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Helper privado/RPC pública com privilégios indevidos';
 END IF;
 EXECUTE 'SET LOCAL ROLE service_role';
 -- Scope concedido e chave/tenant habilitados não substituem o núcleo ausente.
 FOREACH attempt IN ARRAY ARRAY['catalog','resources','availability','read','create'] LOOP
  denied:=false;
  BEGIN
   CASE attempt
    WHEN 'catalog' THEN PERFORM public.public_api_get_catalogs(retail_integration);
    WHEN 'resources' THEN PERFORM public.public_api_get_booking_resources(retail_integration);
    WHEN 'availability' THEN PERFORM public.public_api_get_availability(retail_integration,starts,starts+interval '2 hours',60,NULL,NULL);
    WHEN 'read' THEN PERFORM public.public_api_get_service_order(retail_integration,customer,NULL);
    WHEN 'create' THEN PERFORM public.public_api_create_service_order(retail_integration,'api-core-213-key',repeat('a',64),payload);
   END CASE;
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'public_api_service_operations_required' THEN RAISE; END IF;
   denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'API sem núcleo Serviços executou %',attempt; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.service_orders WHERE company_id=retail) THEN RAISE EXCEPTION 'API sem Serviços criou OS'; END IF;
 -- Clientes e CRM preservam os gates anteriores, sem impor Serviços.
 result:=public.public_api_resolve_customer(retail_integration,'{"email":"api-core-213@example.invalid"}');
 IF result->>'id' IS DISTINCT FROM customer::text THEN RAISE EXCEPTION 'Loja perdeu resolução de cliente'; END IF;
 PERFORM public.public_api_get_crm_pipelines(retail_integration);
 PERFORM public.public_api_get_catalogs(services_integration);
 -- Contratar Serviços habilita a mesma integração, sem alargar outro tenant.
 INSERT INTO public.company_modules(company_id,module_code) VALUES(retail,'service_operations');
 result:=public.public_api_get_catalogs(retail_integration);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'service_types') entry WHERE entry->>'id'=service_type::text AND entry->>'requires_equipment'='false') THEN RAISE EXCEPTION 'Catálogo licenciado perdeu contrato'; END IF;
 result:=public.public_api_create_service_order(retail_integration,'api-core-213-key',repeat('a',64),payload);
 created_id:=(result->>'id')::uuid;
 IF created_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.service_orders WHERE id=created_id AND company_id=retail) THEN RAISE EXCEPTION 'API licenciada não criou OS'; END IF;
 PERFORM public.public_api_get_service_order(retail_integration,created_id,NULL);
 DELETE FROM public.company_modules WHERE company_id=retail AND module_code='service_operations';
 denied:=false;
 BEGIN PERFORM public.public_api_create_service_order(retail_integration,'api-core-213-key',repeat('a',64),payload);
 EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='public_api_service_operations_required'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Replay ignorou revogação do núcleo'; END IF;
 -- Nem o módulo contratado abre tenant com assinatura inativa.
 INSERT INTO public.company_modules(company_id,module_code) VALUES(retail,'service_operations');
 UPDATE public.companies SET subscription_status='inactive' WHERE id=retail;
 denied:=false;
 BEGIN PERFORM public.public_api_get_catalogs(retail_integration);
 EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='public_api_tenant_not_entitled'; END;
 IF NOT denied THEN RAISE EXCEPTION 'API licenciada ignorou assinatura inativa'; END IF;
 EXECUTE 'RESET ROLE';
END $test$;
ROLLBACK;
