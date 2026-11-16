-- Catálogo comercial em transação descartável: nunca altera contratos existentes.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='90s';
DO $test$
DECLARE root_actor uuid:='f4162110-0000-4000-8000-000000000001';
 tenant_actor uuid:='f4162110-0000-4000-8000-000000000002';
 probe_company uuid:='f4162110-0000-4000-8000-000000000003';
 snapshot jsonb; other_snapshot jsonb; payload jsonb; stale_payload jsonb; result jsonb;
 before_state jsonb; after_state jsonb; contract_before jsonb; contract_after jsonb;
 addon_before numeric; addon_next numeric; other_active boolean; other_plan uuid; denied boolean; bad_base numeric;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM(VALUES(root_actor,'pricing-master@example.invalid'),(tenant_actor,'pricing-tenant@example.invalid'))u(id,email);
 INSERT INTO public.user_roles(user_id,role) VALUES(root_actor,'super_admin'),(tenant_actor,'admin');
 UPDATE public.profiles SET is_active=true WHERE user_id IN(root_actor,tenant_actor);
 INSERT INTO public.companies(id,name,subscription_status,subscription_plan,subscription_expires_at,subscription_value,custom_price,custom_price_permanent,pending_subscription_value)
 VALUES(probe_company,'Contrato fictício preservado','active','start',now()+interval '10 days',321.45,188.50,true,444.25);
 SELECT jsonb_build_object('value',subscription_value,'custom',custom_price,'permanent',custom_price_permanent,'pending',pending_subscription_value,'plan',subscription_plan,'expires',subscription_expires_at)
 INTO contract_before FROM public.companies WHERE id=probe_company;
 IF has_table_privilege('authenticated','public.subscription_core_pricing','UPDATE')
  OR has_function_privilege('anon','public.admin_get_business_core_pricing_v1(text)','EXECUTE')
  OR has_function_privilege('anon','public.admin_set_business_core_pricing_v1(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Catálogo permite escrita não autorizada'; END IF;
 IF (public.get_business_core_base_price_v1('services')->>'base_price')::numeric<>197
  OR (public.get_business_core_base_price_v1('retail')->>'base_price')::numeric<>197 THEN RAISE EXCEPTION 'Essencial não é197 nos dois kits'; END IF;
 SELECT price INTO addon_before FROM public.subscription_modules WHERE code='pdv';
 IF addon_before IS NULL OR addon_before<=0 OR NOT EXISTS(SELECT 1 FROM public.subscription_modules WHERE code='service_operations' AND price=addon_before) THEN RAISE EXCEPTION 'Adicionais não compartilham o preço canônico'; END IF;
 -- Guardas também valem fora da RPC, mesmo com escrita privilegiada no catálogo.
 denied:=false;
 BEGIN UPDATE public.subscription_modules SET price=198 WHERE code='basic'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST alterou preço fixo da base'; END IF;
 denied:=false;
 BEGIN UPDATE public.subscription_modules SET is_active=false WHERE code='basic'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST desconfigurou a base'; END IF;
 denied:=false;
 BEGIN UPDATE public.subscription_modules SET code='basic_adulterado' WHERE code='basic'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST renomeou identidade econômica da base'; END IF;
 denied:=false;
 BEGIN UPDATE public.subscription_modules SET name='Outro nome' WHERE code='pdv'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST renomeou adicional canônico'; END IF;
 denied:=false;
 BEGIN DELETE FROM public.subscription_modules WHERE code='service_operations'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST apagou adicional espelhado'; END IF;
 denied:=false;
 BEGIN UPDATE public.subscription_modules SET price=addon_before+1 WHERE code='service_operations'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST criou preço independente para Serviços'; END IF;
 denied:=false;
 BEGIN UPDATE public.subscription_plans SET price=198 WHERE code='retail_start'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST alterou preço do Essencial Loja'; END IF;
 denied:=false;
 BEGIN UPDATE public.subscription_plans SET name='Outro plano' WHERE code='start'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST renomeou identidade do Essencial'; END IF;
 denied:=false;
 BEGIN DELETE FROM public.subscription_plans WHERE code='retail_start'; EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'REST apagou Essencial Loja'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',tenant_actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN PERFORM public.admin_get_business_core_pricing_v1('retail'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Administrador do tenant acessou preços comerciais'; END IF;
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1('{"business_core":"retail"}'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Administrador do tenant alterou preços'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',root_actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 snapshot:=public.admin_get_business_core_pricing_v1('retail');
 other_snapshot:=public.admin_get_business_core_pricing_v1('services');
 other_active:=(other_snapshot->'addon'->>'is_active')::boolean;
 addon_next:=addon_before+1;
 payload:=jsonb_build_object('business_core','retail','revision',snapshot->'revision','base_price',197,'expected_base_price',snapshot->'base_price',
  'plans',coalesce((SELECT jsonb_agg(p||jsonb_build_object('expected_price',p->'price','expected_active',p->'is_active')) FROM jsonb_array_elements(snapshot->'plans') p),'[]'::jsonb),
  'addon',snapshot->'addon'||jsonb_build_object('price',addon_next,'is_active',false,'expected_price',snapshot->'addon'->'price','expected_active',snapshot->'addon'->'is_active'));
 -- Nem a RPC de master pode redefinir o preço-base fixo.
 FOREACH bad_base IN ARRAY ARRAY[0,198,200]::numeric[] LOOP
  denied:=false;
  BEGIN PERFORM public.admin_set_business_core_pricing_v1(jsonb_set(payload,'{base_price}',to_jsonb(bad_base))); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'RPC aceitou base diferente de197'; END IF;
 END LOOP;
 stale_payload:=jsonb_build_object('business_core','services','revision',other_snapshot->'revision','base_price',197,'expected_base_price',197,'plans','[]'::jsonb,
  'addon',other_snapshot->'addon'||jsonb_build_object('expected_price',other_snapshot->'addon'->'price','expected_active',other_snapshot->'addon'->'is_active'));
 result:=public.admin_set_business_core_pricing_v1(payload);
 IF (result->>'base_price')::numeric<>197 OR (result->>'revision')::bigint<>(snapshot->>'revision')::bigint+1
  OR (result->'addon'->>'price')::numeric<>addon_next OR (result->'addon'->>'is_active')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Preço compartilhado não persistiu'; END IF;
 snapshot:=public.admin_get_business_core_pricing_v1('services');
 IF (snapshot->'addon'->>'price')::numeric<>addon_next OR (snapshot->'addon'->>'is_active')::boolean IS DISTINCT FROM other_active
  OR (snapshot->>'revision')::bigint<>(other_snapshot->>'revision')::bigint+1 THEN RAISE EXCEPTION 'Outro kit não recebeu preço ou teve disponibilidade alterada'; END IF;
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(payload); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Aceitou revisão antiga do mesmo kit'; END IF;
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(stale_payload); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Aceitou edição antiga após mudar preço no outro kit'; END IF;
 -- Mesmo falsificando revisão atual, o CAS do preço esperado continua fechando.
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(jsonb_set(stale_payload,'{revision}',snapshot->'revision')); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'CAS não conferiu preço canônico de ambos os adicionais'; END IF;
 -- Alteração do mesmo adicional pela outra aba também espelha o preço.
 payload:=jsonb_build_object('business_core','services','revision',snapshot->'revision','base_price',197,'expected_base_price',197,'plans','[]'::jsonb,
  'addon',snapshot->'addon'||jsonb_build_object('price',addon_next+1,'expected_price',snapshot->'addon'->'price','expected_active',snapshot->'addon'->'is_active'));
 result:=public.admin_set_business_core_pricing_v1(payload);
 snapshot:=public.admin_get_business_core_pricing_v1('retail');
 IF (snapshot->'addon'->>'price')::numeric<>addon_next+1 OR (snapshot->'addon'->>'is_active')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Mudança por Serviços não chegou à Loja ou reativou adicional'; END IF;
 -- Preparar snapshot exato e provar rollback após um plano ter sido alterado.
 payload:=jsonb_build_object('business_core','retail','revision',snapshot->'revision','base_price',197,'expected_base_price',197,
  'plans',coalesce((SELECT jsonb_agg(p||jsonb_build_object('expected_price',p->'price','expected_active',p->'is_active')) FROM jsonb_array_elements(snapshot->'plans') p),'[]'::jsonb),
  'addon',snapshot->'addon'||jsonb_build_object('expected_price',snapshot->'addon'->'price','expected_active',snapshot->'addon'->'is_active'));
 EXECUTE 'RESET ROLE';
 SELECT jsonb_build_object('core',(SELECT jsonb_agg(to_jsonb(t) ORDER BY business_core) FROM public.subscription_core_pricing t),
  'modules',(SELECT jsonb_agg(to_jsonb(t) ORDER BY code) FROM public.subscription_modules t),'plans',(SELECT jsonb_agg(to_jsonb(t) ORDER BY code) FROM public.subscription_plans t),
  'history',(SELECT count(*) FROM public.subscription_core_price_history WHERE actor_id=root_actor)) INTO before_state;
 SELECT id INTO other_plan FROM public.subscription_plans WHERE code='start';
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(jsonb_set(payload,'{addon}',(payload->'addon')||'{"price":0,"is_active":true}'::jsonb)); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Aceitou adicional ativo gratuito'; END IF;
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(jsonb_set(jsonb_set(payload,'{plans,0,is_active}',to_jsonb(NOT(payload->'plans'->0->>'is_active')::boolean)),'{addon,price}','-1')); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Aceitou payload parcialmente inválido'; END IF;
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(jsonb_set(payload,'{plans,0,id}',to_jsonb(other_plan::text))); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Alterou plano de outro kit'; END IF;
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(jsonb_set(payload,'{expected_base_price}','198')); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Ignorou CAS do preço-base'; END IF;
 EXECUTE 'RESET ROLE';
 SELECT jsonb_build_object('core',(SELECT jsonb_agg(to_jsonb(t) ORDER BY business_core) FROM public.subscription_core_pricing t),
  'modules',(SELECT jsonb_agg(to_jsonb(t) ORDER BY code) FROM public.subscription_modules t),'plans',(SELECT jsonb_agg(to_jsonb(t) ORDER BY code) FROM public.subscription_plans t),
  'history',(SELECT count(*) FROM public.subscription_core_price_history WHERE actor_id=root_actor)) INTO after_state;
 IF before_state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'Falha deixou alteração parcial ou auditoria indevida'; END IF;
 IF (SELECT count(*) FROM public.subscription_core_price_history WHERE actor_id=root_actor)<>2 THEN RAISE EXCEPTION 'Auditoria duplicada ou ausente'; END IF;
 -- Atualização direta válida no PDV também sincroniza somente o preço.
 SELECT is_active INTO other_active FROM public.subscription_modules WHERE code='service_operations';
 snapshot:=public.admin_get_business_core_pricing_v1('retail');
 payload:=jsonb_build_object('business_core','retail','revision',snapshot->'revision','base_price',197,'expected_base_price',197,'plans','[]'::jsonb,
  'addon',snapshot->'addon'||jsonb_build_object('expected_price',snapshot->'addon'->'price','expected_active',snapshot->'addon'->'is_active'));
 UPDATE public.subscription_modules SET price=addon_before+3 WHERE code='pdv';
 IF NOT EXISTS(SELECT 1 FROM public.subscription_modules WHERE code='service_operations' AND price=addon_before+3 AND is_active IS NOT DISTINCT FROM other_active) THEN RAISE EXCEPTION 'REST canônico não espelhou preço ou acoplou disponibilidade'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN PERFORM public.admin_set_business_core_pricing_v1(payload); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'CAS aceitou preço antigo após alteração REST canônica'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT price FROM public.subscription_modules WHERE code='basic')<>197 OR EXISTS(SELECT 1 FROM public.subscription_plans WHERE code IN ('start','retail_start') AND price<>197)
  OR EXISTS(SELECT 1 FROM public.subscription_core_pricing WHERE base_price IS NOT NULL) THEN RAISE EXCEPTION 'Essencial perdeu fonte canônica fixa'; END IF;
 SELECT jsonb_build_object('value',subscription_value,'custom',custom_price,'permanent',custom_price_permanent,'pending',pending_subscription_value,'plan',subscription_plan,'expires',subscription_expires_at)
 INTO contract_after FROM public.companies WHERE id=probe_company;
 IF contract_before IS DISTINCT FROM contract_after THEN RAISE EXCEPTION 'Catálogo reescreveu contrato persistido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.subscription_modules'::regclass AND tgname='business_core_catalog_lock_v1')
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.subscription_plans'::regclass AND tgname='business_core_catalog_lock_v1') THEN RAISE EXCEPTION 'Editor REST não participa da ordem comum de locks'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $test$;
ROLLBACK;
