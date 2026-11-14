-- Gate 2: ataques entre tenants/permissoes/locais e preservacao do Kardex.
BEGIN;

DO $acl$
BEGIN
  IF has_function_privilege('authenticated','public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'writer legado de movimento continua exposto';
  END IF;
  IF has_function_privilege('authenticated','public.receber_ordem_compra(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'writer legado de recebimento continua exposto';
  END IF;
  IF NOT has_function_privilege('authenticated','public.inventory_register_manual_movement_v3(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.inventory_receive_purchase_order_v3(uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.inventory_set_archived_v3(uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC protegida sem grant autenticado';
  END IF;
  IF has_table_privilege('authenticated','public.inventory_movements','INSERT')
     OR has_table_privilege('authenticated','public.inventory_movements','UPDATE')
     OR has_table_privilege('authenticated','public.inventory_movements','DELETE') THEN
    RAISE EXCEPTION 'Kardex continua mutavel diretamente';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='inventory' AND cmd='DELETE'
  ) THEN
    RAISE EXCEPTION 'inventory ainda possui policy de DELETE autenticado';
  END IF;
END
$acl$;

DO $behavior$
DECLARE
  company_a uuid:='1a110000-0000-4000-8000-000000000001';
  company_b uuid:='1a110000-0000-4000-8000-000000000002';
  manager_a uuid:='1a110000-0000-4000-8000-000000000003';
  denied_a uuid:='1a110000-0000-4000-8000-000000000004';
  manager_b uuid:='1a110000-0000-4000-8000-000000000005';
  stock_a uuid:='1a110000-0000-4000-8000-000000000011';
  stock_restricted uuid:='1a110000-0000-4000-8000-000000000012';
  stock_b uuid:='1a110000-0000-4000-8000-000000000013';
  item_a uuid:='1a110000-0000-4000-8000-000000000021';
  item_history uuid:='1a110000-0000-4000-8000-000000000022';
  item_b uuid:='1a110000-0000-4000-8000-000000000023';
  error_state text;
  error_detail text;
  history_before bigint;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',manager_a,'authenticated','authenticated','inventory-manager-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',denied_a,'authenticated','authenticated','inventory-denied-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',manager_b,'authenticated','authenticated','inventory-manager-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (company_a,'Estoque QA A','active'),(company_b,'Estoque QA B','active');
  UPDATE public.profiles SET company_id=company_a,is_active=true WHERE user_id IN(manager_a,denied_a);
  UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=manager_b;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (manager_a,'comercial'),(denied_a,'comercial'),(manager_b,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (manager_a,'["screen:inventory","fn:manage_inventory"]',true),
    (denied_a,'[]',true),
    (manager_b,'["screen:inventory","fn:manage_inventory"]',true);
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock_a,company_a,'Principal A',true),
    (stock_restricted,company_a,'Restrito A',false),
    (stock_b,company_b,'Principal B',true);
  -- Uma ACL de terceiro torna o local restrito para manager_a.
  INSERT INTO public.stock_access(company_id,stock_id,user_id)
  VALUES(company_a,stock_restricted,denied_a);
  INSERT INTO public.inventory(id,company_id,name,unit,quantity) VALUES
    (item_a,company_a,'Material A','un',0),
    (item_history,company_a,'Material com histórico','un',0),
    (item_b,company_b,'Material B','un',0);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_a,'role','authenticated')::text,true);
  PERFORM public.inventory_register_manual_movement_v3(item_a,'entrada',1,NULL,NULL,'Gate 2',NULL,NULL,stock_a);

  -- Saldo impede arquivar.
  error_state:=NULL; error_detail:=NULL;
  BEGIN
    PERFORM public.inventory_set_archived_v3(item_a,true);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_detail=PG_EXCEPTION_DETAIL;
  END;
  IF error_state IS DISTINCT FROM '23514' OR error_detail IS DISTINCT FROM 'code=inventory_archive_has_balance' THEN
    RAISE EXCEPTION 'arquivamento com saldo nao falhou fechado: %, %',error_state,error_detail;
  END IF;

  -- Outro tenant nao movimenta por ID adivinhado.
  error_state:=NULL; error_detail:=NULL;
  BEGIN
    PERFORM public.inventory_register_manual_movement_v3(item_b,'entrada',1,NULL,NULL,NULL,NULL,NULL,stock_b);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_detail=PG_EXCEPTION_DETAIL;
  END;
  IF error_state IS DISTINCT FROM '42501' OR error_detail IS DISTINCT FROM 'code=inventory_tenant_denied' THEN
    RAISE EXCEPTION 'ataque entre tenants nao foi bloqueado: %, %',error_state,error_detail;
  END IF;

  -- Local restrito nao aceita movimento mesmo no tenant correto.
  error_state:=NULL; error_detail:=NULL;
  BEGIN
    PERFORM public.inventory_register_manual_movement_v3(item_a,'entrada',1,NULL,NULL,NULL,NULL,NULL,stock_restricted);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_detail=PG_EXCEPTION_DETAIL;
  END;
  IF error_state IS DISTINCT FROM '42501' OR error_detail IS DISTINCT FROM 'code=inventory_stock_denied' THEN
    RAISE EXCEPTION 'ACL do local nao bloqueou o writer: %, %',error_state,error_detail;
  END IF;

  -- Usuario sem tela/permissao funcional falha antes de tocar saldo.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',denied_a,'role','authenticated')::text,true);
  error_state:=NULL; error_detail:=NULL;
  BEGIN
    PERFORM public.inventory_register_manual_movement_v3(item_a,'entrada',1,NULL,NULL,NULL,NULL,NULL,stock_a);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_detail=PG_EXCEPTION_DETAIL;
  END;
  IF error_state IS DISTINCT FROM '42501' OR error_detail IS DISTINCT FROM 'code=inventory_manage_denied' THEN
    RAISE EXCEPTION 'usuario sem permissao movimentou estoque: %, %',error_state,error_detail;
  END IF;

  -- Saldo volta a zero; arquivar preserva as duas pernas do Kardex.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_a,'role','authenticated')::text,true);
  PERFORM public.inventory_register_manual_movement_v3(item_history,'entrada',2,NULL,NULL,'Entrada QA',NULL,NULL,stock_a);
  PERFORM public.inventory_register_manual_movement_v3(item_history,'saida',-2,NULL,NULL,'Saida QA',NULL,NULL,stock_a);
  SELECT count(*) INTO history_before FROM public.inventory_movements WHERE inventory_id=item_history;
  PERFORM public.inventory_set_archived_v3(item_history,true);
  IF (SELECT archived_at FROM public.inventory WHERE id=item_history) IS NULL
     OR (SELECT count(*) FROM public.inventory_movements WHERE inventory_id=item_history)<>history_before THEN
    RAISE EXCEPTION 'arquivamento perdeu cadastro ou Kardex';
  END IF;

  -- Nem owner consegue apagar por acidente um material historico.
  error_state:=NULL; error_detail:=NULL;
  BEGIN
    DELETE FROM public.inventory WHERE id=item_history;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_detail=PG_EXCEPTION_DETAIL;
  END;
  IF error_state IS DISTINCT FROM '23503' OR error_detail IS DISTINCT FROM 'code=inventory_delete_requires_archive' THEN
    RAISE EXCEPTION 'delete fisico de material historico nao foi bloqueado: %, %',error_state,error_detail;
  END IF;
END
$behavior$;

-- RLS de leitura: tenant B e usuario sem tela veem zero linhas do tenant A.
SELECT set_config('request.jwt.claims','{"sub":"1a110000-0000-4000-8000-000000000005","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $rls_tenant$
BEGIN
  IF EXISTS(SELECT 1 FROM public.inventory WHERE company_id='1a110000-0000-4000-8000-000000000001')
     OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE company_id='1a110000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'RLS vazou estoque/Kardex entre tenants';
  END IF;
END
$rls_tenant$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"1a110000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $rls_permission$
BEGIN
  IF EXISTS(SELECT 1 FROM public.inventory WHERE company_id='1a110000-0000-4000-8000-000000000001')
     OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE company_id='1a110000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'RLS vazou estoque/Kardex para usuario sem tela';
  END IF;
END
$rls_permission$;
RESET ROLE;

ROLLBACK;
