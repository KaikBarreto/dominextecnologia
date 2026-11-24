-- Regressão real, exclusivamente com fixtures descartadas por ROLLBACK.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $behavior$
#variable_conflict use_column
<<fixture>>
DECLARE
  company_id uuid := gen_random_uuid();
  foreign_company uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  operator_id uuid := gen_random_uuid();
  foreign_user uuid := gen_random_uuid();
  cash_id uuid := gen_random_uuid();
  foreign_cash uuid := gen_random_uuid();
  terminal_id uuid := gen_random_uuid();
  wrong_terminal uuid := gen_random_uuid();
  foreign_terminal uuid := gen_random_uuid();
  material_id uuid := gen_random_uuid();
  preorder_id uuid := gen_random_uuid();
  stock_id uuid;
  foreign_stock uuid;
  session_id uuid;
  foreign_session uuid;
  order_id uuid;
  counter_order uuid;
  payload jsonb;
  cart jsonb;
  payments jsonb := '[{"method":"dinheiro","amount":10}]';
  base_permissions jsonb := '["screen:pdv","screen:pdv_orders","fn:complete_direct_sale","fn:cover_pdv_order"]';
  denied boolean;
  scenario text;
  use_core boolean;
  request_key text;
  orders_before bigint;
  payments_before bigint;
  custody_before bigint;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated','authenticated',
    id::text || '@example.invalid','',now(),'{}','{}',now(),now(),'','','',''
    FROM unnest(ARRAY[owner_id,operator_id,foreign_user]) id;
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan)
    VALUES(company_id,'Fixture recebimento autorizado','active','personalizado'),
          (foreign_company,'Fixture empresa separada','active','personalizado');
  UPDATE public.profiles p SET company_id = fixture.company_id,is_active = true
    WHERE p.user_id IN(owner_id,operator_id);
  UPDATE public.profiles p SET company_id = foreign_company,is_active = true
    WHERE p.user_id = foreign_user;
  INSERT INTO public.user_roles(user_id,role) VALUES(owner_id,'admin'),(foreign_user,'admin');
  -- Operador sem cargo administrativo, como uma conta com permissões nominais.
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
    VALUES(owner_id,'["*"]',true),(operator_id,base_permissions,true),(foreign_user,'["*"]',true);
  INSERT INTO public.company_modules(company_id,module_code)
    VALUES(company_id,'pdv'),(foreign_company,'pdv');
  SELECT s.id INTO STRICT stock_id FROM public.stocks s
    WHERE s.company_id = fixture.company_id AND s.is_default;
  SELECT s.id INTO STRICT foreign_stock FROM public.stocks s
    WHERE s.company_id = foreign_company AND s.is_default;
  UPDATE public.stocks s SET purpose = 'pdv' WHERE s.id IN(stock_id,foreign_stock);
  INSERT INTO public.stock_access(company_id,stock_id,user_id)
    VALUES(company_id,stock_id,owner_id),(company_id,stock_id,operator_id),
          (foreign_company,foreign_stock,foreign_user);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(cash_id,company_id,'Cofre fictício','caixa',1000,true),
          (foreign_cash,foreign_company,'Cofre separado','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,pdv_mode,pdv_cash_account_id,pdv_strict_cash_tracking)
    VALUES(company_id,'Fixture recebimento','simples',cash_id,false),
          (foreign_company,'Fixture separada','simples',foreign_cash,false)
    ON CONFLICT(company_id) DO UPDATE SET pdv_mode=excluded.pdv_mode,
      pdv_cash_account_id=excluded.pdv_cash_account_id,pdv_strict_cash_tracking=false;
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
    VALUES(terminal_id,company_id,'Terminal fictício',stock_id,true),
          (wrong_terminal,company_id,'Outro terminal',stock_id,true),
          (foreign_terminal,foreign_company,'Terminal separado',foreign_stock,true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price,is_sellable)
    VALUES(material_id,company_id,'FIX-PERM','Material fictício','un',20,3,10,true);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
    VALUES(company_id,material_id,stock_id,20,true);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  payload := public.pdv_open_cash_session_v2(terminal_id,cash_id,0,'permission-open-'||owner_id::text);
  session_id := (payload->>'session_id')::uuid;
  IF session_id IS NULL THEN RAISE EXCEPTION 'A fixture não abriu o caixa.'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',foreign_user,'role','authenticated')::text,true);
  payload := public.pdv_open_cash_session_v2(foreign_terminal,foreign_cash,0,'permission-foreign-'||foreign_user::text);
  foreign_session := (payload->>'session_id')::uuid;
  cart := jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
    'inventory_id',material_id,'stock_id',stock_id,'quantity',1,'unit_price',10,'discount_amount',0)),
    'order_discount_amount',0);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator_id,'role','authenticated')::text,true);
  -- A mesma autorização deve valer na entrada pública e no core privado.
  FOREACH use_core IN ARRAY ARRAY[false,true] LOOP
    denied := false;
    BEGIN
      IF use_core THEN
        PERFORM public.pdv_complete_direct_sale_v2(terminal_id,session_id,cash_id,NULL,cart,payments,'permission-denied-core');
      ELSE
        PERFORM public.pdv_complete_direct_sale_rollout_v2(terminal_id,session_id,cash_id,NULL,cart,payments,'permission-denied-public');
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Operador sem permissão usou caixa alheio.'; END IF;
  END LOOP;

  UPDATE public.user_permissions u SET permissions=base_permissions||'["fn:operate_other_pdv_cash"]'::jsonb
    WHERE u.user_id=operator_id;
  IF public.is_admin_or_gestor(operator_id) OR NOT public.pdv_can_operate_other_cash_v2(operator_id) THEN
    RAISE EXCEPTION 'A fixture deve representar operador nominal sem cargo administrativo.';
  END IF;
  payload := public.pdv_get_direct_sale_catalog_v3();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'sessions') s WHERE s->>'id'=session_id::text) THEN
    RAISE EXCEPTION 'Catálogo não ofereceu a sessão já autorizada.';
  END IF;

  request_key := 'permission-direct-'||operator_id::text;
  payload := public.pdv_complete_direct_sale_rollout_v2(terminal_id,session_id,cash_id,NULL,cart,payments,request_key);
  order_id := (payload->>'order_id')::uuid;
  IF order_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.pdv_orders o
    WHERE o.id=order_id AND o.company_id=fixture.company_id
      AND o.salesperson_id=operator_id AND o.cash_session_id=session_id) THEN
    RAISE EXCEPTION 'Venda autorizada não preservou vendedor e sessão.';
  END IF;
  payload := public.pdv_complete_direct_sale_rollout_v2(terminal_id,session_id,cash_id,NULL,cart,payments,request_key);
  IF (payload->>'order_id')::uuid IS DISTINCT FROM order_id
    OR (SELECT count(*) FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id)<>1 THEN
    RAISE EXCEPTION 'Reenvio da venda duplicou cobertura.';
  END IF;

  -- Balcão: cria e encaminha pedido pelas mesmas RPCs da operação.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  UPDATE public.company_settings s SET pdv_mode='balcao' WHERE s.company_id=fixture.company_id;
  payload := public.pdv_save_preorder_v2(preorder_id,0,
    jsonb_build_object('stock_id',stock_id,'operation_mode','counter','discount_amount',0),
    jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',material_id,
      'item_type','material','description','Material fictício','quantity',1,'unit_price',10,
      'discount_amount',0,'unit_factor',1,'sort_order',0)), 'permission-preorder-'||preorder_id::text);
  PERFORM public.pdv_assign_preorder_terminal_v3(preorder_id,1,terminal_id,'permission-target-'||preorder_id::text);
  PERFORM public.pdv_forward_preorder_v2(preorder_id,2,'permission-forward-'||preorder_id::text);
  payload := public.pdv_convert_preorder_v2(preorder_id,3,'permission-convert-'||preorder_id::text);
  counter_order := (payload->>'order_id')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator_id,'role','authenticated')::text,true);
  UPDATE public.user_permissions u SET permissions=base_permissions WHERE u.user_id=operator_id;
  denied := false;
  BEGIN
    PERFORM public.pdv_cover_existing_order_v2(counter_order,terminal_id,session_id,cash_id,payments,'permission-counter-denied');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Balcão aceitou caixa alheio sem permissão.'; END IF;
  UPDATE public.user_permissions u SET permissions=base_permissions||'["fn:operate_other_pdv_cash"]'::jsonb
    WHERE u.user_id=operator_id;
  PERFORM public.pdv_cover_existing_order_v2(counter_order,terminal_id,session_id,cash_id,payments,'permission-counter-'||operator_id::text);
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=counter_order AND p.created_by=operator_id)
    OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions s WHERE s.id=session_id AND s.opened_by=owner_id) THEN
    RAISE EXCEPTION 'Recebimento alterou o dono do caixa ou perdeu a autoria.';
  END IF;

  FOREACH scenario IN ARRAY ARRAY['revoked','inactive_permission','wrong_terminal','wrong_account','foreign_company','closed'] LOOP
    IF scenario='revoked' THEN
      UPDATE public.user_permissions u SET permissions=base_permissions WHERE u.user_id=operator_id;
    ELSE
      UPDATE public.user_permissions u SET permissions=base_permissions||'["fn:operate_other_pdv_cash"]'::jsonb
        WHERE u.user_id=operator_id;
    END IF;
    UPDATE public.user_permissions u SET is_active=(scenario<>'inactive_permission') WHERE u.user_id=operator_id;
    IF scenario='closed' THEN
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
      PERFORM public.pdv_close_cash_session_v2(session_id,cash_id,20,NULL,'permission-close-'||owner_id::text);
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator_id,'role','authenticated')::text,true);
    END IF;
    SELECT count(*) INTO orders_before FROM public.pdv_orders o WHERE o.company_id=fixture.company_id;
    SELECT count(*) INTO payments_before FROM public.pdv_order_payments p WHERE p.company_id=fixture.company_id;
    SELECT count(*) INTO custody_before FROM public.pdv_cash_custody_entries e WHERE e.company_id=fixture.company_id;
    FOREACH use_core IN ARRAY ARRAY[false,true] LOOP
      denied := false;
      BEGIN
        IF use_core THEN
          PERFORM public.pdv_complete_direct_sale_v2(
            CASE WHEN scenario='wrong_terminal' THEN wrong_terminal WHEN scenario='foreign_company' THEN foreign_terminal ELSE terminal_id END,
            CASE WHEN scenario='foreign_company' THEN foreign_session ELSE session_id END,
            CASE WHEN scenario IN('wrong_account','foreign_company') THEN foreign_cash ELSE cash_id END,
            NULL,cart,payments,'permission-'||scenario||'-'||use_core::text);
        ELSE
          PERFORM public.pdv_complete_direct_sale_rollout_v2(
            CASE WHEN scenario='wrong_terminal' THEN wrong_terminal WHEN scenario='foreign_company' THEN foreign_terminal ELSE terminal_id END,
            CASE WHEN scenario='foreign_company' THEN foreign_session ELSE session_id END,
            CASE WHEN scenario IN('wrong_account','foreign_company') THEN foreign_cash ELSE cash_id END,
            NULL,cart,payments,'permission-'||scenario||'-'||use_core::text);
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
        WHEN no_data_found THEN
          IF scenario IN('wrong_account','foreign_company') THEN denied := true; ELSE RAISE; END IF;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'Venda aceitou cenário inválido: %, core=%',scenario,use_core; END IF;
    END LOOP;
    IF (SELECT count(*) FROM public.pdv_orders o WHERE o.company_id=fixture.company_id)<>orders_before
      OR (SELECT count(*) FROM public.pdv_order_payments p WHERE p.company_id=fixture.company_id)<>payments_before
      OR (SELECT count(*) FROM public.pdv_cash_custody_entries e WHERE e.company_id=fixture.company_id)<>custody_before THEN
      RAISE EXCEPTION 'Tentativas negadas deixaram fatos operacionais.';
    END IF;
  END LOOP;
END
$behavior$;
ROLLBACK;
