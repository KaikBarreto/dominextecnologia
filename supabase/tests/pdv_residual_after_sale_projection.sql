-- Fixture isolada construída por writers; somente company fictícia na coorte, enabled intacto.
-- Rodar após 15130000 + 15155000, sob janela autorizada. Nenhum fato real persiste.
BEGIN;
SET LOCAL statement_timeout='120s';
SET LOCAL lock_timeout='5s';
DO $acl$
BEGIN
 IF has_function_privilege('authenticated','public.pdv_residual_projection_internal_v3(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.pdv_residual_projection_internal_v3(uuid,uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.pdv_residual_projection_internal_v3(uuid,uuid)','EXECUTE') THEN
 RAISE EXCEPTION 'Projeção detalhada foi exposta'; END IF;
END $acl$;
DO $behavior$
<<fixture>>
DECLARE
 company uuid:='e1515500-0000-4000-8000-000000000001'; actor uuid:='e1515500-0000-4000-8000-000000000002';
 foreign_company uuid:='e1515500-0000-4000-8000-000000000003'; other_actor uuid:='e1515500-0000-4000-8000-000000000004';
 stock uuid:='e1515500-0000-4000-8000-000000000011'; material uuid:='e1515500-0000-4000-8000-000000000021';
 account uuid:='e1515500-0000-4000-8000-000000000031'; bank uuid:='e1515500-0000-4000-8000-000000000032';
 terminal uuid:='e1515500-0000-4000-8000-000000000041'; customer uuid:='e1515500-0000-4000-8000-000000000051';
 preorder uuid:='e1515500-0000-4000-8000-000000000052'; preorder_item uuid:='e1515500-0000-4000-8000-000000000053';
 scenario text; passed int:=0; enabled_flags jsonb; original_permissions jsonb; company_day date;
 result jsonb; snapshot jsonb; plan jsonb; session_id uuid; order_id uuid; order_item uuid; reservation uuid;
 payment_id uuid; receivable_id uuid; debt_payment_id uuid; voucher_id uuid; refund_id uuid;
 spend_preorder uuid; spend_item uuid; spend_order uuid; blocked boolean; cash_b uuid;
 terminal_b uuid:='e1515500-0000-4000-8000-000000000042';
