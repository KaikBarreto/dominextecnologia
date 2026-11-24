-- Proposta transacional: executar após a migration 15130000 em banco de teste.
-- Nenhum fato financeiro/entrega/reserva é fabricado. Os callbacks comerciais
-- usam escritores canônicos sob role authenticated, usuário comercial fictício.
-- Catálogo/configuração/cadastro da fixture são bootstrap, não prova de RLS.
-- Nunca executar remotamente sem janela GO do root. Tudo termina em ROLLBACK.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $contracts$
DECLARE signature regprocedure; table_name text; definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.pdv_cancel_order_residual_v3(uuid,text,jsonb,text,text)'::regprocedure,
    'public.pdv_get_order_residual_plan_v3(uuid)'::regprocedure,
    'public.pdv_get_order_residual_cancellation_v3(uuid)'::regprocedure] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL incorreta para %',signature; END IF;
  END LOOP;
  FOR signature IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('pdv_value_source_internal_v3','pdv_value_order_internal_v3',
      'pdv_refund_order_internal_v3','pdv_voucher_order_internal_v3','pdv_value_credit_entry_internal_v3',
      'pdv_free_value_internal_v3','pdv_issue_value_voucher_internal_v3','pdv_request_value_refund_internal_v3',
      'pdv_residual_plan_internal_v3','pdv_residual_projection_internal_v3','pdv_guard_residual_source_v3','pdv_assert_refund_cash_pair_v3') LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Helper público %',signature; END IF;
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['pdv_order_residual_cancellations','pdv_party_credit_entries',
    'pdv_return_dispositions','pdv_vouchers','pdv_refunds','pdv_return_value_events'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class t WHERE t.oid=('public.'||table_name)::regclass AND t.relrowsecurity AND t.relforcerowsecurity)
      OR has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Livro sem isolamento %',table_name; END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Revisão da posição assinada expôs extrato detalhado'; END IF;
  SELECT pg_get_functiondef('public.pdv_cancel_order_residual_core_015_v2(uuid,text,text)'::regprocedure) INTO definition;
  IF position('pdv_cancel_financial_disposition_required' in definition)=0 THEN RAISE EXCEPTION 'V2 perdeu recusa segura'; END IF;
END $contracts$;

DO $behavior$
<<fixture>>
DECLARE
  company uuid:='e1513000-0000-4000-8000-000000000001';
  actor uuid:='e1513000-0000-4000-8000-000000000002';
  foreign_company uuid:='e1513000-0000-4000-8000-000000000003';
  other_actor uuid:='e1513000-0000-4000-8000-000000000004';
  stock uuid:='e1513000-0000-4000-8000-000000000011';
  material uuid:='e1513000-0000-4000-8000-000000000021';
  account uuid:='e1513000-0000-4000-8000-000000000031';
  terminal uuid:='e1513000-0000-4000-8000-000000000041';
  customer uuid:='e1513000-0000-4000-8000-000000000051';
  preorder uuid:='e1513000-0000-4000-8000-000000000052';
  preorder_item uuid:='e1513000-0000-4000-8000-000000000053';
  scenario text; passed integer:=0; session_id uuid; order_id uuid; order_item uuid; reservation uuid;
  payment_id uuid; debt_payment_id uuid; receivable_id uuid; plan jsonb; dispositions jsonb; result jsonb; retry jsonb;
  cancellation_id uuid; refund_id uuid; voucher_id uuid; blocked boolean; detail text;
  before_counts jsonb; after_counts jsonb; before_inventory numeric; before_cmv numeric;
  balance numeric; custody numeric; original_permissions jsonb; enabled_flags jsonb;
  company_day date; credit_result jsonb; partial_credit uuid; partial_application uuid; current_debt numeric;
  spend_preorder uuid; spend_item uuid; spend_order uuid; spend_principal uuid; delivery_item uuid; source_return uuid; legacy_voucher uuid; legacy_refund uuid;
BEGIN
  FOREACH scenario IN ARRAY ARRAY['customer_credit','voucher','refund'] LOOP
    BEGIN
      -- Bootstrap exclusivo da fixture. Prefixo e1513000 não pertence à demo.
      SELECT jsonb_object_agg(key,enabled) INTO enabled_flags FROM public.app_feature_flags;
      INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
      VALUES('00000000-0000-0000-0000-000000000000',actor,'authenticated','authenticated',
        'paid-residual-1513@example.invalid','',now(),'{}','{"full_name":"Operador residual fictício"}',now(),now(),'','','','');
      INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
      VALUES('00000000-0000-0000-0000-000000000000',other_actor,'authenticated','authenticated',
        'paid-residual-1513-other@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
      INSERT INTO public.companies(id,name,subscription_status) VALUES(company,'Fixture residual 1513','active'),(foreign_company,'Fixture externa 1513','active');
      UPDATE public.profiles SET company_id=company,is_active=true WHERE user_id IN(actor,other_actor);
      INSERT INTO public.user_roles(user_id,role) VALUES(actor,'comercial');
      original_permissions:='["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","screen:pdv_settings","screen:pdv_after_sale","screen:customers","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:cover_pdv_order","fn:deliver_pdv_order","fn:complete_direct_sale","fn:return_pdv_order","fn:use_bank_accounts","fn:approve_pdv_credit","fn:cancel_pdv_order_residual","fn:manage_party_credit","fn:view_customer_financial","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return","fn:reverse_pdv_refund","fn:reverse_pdv_after_sale","fn:confirm_pdv_refund"]';
      INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(actor,original_permissions,true);
      INSERT INTO public.company_modules(company_id,module_code) VALUES(company,'pdv');
      INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
        VALUES(account,company,'Cofre fictício residual','caixa',60,true);
      INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
        VALUES(company,'Fixture residual 1513','America/Sao_Paulo',account,true,'balcao')
        ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone,pdv_cash_account_id=EXCLUDED.pdv_cash_account_id,
          pdv_strict_cash_tracking=true,pdv_mode='balcao';
      UPDATE public.stocks SET is_default=false WHERE company_id=company AND is_default IS TRUE;
      INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,company,'Estoque residual fictício',true);
      INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(company,stock,actor);
      INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,company,'Terminal residual fictício',stock,true);
      INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
        VALUES(material,company,'RES1513','Material residual fictício','un',100,2,5);
      INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(company,material,stock,100,true);
      INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,company,'Cliente residual fictício',500,false);
      -- Regressão fora do PDV: o guard diferido não pode bloquear um FT
      -- legado, com role NULL, com método NULL ou dinheiro. Esses registros
      -- não pagos/sem conta são isolados da prova de saldo e custódia abaixo.
      -- Bootstrap privilegiado de regressão; não representa teste de RLS.
      INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,
        transaction_date,is_paid,payment_method)
      VALUES(company,'entrada','Legado fictício sem método - residual1513',1,current_date,false,NULL),
            (company,'entrada','Legado fictício dinheiro - residual1513',1,current_date,false,'dinheiro');
      SET CONSTRAINTS pdv_refund_cash_pair_v3 IMMEDIATE;
      SET CONSTRAINTS pdv_refund_cash_pair_v3 DEFERRED;
      -- Somente a empresa FICTÍCIA é adicionada às coortes e só nesta subtransação.
      UPDATE public.app_feature_flags SET company_allowlist=array_append(company_allowlist,company)
        WHERE key IN('pdv_returns_v2','pdv_party_accounts_v2','pdv_after_sale_value_v2');
      IF (SELECT jsonb_object_agg(key,enabled) FROM public.app_feature_flags)<>enabled_flags THEN RAISE EXCEPTION 'Flag global mudou'; END IF;
      company_day:=public.company_today(company);
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');
      result:=public.pdv_open_cash_session_v2(terminal,account,60,'res1513-open-cash');
      session_id:=(result->>'session_id')::uuid;
      result:=public.pdv_save_preorder_v2(preorder,0,
        jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','discount_amount',0),
        jsonb_build_array(jsonb_build_object('id',preorder_item,'inventory_id',material,'item_type','material',
          'description','Material residual fictício','quantity',18,'unit_price',5,'discount_amount',0,'unit_factor',1,'sort_order',0)),
        'res1513-preorder-save');
      PERFORM public.pdv_assign_preorder_terminal_v3(preorder,1,terminal,'res1513-destination');
      PERFORM public.pdv_forward_preorder_v2(preorder,2,'res1513-forward');
      result:=public.pdv_convert_preorder_v2(preorder,3,'res1513-convert');
      order_id:=(result->>'order_id')::uuid;
      PERFORM public.pdv_cover_existing_order_v2(order_id,terminal,session_id,account,
        jsonb_build_array(jsonb_build_object('method','dinheiro','amount',40),
          jsonb_build_object('method','fiado','amount',50,'due_date',current_date+30)),'res1513-cover');
      EXECUTE 'RESET ROLE';
      SELECT oi.id INTO order_item FROM public.pdv_order_items oi WHERE oi.order_id=fixture.order_id;
      SELECT r.id INTO reservation FROM public.pdv_stock_reservation_items r WHERE r.order_item_id=order_item;
      SELECT p.id INTO payment_id FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id AND p.method='dinheiro';
      SELECT p.receivable_transaction_id INTO receivable_id FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id AND p.method='fiado';
      SELECT p.id INTO debt_payment_id FROM public.pdv_order_payments p WHERE p.order_id=fixture.order_id AND p.method='fiado';
      EXECUTE 'SET LOCAL ROLE authenticated';
      -- O resumo e os writers compartilham a posição assinada. Exercita
      -- crédito moderno e a ponte de saldo legado sem registrar dinheiro.
      BEGIN
        credit_result:=public.pdv_post_party_credit_v2('customer',customer,'credit',30,company_day,
          'Crédito moderno fictício30','res1513-position-credit30');
        partial_credit:=(credit_result->>'entry_id')::uuid;
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        IF current_debt<>20 THEN RAISE EXCEPTION 'Emissão de crédito30 não levou posição50→20'; END IF;
        credit_result:=public.pdv_apply_party_credit_v2('customer',customer,receivable_id,30,company_day,
          'Aplicação fictícia30','res1513-position-apply30');
        partial_application:=(credit_result->>'entry_id')::uuid;
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        EXECUTE 'RESET ROLE';
        IF current_debt<>20 OR public.pdv_party_obligation_open_v2(receivable_id)<>20
          OR public.pdv_party_available_credit_v2(company,'customer',customer)<>0 THEN
          RAISE EXCEPTION 'Aplicação30 foi duplicada na posição/obrigação'; END IF;
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM public.pdv_reverse_party_credit_entry_v2(partial_application,'Estorno aplicação fictícia','res1513-position-reverse-application');
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        EXECUTE 'RESET ROLE';
        IF current_debt<>20 OR public.pdv_party_obligation_open_v2(receivable_id)<>50
          OR public.pdv_party_available_credit_v2(company,'customer',customer)<>30 THEN
          RAISE EXCEPTION 'Estorno da aplicação30 alterou posição assinada'; END IF;
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM public.pdv_reverse_party_credit_entry_v2(partial_credit,'Estorno crédito fictício','res1513-position-reverse-credit');
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        IF current_debt<>50 THEN RAISE EXCEPTION 'Estorno de crédito não recompôs posição50'; END IF;
        RAISE EXCEPTION 'rollback_credit_position' USING ERRCODE='P1530';
      EXCEPTION WHEN SQLSTATE 'P1530' THEN NULL;
      END;
      BEGIN
        -- Duas representações históricas legítimas: ajuste de crédito livre
        -- e ponte venda_fiado ligada ao MESMO principal já criado pelo writer.
        EXECUTE 'RESET ROLE';
        INSERT INTO public.customer_credit_ledger(company_id,customer_id,kind,amount,created_by,notes)
          VALUES(company,customer,'ajuste',-30,actor,'Crédito legado fictício30');
        INSERT INTO public.customer_credit_ledger(company_id,customer_id,kind,amount,order_id,financial_transaction_id,created_by,notes)
          VALUES(company,customer,'venda_fiado',50,order_id,receivable_id,actor,'Ponte legada fictícia do mesmo principal');
        EXECUTE 'SET LOCAL ROLE authenticated';
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        IF current_debt<>20 THEN RAISE EXCEPTION 'Crédito legado/ponte duplicou principal50'; END IF;
        credit_result:=public.pdv_apply_party_credit_v2('customer',customer,receivable_id,30,company_day,
          'Aplicação do legado30','res1513-legacy-position-apply30');
        partial_application:=(credit_result->>'entry_id')::uuid;
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        EXECUTE 'RESET ROLE';
        IF current_debt<>20 OR public.pdv_party_obligation_open_v2(receivable_id)<>20
          OR public.pdv_party_available_credit_v2(company,'customer',customer)<>0 THEN
          RAISE EXCEPTION 'Aplicação do crédito legado foi contada duas vezes'; END IF;
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM public.pdv_reverse_party_credit_entry_v2(partial_application,'Estorno legado fictício','res1513-legacy-position-reverse');
        SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
        IF current_debt<>20 THEN RAISE EXCEPTION 'Estorno da aplicação legada alterou posição'; END IF;
        RAISE EXCEPTION 'rollback_legacy_credit_position' USING ERRCODE='P1530';
      EXCEPTION WHEN SQLSTATE 'P1530' THEN NULL;
      END;
      PERFORM public.pdv_complete_dispatch_delivery_v2(order_id,jsonb_build_array(
        jsonb_build_object('order_item_id',order_item,'reservation_id',reservation,'quantity',5)),'res1513-deliver-five');
      plan:=public.pdv_get_order_residual_plan_v3(order_id);
      IF (plan->>'residual_amount')::numeric<>65 OR (plan->>'receivable_reduction_amount')::numeric<>50
        OR (plan->>'paid_disposition_amount')::numeric<>15 OR (plan->>'delivered_amount')::numeric<>25 THEN
        RAISE EXCEPTION 'Plano 90 / pago40 / fiado50 / entregue25 divergiu: %',plan; END IF;
      -- GUC forjada não autoriza FT de refund sem a origem/request persistidos.
      PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object('company_id',company,
        'account_id',account,'request_id',gen_random_uuid(),'delta',-999999)::text,true);
      blocked:=false;
      BEGIN
        INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
          transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,
          pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
        VALUES(company,'saida','Tentativa fictícia de refund sem origem',15,'Reembolso de venda do PDV',
          company_day,company_day,true,account,customer,'pdv','dinheiro',actor,
          'pdv_refund',gen_random_uuid(),session_id);
      EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
        blocked:=detail LIKE '%pdv_refund_treasury_source_mismatch%'; END;
      IF NOT blocked THEN RAISE EXCEPTION 'GUC forjada autorizou refund sem fonte'; END IF;
      PERFORM set_config('app.pdv_treasury_custody_delta','',true);
      -- Probe TEMP isola a assertion diferida sem fabricar FT/evento público.
      -- Não é um teste de autorização; os callbacks acima são authenticated.
      EXECUTE 'RESET ROLE';
      CREATE TEMP TABLE pdv_refund_pair_probe(id uuid,company_id uuid,pdv_financial_role text,payment_method text,
        amount numeric,pdv_settlement_group_id uuid,account_id uuid,pdv_cash_session_id uuid) ON COMMIT DROP;
      CREATE CONSTRAINT TRIGGER probe_pdv_refund_cash_pair_v3 AFTER INSERT ON pdv_refund_pair_probe
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_refund_cash_pair_v3();
      blocked:=false;
      BEGIN
        INSERT INTO pdv_refund_pair_probe VALUES(gen_random_uuid(),company,'pdv_refund','dinheiro',15,
          gen_random_uuid(),account,session_id);
        SET CONSTRAINTS probe_pdv_refund_cash_pair_v3 IMMEDIATE;
      EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
        blocked:=detail LIKE '%pdv_refund_cash_pair_required%'; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Assertion diferida aceitou refund sem par financeiro/custódia'; END IF;
      DROP TABLE pdv_refund_pair_probe;
      EXECUTE 'SET LOCAL ROLE authenticated';
      dispositions:=jsonb_build_array(jsonb_build_object('kind',scenario,'original_payment_id',payment_id,'amount',15)
        ||CASE WHEN scenario='refund' THEN jsonb_build_object('account_id',account,'cash_session_id',session_id) ELSE '{}' END);
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício',
        jsonb_build_array(jsonb_build_object('kind',NULL,'original_payment_id',payment_id,'amount',15,
          'account_id',account,'cash_session_id',session_id)),plan->>'plan_hash','res1513-null-kind');
      EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
        blocked:=detail LIKE '%pdv_residual_payload_invalid%'; END;
      IF NOT blocked THEN RAISE EXCEPTION 'kind JSON null caiu no ramo de reembolso'; END IF;
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v2(order_id,'Motivo fictício','res1513-old-v2');
      EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
        blocked:=detail LIKE '%pdv_cancel_financial_disposition_required%'; END;
      IF NOT blocked THEN RAISE EXCEPTION 'V2 não recusou cobertura'; END IF;
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício','[]',plan->>'plan_hash','res1513-incomplete');
      EXCEPTION WHEN check_violation THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Aceitou destino incompleto'; END IF;
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício',dispositions,'stale-plan','res1513-stale');
      EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Aceitou plano alterado'; END IF;
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício',
        jsonb_build_array(jsonb_build_object('kind','refund','original_payment_id',debt_payment_id,'amount',15,
          'account_id',account,'cash_session_id',session_id)),plan->>'plan_hash','res1513-no-fake-debt-refund');
      EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
        blocked:=detail LIKE '%pdv_residual_payment_mismatch%'; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Fiado aberto foi aceito como dinheiro reembolsável'; END IF;
      EXECUTE 'RESET ROLE';
      SELECT jsonb_build_object('movements',(SELECT count(*) FROM public.inventory_movements WHERE inventory_id=material),
        'returns',(SELECT count(*) FROM public.pdv_commercial_returns cr WHERE cr.order_id=fixture.order_id),
        'deliveries',(SELECT count(*) FROM public.pdv_deliveries del WHERE del.order_id=fixture.order_id),
        'financial',(SELECT count(*) FROM public.financial_transactions WHERE company_id=company)) INTO before_counts;
      SELECT quantity INTO before_inventory FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
      SELECT sum(di.cmv_amount_snapshot) INTO before_cmv FROM public.pdv_delivery_items di WHERE di.order_item_id=order_item;
      -- Escopo de estoque é validado no banco, mesmo com cancelamento/destino permitidos.
      DELETE FROM public.stock_access WHERE company_id=company AND stock_id=stock AND user_id=actor;
      INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(company,stock,other_actor);
      EXECUTE 'SET LOCAL ROLE authenticated';
      blocked:=false;
      BEGIN PERFORM public.pdv_get_order_residual_plan_v3(order_id);
      EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
        blocked:=detail LIKE '%pdv_return_stock_denied%'; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Plano residual ignorou escopo do estoque'; END IF;
      EXECUTE 'RESET ROLE';
      INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(company,stock,actor);
      DELETE FROM public.stock_access WHERE company_id=company AND stock_id=stock AND user_id=other_actor;
      -- Permissão do cancelamento não autoriza o destino financeiro.
      UPDATE public.user_permissions SET permissions=permissions-'fn:manage_party_credit' WHERE user_id=actor;
      EXECUTE 'SET LOCAL ROLE authenticated';
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício',dispositions,plan->>'plan_hash','res1513-no-destination-permission');
      EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Cancelamento sem permissão de destino'; END IF;
      EXECUTE 'RESET ROLE';
      UPDATE public.user_permissions SET permissions=original_permissions WHERE user_id=actor;
      EXECUTE 'SET LOCAL ROLE authenticated';
      result:=public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício',dispositions,plan->>'plan_hash','res1513-cancel-main');
      retry:=public.pdv_cancel_order_residual_v3(order_id,'Motivo fictício',dispositions,plan->>'plan_hash','res1513-cancel-main');
      IF result->>'cancellation_id' IS DISTINCT FROM retry->>'cancellation_id' OR (retry->>'idempotent')::boolean IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Replay duplicou ou perdeu identidade'; END IF;
      blocked:=false;
      BEGIN PERFORM public.pdv_cancel_order_residual_v3(order_id,'Outro motivo',dispositions,plan->>'plan_hash','res1513-cancel-main');
      EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Intenção reutilizada com outro conteúdo'; END IF;
      SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
      IF current_debt<>(CASE WHEN scenario='customer_credit' THEN -15 ELSE 0 END) THEN
        RAISE EXCEPTION 'Resumo canônico não refletiu abatimento50/destino15: %',current_debt; END IF;
      retry:=public.pdv_get_order_residual_cancellation_v3(order_id);
      IF retry->>'source_kind'<>'order_residual_cancellation_v3' OR (retry->>'residual_amount')::numeric<>65
        OR (retry->>'unallocated_amount')::numeric<>0 OR retry->>'financial_status'<>'allocated' THEN
        RAISE EXCEPTION 'Leitor residual não conciliou a destinação'; END IF;
      retry:=public.pdv_get_after_sale_workspace_v2(order_id);
      IF retry->'residual_cancellation'->>'cancellation_id' IS DISTINCT FROM result->>'cancellation_id'
        OR jsonb_array_length(retry->'returns')<>0 THEN
        RAISE EXCEPTION 'Pós-venda confundiu cancelamento residual com devolução de entrega'; END IF;
      EXECUTE 'RESET ROLE';
      cancellation_id:=(result->>'cancellation_id')::uuid;
      IF (SELECT public.pdv_party_obligation_open_v2(receivable_id))<>0 THEN RAISE EXCEPTION 'Fiado não foi abatido'; END IF;
      SELECT jsonb_build_object('movements',(SELECT count(*) FROM public.inventory_movements WHERE inventory_id=material),
        'returns',(SELECT count(*) FROM public.pdv_commercial_returns cr WHERE cr.order_id=fixture.order_id),
        'deliveries',(SELECT count(*) FROM public.pdv_deliveries del WHERE del.order_id=fixture.order_id),
        'financial',(SELECT count(*) FROM public.financial_transactions WHERE company_id=company)) INTO after_counts;
      IF before_counts-'financial'<>after_counts-'financial' OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>before_inventory
        OR (SELECT sum(di.cmv_amount_snapshot) FROM public.pdv_delivery_items di WHERE di.order_item_id=order_item)<>before_cmv
        OR before_cmv<>10 THEN RAISE EXCEPTION 'Cancelamento alterou estoque/devolução/entrega/CMV'; END IF;
      IF (SELECT status FROM public.pdv_orders WHERE id=order_id)<>'cancelado_parcial'
        OR EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items WHERE order_item_id=order_item AND reserved_quantity-consumed_quantity-released_quantity<>0) THEN
        RAISE EXCEPTION 'Restante continuou entregável/reservado'; END IF;
      SELECT a.initial_balance+COALESCE(sum(CASE WHEN t.transaction_type='entrada' THEN t.amount ELSE -t.amount END)
        FILTER(WHERE t.is_paid IS TRUE AND t.cancelled_at IS NULL),0) INTO balance
        FROM public.financial_accounts a LEFT JOIN public.financial_transactions t ON t.account_id=a.id WHERE a.id=account GROUP BY a.initial_balance;
      SELECT sum(amount) INTO custody FROM public.pdv_cash_custody_entries ce WHERE ce.session_id=fixture.session_id;
      IF balance<>(CASE WHEN scenario='refund' THEN 85 ELSE 100 END) OR custody<>balance THEN
        RAISE EXCEPTION 'Cofre/gaveta integralmente lastreados divergiram: % / %',balance,custody; END IF;
      IF scenario='customer_credit' AND public.pdv_party_available_credit_v2(company,'customer',customer)<>15 THEN
        RAISE EXCEPTION 'Crédito final não é15'; END IF;
      IF scenario<>'customer_credit' AND public.pdv_party_available_credit_v2(company,'customer',customer)<>0 THEN
        RAISE EXCEPTION 'Voucher/reembolso deixou crédito duplicado'; END IF;
      IF scenario<>'refund' AND before_counts->'financial'<>after_counts->'financial' THEN
        RAISE EXCEPTION 'Crédito/voucher fabricou dinheiro'; END IF;
      IF scenario='customer_credit' THEN
        -- Compatibilidade da origem W5 antiga: devolução de fatia REAL já
        -- entregue, voucher, estorno, refund e estorno pelos writers públicos.
        -- Não cria devolução do restante nunca entregue. Subtransação isolada.
        BEGIN
          SELECT di.id INTO delivery_item FROM public.pdv_delivery_items di WHERE di.order_item_id=order_item;
          EXECUTE 'SET LOCAL ROLE authenticated';
          credit_result:=public.pdv_return_delivery_items_v2(order_id,
            jsonb_build_array(jsonb_build_object('delivery_item_id',delivery_item,'quantity',1,
              'destination','saleable','destination_stock_id',stock)),
            jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',5)),company_day,
            'Devolução fictícia de unidade realmente entregue','res1513-legacy-return-real');
          source_return:=(credit_result->>'return_id')::uuid;
          credit_result:=public.pdv_issue_return_voucher_v2(source_return,5,NULL,'res1513-legacy-return-voucher');
          legacy_voucher:=(credit_result->>'voucher_id')::uuid;
          PERFORM public.pdv_reverse_return_voucher_v2(legacy_voucher,'Estorno voucher da devolução real','res1513-legacy-return-reverse-voucher');
          credit_result:=public.pdv_request_return_refund_v2(source_return,payment_id,5,'Reembolso da unidade realmente entregue',
            account,session_id,'res1513-legacy-return-refund');
          legacy_refund:=(credit_result->>'refund_id')::uuid;
          EXECUTE 'RESET ROLE';
          IF (SELECT sum(ce.amount) FROM public.pdv_cash_custody_entries ce WHERE ce.session_id=fixture.session_id)<>95 THEN
            RAISE EXCEPTION 'Refund W5 antigo não debitou a mesma gaveta'; END IF;
          EXECUTE 'SET LOCAL ROLE authenticated';
          PERFORM public.pdv_reverse_return_refund_v2(legacy_refund,'Estorno refund da devolução real','res1513-legacy-return-reverse-refund');
          SET CONSTRAINTS pdv_refund_cash_pair_v3 IMMEDIATE;
          SET CONSTRAINTS pdv_refund_cash_pair_v3 DEFERRED;
          EXECUTE 'RESET ROLE';
          IF (SELECT sum(ce.amount) FROM public.pdv_cash_custody_entries ce WHERE ce.session_id=fixture.session_id)<>100 THEN
            RAISE EXCEPTION 'Estorno W5 antigo não recompôs a mesma gaveta'; END IF;
          IF NOT EXISTS(SELECT 1 FROM public.pdv_refunds r WHERE r.id=legacy_refund
            AND r.commercial_return_id=source_return AND r.residual_cancellation_id IS NULL) THEN
            RAISE EXCEPTION 'Origem legada de devolução foi trocada por residual'; END IF;
          EXECUTE 'SET LOCAL ROLE authenticated';
          credit_result:=public.pdv_reverse_commercial_return_v2(source_return,
            'Compensação da devolução real','res1513-legacy-return-reverse-commercial');
          EXECUTE 'RESET ROLE';
          IF NOT EXISTS(SELECT 1 FROM public.pdv_commercial_returns r
              WHERE r.id=(credit_result->>'return_id')::uuid
                AND r.reversal_of_id=source_return
                AND r.event_kind='reversal')
            OR public.pdv_party_available_credit_v2(company,'customer',customer)<>15 THEN
            RAISE EXCEPTION 'Compensação da devolução real não recompôs estoque/crédito';
          END IF;
          RAISE EXCEPTION 'rollback_legacy_return_compatibility' USING ERRCODE='P1530';
        EXCEPTION WHEN SQLSTATE 'P1530' THEN NULL;
        END;
      END IF;
      IF scenario='voucher' THEN
        SELECT v.id INTO voucher_id FROM public.pdv_vouchers v WHERE source_residual_cancellation_id=cancellation_id;
      END IF;
      IF scenario IN('customer_credit','voucher') THEN
        -- Checkout real consome o valor recém-gerado em uma nova venda.
        -- ROLLBACK interno preserva o restante original e permite estornar o
        -- voucher no teste seguinte. Nada é fabricado no livro financeiro.
        BEGIN
          spend_preorder:=gen_random_uuid(); spend_item:=gen_random_uuid();
          EXECUTE 'SET LOCAL ROLE authenticated';
          PERFORM public.pdv_save_preorder_v2(spend_preorder,0,
            jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','discount_amount',0),
            jsonb_build_array(jsonb_build_object('id',spend_item,'inventory_id',material,'item_type','material',
              'description','Compra fictícia por saldo/voucher','quantity',3,'unit_price',5,'discount_amount',0,'unit_factor',1,'sort_order',0)),
            'res1513-spend-save');
          PERFORM public.pdv_assign_preorder_terminal_v3(spend_preorder,1,terminal,'res1513-spend-destination');
          PERFORM public.pdv_forward_preorder_v2(spend_preorder,2,'res1513-spend-forward');
          credit_result:=public.pdv_convert_preorder_v2(spend_preorder,3,'res1513-spend-convert');
          spend_order:=(credit_result->>'order_id')::uuid;
          PERFORM public.pdv_cover_existing_order_v2(spend_order,terminal,session_id,account,
            jsonb_build_array(jsonb_build_object('method',CASE WHEN scenario='customer_credit' THEN 'saldo_cliente' ELSE 'voucher' END,'amount',15)
              ||CASE WHEN scenario='voucher' THEN jsonb_build_object('reference_id',voucher_id) ELSE '{}' END),'res1513-spend-cover');
          SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
          IF current_debt<>0 THEN RAISE EXCEPTION 'Consumo do saldo/voucher não levou posição a zero'; END IF;
          EXECUTE 'RESET ROLE';
          IF scenario='customer_credit' THEN
            SELECT e.target_financial_transaction_id INTO spend_principal
              FROM public.pdv_order_payments p JOIN public.pdv_party_credit_entries e ON e.id=p.party_credit_entry_id
              WHERE p.order_id=spend_order AND p.coverage_kind='customer_credit';
            IF spend_principal IS NULL OR public.pdv_party_obligation_open_v2(spend_principal)<>0
              OR public.pdv_party_available_credit_v2(company,'customer',customer)<>0 THEN
              RAISE EXCEPTION 'Checkout saldo não criou/quitou ponte principal canônica'; END IF;
            IF NOT EXISTS(SELECT 1 FROM public.financial_transactions f WHERE f.id=spend_principal
              AND f.pdv_financial_role='pdv_receivable_principal' AND f.amount=15 AND f.is_paid IS FALSE) THEN
              RAISE EXCEPTION 'Consumo de saldo virou dinheiro recebido'; END IF;
          ELSIF public.pdv_voucher_balance_internal_v2(voucher_id)<>0 THEN
            RAISE EXCEPTION 'Checkout não consumiu o voucher';
          END IF;
          IF (SELECT sum(ce.amount) FROM public.pdv_cash_custody_entries ce WHERE ce.session_id=fixture.session_id)<>100 THEN
            RAISE EXCEPTION 'Checkout saldo/voucher alterou dinheiro na gaveta'; END IF;
          RAISE EXCEPTION 'rollback_spend_credit' USING ERRCODE='P1530';
        EXCEPTION WHEN SQLSTATE 'P1530' THEN NULL;
        END;
      END IF;
      IF scenario='voucher' THEN
        SELECT v.id INTO voucher_id FROM public.pdv_vouchers v WHERE source_residual_cancellation_id=cancellation_id;
        IF public.pdv_voucher_balance_internal_v2(voucher_id)<>15 THEN RAISE EXCEPTION 'Voucher não é15'; END IF;
        EXECUTE 'SET LOCAL ROLE authenticated';
        retry:=public.pdv_search_vouchers_v2(NULL,customer,20,0);
        IF (retry->>'total')::integer<>1 THEN RAISE EXCEPTION 'Voucher residual sumiu da busca canônica'; END IF;
        PERFORM public.pdv_reverse_return_voucher_v2(voucher_id,'Estorno fictício','res1513-reverse-voucher');
        EXECUTE 'RESET ROLE';
      ELSIF scenario='refund' THEN
        SELECT r.id INTO refund_id FROM public.pdv_refunds r WHERE residual_cancellation_id=cancellation_id;
        -- Obriga a assertion diferida antes do rollback da subtransação.
        SET CONSTRAINTS pdv_refund_cash_pair_v3 IMMEDIATE;
        SET CONSTRAINTS pdv_refund_cash_pair_v3 DEFERRED;
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM public.pdv_reverse_return_refund_v2(refund_id,'Estorno fictício','res1513-reverse-refund');
        SET CONSTRAINTS pdv_refund_cash_pair_v3 IMMEDIATE;
        EXECUTE 'RESET ROLE';
        IF (SELECT sum(amount) FROM public.pdv_cash_custody_entries ce WHERE ce.session_id=fixture.session_id)<>100 THEN
          RAISE EXCEPTION 'Estorno não recompôs a mesma gaveta'; END IF;
        SELECT a.initial_balance+COALESCE(sum(CASE WHEN t.transaction_type='entrada' THEN t.amount ELSE -t.amount END)
          FILTER(WHERE t.is_paid IS TRUE AND t.cancelled_at IS NULL),0) INTO balance
          FROM public.financial_accounts a LEFT JOIN public.financial_transactions t ON t.account_id=a.id
          WHERE a.id=account GROUP BY a.initial_balance;
        IF balance<>100 THEN RAISE EXCEPTION 'Estorno não recompôs o mesmo cofre'; END IF;
        SET CONSTRAINTS pdv_refund_cash_pair_v3 DEFERRED;
      END IF;
      IF scenario IN('voucher','refund') THEN
        EXECUTE 'SET LOCAL ROLE authenticated';
        retry:=public.pdv_get_order_residual_cancellation_v3(order_id);
        IF retry->>'financial_status'<>'pending_disposition' OR (retry->>'unallocated_amount')::numeric<>15 THEN
          RAISE EXCEPTION 'Estorno ocultou o valor pendente de nova destinação'; END IF;
        EXECUTE 'RESET ROLE';
      END IF;
      -- Same authenticated identity cannot read/mutate the first tenant after switching company.
      UPDATE public.profiles SET company_id=foreign_company WHERE user_id=actor;
      EXECUTE 'SET LOCAL ROLE authenticated';
      blocked:=false;
      BEGIN PERFORM public.pdv_get_order_residual_cancellation_v3(order_id);
      EXCEPTION WHEN insufficient_privilege OR no_data_found THEN blocked:=true; END;
      IF NOT blocked THEN RAISE EXCEPTION 'Leitura residual atravessou tenant'; END IF;
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'rollback_fixture_%',scenario USING ERRCODE='P1513';
    EXCEPTION WHEN SQLSTATE 'P1513' THEN
      -- A reversão desta subtransação remove cadastro, fatos, claims e coorte.
      EXECUTE 'RESET ROLE';
      passed:=passed+1;
    END;
    IF EXISTS(SELECT 1 FROM public.companies WHERE id=company) OR EXISTS(SELECT 1 FROM public.pdv_order_residual_cancellations WHERE company_id=company) THEN
      RAISE EXCEPTION 'Fixture não foi removida após rollback'; END IF;
  END LOOP;
  IF passed<>3 THEN RAISE EXCEPTION 'Matriz residual incompleta'; END IF;
END $behavior$;
ROLLBACK;