BEGIN
 FOREACH scenario IN ARRAY ARRAY['voucher','cash','pix','transferencia'] LOOP
 BEGIN
      SELECT jsonb_object_agg(key,enabled) INTO enabled_flags FROM public.app_feature_flags;
      INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
      VALUES('00000000-0000-0000-0000-000000000000',actor,'authenticated','authenticated',
        'paid-residual-1555@example.invalid','',now(),'{}','{"full_name":"Operador residual fictício"}',now(),now(),'','','','');
      INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
      VALUES('00000000-0000-0000-0000-000000000000',other_actor,'authenticated','authenticated',
        'paid-residual-1555-other@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
      INSERT INTO public.companies(id,name,subscription_status) VALUES(company,'Fixture residual 1555','active'),(foreign_company,'Fixture externa 1555','active');
      UPDATE public.profiles SET company_id=company,is_active=true WHERE user_id IN(actor,other_actor);
      INSERT INTO public.user_roles(user_id,role) VALUES(actor,'comercial'),(other_actor,'comercial');
      original_permissions:='["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","screen:pdv_settings","screen:pdv_after_sale","screen:customers","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:cover_pdv_order","fn:deliver_pdv_order","fn:complete_direct_sale","fn:return_pdv_order","fn:use_bank_accounts","fn:approve_pdv_credit","fn:cancel_pdv_order_residual","fn:manage_party_credit","fn:view_customer_financial","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return","fn:reverse_pdv_refund","fn:reverse_pdv_after_sale","fn:confirm_pdv_refund"]';
      INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(actor,original_permissions,true),(other_actor,original_permissions,true);
      INSERT INTO public.company_modules(company_id,module_code) VALUES(company,'pdv');
      INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
        VALUES(account,company,'Cofre fictício residual','caixa',CASE WHEN scenario='cash' THEN 90 ELSE 60 END,true);
      INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
        VALUES(company,'Fixture residual 1555','America/Sao_Paulo',account,true,'balcao')
        ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone,pdv_cash_account_id=EXCLUDED.pdv_cash_account_id,
          pdv_strict_cash_tracking=true,pdv_mode='balcao';
      UPDATE public.stocks SET is_default=false WHERE company_id=company AND is_default IS TRUE;
      INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,company,'Estoque residual fictício',true);
      INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(company,stock,actor),(company,stock,other_actor);
      INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,company,'Terminal residual fictício',stock,true),(terminal_b,company,'TerminalB residual fictício',stock,true);
      INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
        VALUES(material,company,'RES1555','Material residual fictício','un',100,2,5);
      INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(company,material,stock,100,true);
      INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,company,'Cliente residual fictício',500,false);
      INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(bank,company,'Banco residual fictício','banco',0,true);
      -- Somente a empresa FICTÍCIA é adicionada às coortes e só nesta subtransação.
      UPDATE public.app_feature_flags SET company_allowlist=array_append(company_allowlist,company)
        WHERE key IN('pdv_returns_v2','pdv_party_accounts_v2','pdv_after_sale_value_v2');
      IF (SELECT jsonb_object_agg(key,enabled) FROM public.app_feature_flags)<>enabled_flags THEN RAISE EXCEPTION 'Flag global mudou'; END IF;
      company_day:=public.company_today(company);
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');
      result:=public.pdv_open_cash_session_v2(terminal,account,60,'res1555-open-cash');
      session_id:=(result->>'session_id')::uuid;
      result:=public.pdv_save_preorder_v2(preorder,0,
        jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','discount_amount',0),
        jsonb_build_array(jsonb_build_object('id',preorder_item,'inventory_id',material,'item_type','material',
          'description','Material residual fictício','quantity',18,'unit_price',5,'discount_amount',0,'unit_factor',1,'sort_order',0)),
        'res1555-preorder-save');
      PERFORM public.pdv_assign_preorder_terminal_v3(preorder,1,terminal,'res1555-destination');
      PERFORM public.pdv_forward_preorder_v2(preorder,2,'res1555-forward');
      result:=public.pdv_convert_preorder_v2(preorder,3,'res1555-convert');
      order_id:=(result->>'order_id')::uuid;
      PERFORM public.pdv_cover_existing_order_v2(order_id,terminal,session_id,account,
        jsonb_build_array(jsonb_build_object('method',CASE WHEN scenario IN('pix','transferencia') THEN scenario ELSE 'dinheiro' END,'amount',40) || CASE WHEN scenario IN('pix','transferencia') THEN jsonb_build_object('account_id',bank) ELSE '{}'::jsonb END,
          jsonb_build_object('method','fiado','amount',50,'due_date',current_date+30)),'res1555-cover');
      EXECUTE 'RESET ROLE';
      SELECT oi.id INTO order_item FROM public.pdv_order_items oi WHERE oi.order_id=fixture.order_id;
      SELECT r.id INTO reservation FROM public.pdv_stock_reservation_items r WHERE r.order_item_id=order_item;
      SELECT p.id INTO payment_id FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id AND p.method=CASE WHEN scenario IN('pix','transferencia') THEN scenario ELSE 'dinheiro' END;
      SELECT p.receivable_transaction_id INTO receivable_id FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id AND p.method='fiado';
      SELECT p.id INTO debt_payment_id FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id AND p.method='fiado';
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.pdv_complete_dispatch_delivery_v2(order_id,jsonb_build_array(
        jsonb_build_object('order_item_id',order_item,'reservation_id',reservation,'quantity',5)),'res1555-deliver-five');
      plan:=public.pdv_get_order_residual_plan_v3(order_id);
      IF (plan->>'residual_amount')::numeric<>65 OR (plan->>'receivable_reduction_amount')::numeric<>50
        OR (plan->>'paid_disposition_amount')::numeric<>15 OR (plan->>'delivered_amount')::numeric<>25 THEN
        RAISE EXCEPTION 'Plano 90 / pago40 / fiado50 / entregue25 divergiu: %',plan; END IF;
      IF scenario='cash' THEN
        -- CaixaB real do outro operador: abre30 lastreados no mesmo cofre
        -- (inicial90 + recebido40 =130; custódiaA100 +B30 =130).
        EXECUTE 'RESET ROLE';
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_actor,'role','authenticated')::text,true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        result:=public.pdv_open_cash_session_v2(terminal_b,account,30,'res1555-open-cash-b');
        cash_b:=(result->>'session_id')::uuid;
        EXECUTE 'RESET ROLE';
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
        INSERT INTO public.user_roles(user_id,role) VALUES(actor,'gestor');
        UPDATE public.user_permissions SET permissions=original_permissions||'["fn:operate_other_pdv_cash"]'::jsonb WHERE user_id=actor;
        EXECUTE 'SET LOCAL ROLE authenticated';
      END IF;
      result:=public.pdv_cancel_order_residual_v3(order_id,'Cancelamento fictício para projeção',
        jsonb_build_array(jsonb_build_object('kind',CASE WHEN scenario='voucher' THEN 'voucher' ELSE 'refund' END,
          'original_payment_id',payment_id,'amount',15) || CASE WHEN scenario='cash' THEN jsonb_build_object('account_id',account,'cash_session_id',cash_b) WHEN scenario IN('pix','transferencia') THEN jsonb_build_object('account_id',bank) ELSE '{}'::jsonb END),
        plan->>'plan_hash','res1555-cancel');
      snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
      IF snapshot->>'order_id'<>order_id::text OR snapshot->>'financial_status'<>'allocated' THEN RAISE EXCEPTION 'Projeção sem origem ou alocação'; END IF;
      -- Sem view, o endpoint de recuperação não pode revelar auditoria financeira.
      EXECUTE 'RESET ROLE';
      UPDATE public.user_permissions SET permissions=original_permissions-'fn:view_pdv_after_sale' WHERE user_id=actor;
      -- Admin implica view; retira apenas o papel temporário de criação cross-cash.
      DELETE FROM public.user_roles WHERE user_id=actor AND role='gestor';
      EXECUTE 'SET LOCAL ROLE authenticated';
      snapshot:=public.pdv_get_order_residual_cancellation_v3(order_id);
      IF snapshot->'access_masked' IS DISTINCT FROM 'true'::jsonb
        OR snapshot->'residual_amount' IS DISTINCT FROM 'null'::jsonb
        OR snapshot->'unallocated_amount' IS DISTINCT FROM 'null'::jsonb
        OR snapshot->'financial_plan' IS DISTINCT FROM 'null'::jsonb
        OR snapshot->'financial_status' IS DISTINCT FROM 'null'::jsonb
        OR snapshot->'dispositions' IS DISTINCT FROM '[]'::jsonb OR snapshot->'vouchers' IS DISTINCT FROM '[]'::jsonb
        OR snapshot->'refunds' IS DISTINCT FROM '[]'::jsonb
        OR snapshot->>'order_id' IS DISTINCT FROM order_id::text
        OR snapshot->>'plan_hash' IS DISTINCT FROM plan->>'plan_hash'
        OR (snapshot-ARRAY['cancellation_id','order_id','source_kind','source_event_ref','reason','occurred_on',
          'released_quantity','delivered_quantity','status','plan_hash','access_masked','residual_amount',
          'financial_plan','unallocated_amount','financial_status','dispositions','vouchers','refunds'])<>'{}'::jsonb THEN
        RAISE EXCEPTION 'View revogada expôs valores, recursos ou plano financeiro'; END IF;
      EXECUTE 'RESET ROLE';
      UPDATE public.user_permissions SET permissions=original_permissions WHERE user_id=actor;
      EXECUTE 'SET LOCAL ROLE authenticated';
      snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
      IF scenario='cash' THEN
        -- A tem acesso ao pedidoA e fnreverse, mas não ao caixaB que pagou o refund.
        IF (snapshot#>>'{refunds,0,can_reverse}')::boolean IS DISTINCT FROM FALSE THEN
          RAISE EXCEPTION 'OperadorA recebeu estorno do caixaB sem cross-cash'; END IF;
        EXECUTE 'RESET ROLE';
        original_permissions:=original_permissions||'["fn:operate_other_pdv_cash"]'::jsonb;
        UPDATE public.user_permissions SET permissions=original_permissions WHERE user_id=actor;
        EXECUTE 'SET LOCAL ROLE authenticated';
        snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
        IF (snapshot#>>'{refunds,0,can_reverse}')::boolean IS DISTINCT FROM TRUE THEN
          RAISE EXCEPTION 'Operador com cross-cash não recebeu elegibilidade da sessãoB aberta'; END IF;
      END IF;
      IF scenario='voucher' THEN
        voucher_id:=(snapshot#>>'{vouchers,0,voucher_id}')::uuid;
        IF snapshot#>>'{vouchers,0,status}'<>'active' OR (snapshot#>>'{vouchers,0,issued_amount}')::numeric<>15
          OR (snapshot#>>'{vouchers,0,can_reverse}')::boolean IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Voucher intacto não reversível'; END IF;
        -- Checkout parcial real consome5 de15. Subtransação mantém origem intacta para teste de estorno.
        BEGIN
          spend_preorder:=gen_random_uuid(); spend_item:=gen_random_uuid();
          PERFORM public.pdv_save_preorder_v2(spend_preorder,0,
            jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','discount_amount',0),
            jsonb_build_array(jsonb_build_object('id',spend_item,'inventory_id',material,'item_type','material','description','Consumo parcial fictício','quantity',1,'unit_price',5,'discount_amount',0,'unit_factor',1,'sort_order',0)), 'res1555-spend-save');
          PERFORM public.pdv_assign_preorder_terminal_v3(spend_preorder,1,terminal,'res1555-spend-destination');
          PERFORM public.pdv_forward_preorder_v2(spend_preorder,2,'res1555-spend-forward');
          result:=public.pdv_convert_preorder_v2(spend_preorder,3,'res1555-spend-convert'); spend_order:=(result->>'order_id')::uuid;
          PERFORM public.pdv_cover_existing_order_v2(spend_order,terminal,session_id,account,
            jsonb_build_array(jsonb_build_object('method','voucher','amount',5,'reference_id',voucher_id)),'res1555-spend');
          snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
          IF (snapshot#>>'{vouchers,0,balance}')::numeric<>10 OR (snapshot#>>'{vouchers,0,can_reverse}')::boolean IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Voucher consumido parcialmente foi liberado para estorno'; END IF;
          RAISE EXCEPTION 'rollback_partial_consumption' USING ERRCODE='P1555';
        EXCEPTION WHEN SQLSTATE 'P1555' THEN NULL; END;
        PERFORM public.pdv_reverse_return_voucher_v2(voucher_id,'Estorno fictício','res1555-reverse');
        snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
        IF snapshot#>>'{vouchers,0,status}'<>'reversed' OR (snapshot#>>'{vouchers,0,can_reverse}')::boolean IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Voucher estornado continua ativo'; END IF;
      ELSE
        refund_id:=(snapshot#>>'{refunds,0,refund_id}')::uuid;
        IF scenario='cash' THEN
          IF snapshot#>>'{refunds,0,status}'<>'settled' OR (snapshot#>>'{refunds,0,can_confirm}')::boolean IS DISTINCT FROM FALSE OR (snapshot#>>'{refunds,0,can_reverse}')::boolean IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Reembolso cash projetou ações indevidas'; END IF;
        ELSE
          IF snapshot#>>'{refunds,0,status}'<>'pending' OR (snapshot#>>'{refunds,0,can_confirm}')::boolean IS DISTINCT FROM TRUE OR (snapshot#>>'{refunds,0,can_reverse}')::boolean IS DISTINCT FROM FALSE
            OR (snapshot#>>'{refunds,0,requires_confirmation_reference}')::boolean IS DISTINCT FROM (scenario='pix') THEN RAISE EXCEPTION 'Reembolso bancário pendente projetou estado incorreto'; END IF;
          PERFORM public.pdv_confirm_return_refund_v2(refund_id,bank,'PROTOCOLO-FICTICIO-1555','res1555-confirm');
          snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
          IF snapshot#>>'{refunds,0,status}'<>'settled' OR (snapshot#>>'{refunds,0,can_reverse}')::boolean IS DISTINCT FROM TRUE OR (snapshot#>>'{refunds,0,can_confirm}')::boolean IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Reembolso bancário confirmado não atualizou'; END IF;
        END IF;
        PERFORM public.pdv_reverse_return_refund_v2(refund_id,'Estorno fictício','res1555-reverse');
        snapshot:=public.pdv_get_after_sale_workspace_v2(order_id)->'residual_cancellation';
        IF snapshot#>>'{refunds,0,status}'<>'reversed' OR (snapshot#>>'{refunds,0,can_reverse}')::boolean IS DISTINCT FROM FALSE OR (snapshot#>>'{refunds,0,can_confirm}')::boolean IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Reembolso estornado ainda oferece ação'; END IF;
      END IF;
      IF snapshot->>'financial_status'<>'pending_disposition' OR (snapshot->>'unallocated_amount')::numeric<>15 THEN RAISE EXCEPTION 'Estorno ocultou pendência'; END IF;
      -- Escopos de estoque, perfil e tenant continuam exigidos nos callbacks normais.
      EXECUTE 'RESET ROLE';
      DELETE FROM public.stock_access WHERE company_id=company AND user_id=actor;
      EXECUTE 'SET LOCAL ROLE authenticated'; blocked:=false;
      BEGIN PERFORM public.pdv_get_order_residual_cancellation_v3(order_id);
      EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Reader atravessou stockscope'; END IF;
      EXECUTE 'RESET ROLE';
      INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(company,stock,actor);
      -- Bootstrap exclusivo do perfil ficticio; RESET ROLE nao altera auth.role().
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role')::text,true);
      UPDATE public.profiles SET is_active=false WHERE user_id=actor;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      EXECUTE 'SET LOCAL ROLE authenticated'; blocked:=false;
      BEGIN PERFORM public.pdv_get_order_residual_cancellation_v3(order_id);
      EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Reader aceitou perfil inativo'; END IF;
      EXECUTE 'RESET ROLE';
      -- Bootstrap exclusivo do perfil ficticio; RESET ROLE nao altera auth.role().
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role')::text,true);
      UPDATE public.profiles SET is_active=true,company_id=foreign_company WHERE user_id=actor;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      EXECUTE 'SET LOCAL ROLE authenticated'; blocked:=false;
      BEGIN PERFORM public.pdv_get_order_residual_cancellation_v3(order_id);
      EXCEPTION WHEN insufficient_privilege OR no_data_found THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Reader atravessou tenant'; END IF;
      EXECUTE 'RESET ROLE';
      -- Bootstrap exclusivo do perfil ficticio; RESET ROLE nao altera auth.role().
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role')::text,true);
      UPDATE public.profiles SET company_id=company WHERE user_id=actor;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SET CONSTRAINTS pdv_refund_cash_pair_v3 IMMEDIATE;
      EXECUTE 'RESET ROLE';
      IF (SELECT jsonb_object_agg(key,enabled) FROM public.app_feature_flags)<>enabled_flags THEN RAISE EXCEPTION 'Flag global mudou'; END IF;
      RAISE EXCEPTION 'rollback_projection_fixture' USING ERRCODE='P1555';
    EXCEPTION WHEN SQLSTATE 'P1555' THEN EXECUTE 'RESET ROLE'; passed:=passed+1; END;
    IF EXISTS(SELECT 1 FROM public.companies WHERE id=company) THEN RAISE EXCEPTION 'Fixture não foi removida'; END IF;
  END LOOP;
  IF passed<>4 THEN RAISE EXCEPTION 'Matriz incompleta'; END IF;
END $behavior$;
ROLLBACK;
