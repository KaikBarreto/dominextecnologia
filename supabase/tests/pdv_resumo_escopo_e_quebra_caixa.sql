-- Resumo do PDV (pdv_partial_projection_report_v4): escopo de estoque e
-- papel da quebra de caixa. Migrations 20261122100000 e 20261122101000.
-- Executar depois de supabase db reset.
--
-- Cobre:
-- * ACL: v4 segue para authenticated; v3 legado revogado; helpers internos
--   novos sem EXECUTE para anon/authenticated.
-- * Escopo por impersonacao: usuario restrito a um estoque nao ve receita,
--   despesa nem fluxo de outro estoque, nas linhas nem nos totais do topo;
--   lancamento do PDV sem estoque resolvido so aparece para o admin; o admin
--   ve exatamente a projecao da empresa inteira (pdv_financial_projection_page_v2).
-- * Fechamento real (pdv_close_cash_session_v2) grava pdv_cash_surplus /
--   pdv_cash_shortage com o grupo = pedido de operacao da custodia.
-- * Sobra nao aparece como receita de venda em nenhum recorte.
BEGIN;

DO $contract$
DECLARE
  v_v4 text:='public.pdv_partial_projection_report_v4(text,date,date,integer,integer)';
  v_v3 text:='public.pdv_partial_projection_report_v3(text,date,date,integer,integer)';
  v_internal text;
BEGIN
  IF has_function_privilege('anon',v_v4,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_v4,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_v4,'EXECUTE') THEN
    RAISE EXCEPTION 'ACL incorreta em %',v_v4; END IF;
  IF has_function_privilege('authenticated',v_v3,'EXECUTE')
     OR has_function_privilege('anon',v_v3,'EXECUTE') THEN
    RAISE EXCEPTION 'v3 legado ainda executavel pelo cliente'; END IF;
  FOREACH v_internal IN ARRAY ARRAY[
    'public.pdv_financial_projection_rows_visible_v1(uuid,uuid)',
    'public.pdv_financial_projection_page_visible_v1(uuid,uuid,text,date,date,integer,integer)',
    'public.pdv_partial_projection_groups_v5(uuid,uuid,text,date,date,integer,integer)'] LOOP
    IF has_function_privilege('anon',v_internal,'EXECUTE')
       OR has_function_privilege('authenticated',v_internal,'EXECUTE') THEN
      RAISE EXCEPTION 'helper interno exposto ao cliente: %',v_internal; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure WHERE procedure.oid=v_internal::regprocedure
        AND procedure.prosecdef AND 'search_path=pg_catalog, public'=ANY(procedure.proconfig)) THEN
      RAISE EXCEPTION 'helper sem SECURITY DEFINER/search_path fixo: %',v_internal; END IF;
  END LOOP;
  IF COALESCE(obj_description(v_v4::regprocedure,'pg_proc'),'') NOT ILIKE '%can_access_stock%' THEN
    RAISE EXCEPTION 'v4 sem COMMENT explicando o escopo de estoque'; END IF;
  IF position('pdv_cash_surplus' IN pg_get_functiondef(
       'public.pdv_close_cash_session_explicit_core_018_v2(uuid,uuid,numeric,text,text)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'fechamento ainda nao grava o papel da quebra'; END IF;
  IF position('20261122101000' IN pg_get_functiondef('public.pdv_guard_financial_treasury_v2()'::regprocedure))>0 THEN
    RAISE EXCEPTION 'excecao temporaria do backfill ficou na trava de tesouraria'; END IF;
END
$contract$;

DO $behavior$
DECLARE
  company_a uuid:='c5a1e600-0000-4000-8000-000000000001';
  user_admin uuid:='c5a1e600-0000-4000-8000-000000000011';
  user_sector uuid:='c5a1e600-0000-4000-8000-000000000012';
  user_other_sector uuid:='c5a1e600-0000-4000-8000-000000000013';
  stock_1 uuid:='c5a1e600-0000-4000-8000-000000000021';
  stock_2 uuid:='c5a1e600-0000-4000-8000-000000000022';
  account_id uuid:='c5a1e600-0000-4000-8000-000000000023';
  terminal_1 uuid:='c5a1e600-0000-4000-8000-000000000024';
  terminal_2 uuid:='c5a1e600-0000-4000-8000-000000000025';
  customer_1 uuid:='c5a1e600-0000-4000-8000-000000000031';
  inventory_1 uuid:='c5a1e600-0000-4000-8000-000000000041';
  inventory_2 uuid:='c5a1e600-0000-4000-8000-000000000042';
  order_1 uuid:='c5a1e600-0000-4000-8000-000000000051';
  order_2 uuid:='c5a1e600-0000-4000-8000-000000000052';
  item_1 uuid:='c5a1e600-0000-4000-8000-000000000061';
  item_2 uuid:='c5a1e600-0000-4000-8000-000000000062';
  reservation_1 uuid:='c5a1e600-0000-4000-8000-000000000071';
  reservation_2 uuid:='c5a1e600-0000-4000-8000-000000000072';
  movement_1 uuid:='c5a1e600-0000-4000-8000-000000000081';
  movement_2 uuid:='c5a1e600-0000-4000-8000-000000000082';
  delivery_1 uuid:='c5a1e600-0000-4000-8000-000000000091';
  delivery_2 uuid:='c5a1e600-0000-4000-8000-000000000092';
  delivery_item_1 uuid:='c5a1e600-0000-4000-8000-0000000000a1';
  delivery_item_2 uuid:='c5a1e600-0000-4000-8000-0000000000a2';
  orphan_tx uuid:='c5a1e600-0000-4000-8000-0000000000b1';
  today_a date; result jsonb; report jsonb; full_page jsonb;
  session_1 uuid; session_2 uuid; surplus_tx uuid; shortage_tx uuid;
  sector_revenue numeric; other_revenue numeric; v_proj text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000',u.id,'authenticated','authenticated',u.email,'',now(),
         '{}','{}',now(),now(),'','','',''
    FROM (VALUES(user_admin,'resumo-admin@example.invalid'),(user_sector,'resumo-sector@example.invalid'),
                (user_other_sector,'resumo-other@example.invalid')) u(id,email);
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan,subscription_expires_at) VALUES
    (company_a,'Resumo Empresa PDV','active','start',now()+interval '10 days');
  UPDATE public.profiles SET company_id=company_a,is_active=true
   WHERE user_id IN(user_admin,user_sector,user_other_sector);
  INSERT INTO public.user_roles(user_id,role) VALUES
    (user_admin,'admin'),(user_sector,'comercial'),(user_other_sector,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_sector,'["screen:pdv","screen:pdv_reports","fn:operate_other_pdv_cash","fn:view_finance_totals"]',true),
    (user_other_sector,'["screen:pdv","screen:pdv_reports","fn:operate_other_pdv_cash","fn:view_finance_totals"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(company_a,'basic'),(company_a,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(account_id,company_a,'Cofre resumo','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(company_a,'Resumo Empresa PDV','America/Sao_Paulo',account_id,true,'simples')
  ON CONFLICT (company_id) DO UPDATE SET name=EXCLUDED.name,timezone=EXCLUDED.timezone,
    pdv_cash_account_id=EXCLUDED.pdv_cash_account_id,pdv_strict_cash_tracking=true,pdv_mode='simples';
  today_a:=public.company_today(company_a);

  UPDATE public.stocks SET is_default=false WHERE company_id=company_a AND is_default IS TRUE;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock_1,company_a,'Setor Loja',true),(stock_2,company_a,'Setor Oficina',false);
  -- Cada setor tem dono: quem nao esta na lista do estoque nao o enxerga.
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES
    (company_a,stock_1,user_sector),(company_a,stock_2,user_other_sector);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES
    (terminal_1,company_a,'Caixa Loja',stock_1,true),(terminal_2,company_a,'Caixa Oficina',stock_2,true);
  INSERT INTO public.customers(id,company_id,name) VALUES(customer_1,company_a,'Cliente Balcão');
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES
    (inventory_1,company_a,'RS-1','Capacitor 35uF','un',2,2,5),
    (inventory_2,company_a,'RS-2','Gás da oficina','kg',1,10,50);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity) VALUES
    (company_a,inventory_1,stock_1,2),(company_a,inventory_2,stock_2,1);

  -- Venda 1 no setor Loja, venda 2 no setor Oficina (mesmo dia).
  INSERT INTO public.pdv_orders(id,company_id,number,stock_id,customer_id,salesperson_id,status,subtotal,total,
    client_request_id,contract_version,operation_mode_snapshot) VALUES
    (order_1,company_a,910001,stock_1,customer_1,user_sector,'entregue',10,10,'resumo-1',2,'direct'),
    (order_2,company_a,910002,stock_2,NULL,user_admin,'entregue',50,50,'resumo-2',2,'direct');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,total,
    sort_order,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES
    (item_1,company_a,order_1,inventory_1,'Capacitor 35uF',2,5,2,10,1,'material',2,2,10,0,0),
    (item_2,company_a,order_2,inventory_2,'Gás da oficina',1,50,10,50,1,'material',10,2,50,0,0);
  INSERT INTO public.pdv_stock_reservation_items(id,company_id,inventory_id,stock_id,order_item_id,state,
    reserved_quantity,consumed_quantity,cost_price_snapshot) VALUES
    (reservation_1,company_a,inventory_1,stock_1,item_1,'consumed',2,2,2),
    (reservation_2,company_a,inventory_2,stock_2,item_2,'consumed',1,1,10);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes)
  VALUES
    (movement_1,company_a,inventory_1,stock_1,'saida',-2,2,'Entrega resumo 1'),
    (movement_2,company_a,inventory_2,stock_2,'saida',-1,10,'Entrega resumo 2');
  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash) VALUES
    (delivery_1,company_a,order_1,gen_random_uuid(),repeat('5',64)),
    (delivery_2,company_a,order_2,gen_random_uuid(),repeat('6',64));
  INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,reservation_id,inventory_movement_id,
    quantity,item_type,unit_cost_snapshot) VALUES
    (delivery_item_1,company_a,delivery_1,item_1,reservation_1,movement_1,2,'material',2),
    (delivery_item_2,company_a,delivery_2,item_2,reservation_2,movement_2,1,'material',10);

  SELECT round(sum(net_revenue) FILTER (WHERE stock_id=stock_1),2),
         round(sum(net_revenue) FILTER (WHERE stock_id=stock_2),2)
    INTO sector_revenue,other_revenue
    FROM public.pdv_commercial_facts_v2(company_a) WHERE event_date=today_a;
  IF sector_revenue IS NULL OR other_revenue IS NULL OR sector_revenue<=0 OR other_revenue<=0 THEN
    RAISE EXCEPTION 'fixture nao gerou fatos nos dois setores: % %',sector_revenue,other_revenue; END IF;

  -- Lancamento do PDV sem nenhum vinculo (sem pedido, sem sessao): nao tem
  -- estoque resolvido, so o admin pode ver.
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,origin,created_by)
  VALUES(orphan_tx,company_a,'entrada','Lançamento antigo do PDV',7,'Venda no PDV',today_a,today_a,true,'pdv',user_admin);

  -- Fechamento REAL: Loja fecha com sobra de 10; Oficina abre com 30 e fecha
  -- com 20 (falta de 10).
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_sector,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal_1,account_id,0,'resumo-open-1');
  session_1:=(result->>'session_id')::uuid;
  result:=public.pdv_close_cash_session_v2(session_1,account_id,10,'Sobra teste','resumo-close-1');
  surplus_tx:=(result->>'adjustment_transaction_id')::uuid;
  IF result->>'adjustment_kind'<>'surplus' OR surplus_tx IS NULL THEN
    RAISE EXCEPTION 'fechamento com sobra nao gerou ajuste: %',result; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_other_sector,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal_2,account_id,30,'resumo-open-2');
  session_2:=(result->>'session_id')::uuid;
  result:=public.pdv_close_cash_session_v2(session_2,account_id,20,'Falta teste','resumo-close-2');
  shortage_tx:=(result->>'adjustment_transaction_id')::uuid;
  IF result->>'adjustment_kind'<>'shortage' OR shortage_tx IS NULL THEN
    RAISE EXCEPTION 'fechamento com falta nao gerou ajuste: %',result; END IF;

  -- Fechamento novo grava o papel e o grupo da custodia.
  IF NOT EXISTS(SELECT 1 FROM public.financial_transactions ft
      JOIN public.pdv_cash_custody_entries entry
        ON entry.financial_transaction_id=ft.id AND entry.entry_kind='surplus'
     WHERE ft.id=surplus_tx AND ft.pdv_financial_role='pdv_cash_surplus'
       AND ft.pdv_settlement_group_id=entry.operation_request_id
       AND ft.pdv_cash_session_id=session_1 AND ft.category='Quebra de caixa'
       AND ft.transaction_type::text='entrada' AND ft.amount=10) THEN
    RAISE EXCEPTION 'sobra do fechamento sem papel/grupo corretos'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_transactions ft
      JOIN public.pdv_cash_custody_entries entry
        ON entry.financial_transaction_id=ft.id AND entry.entry_kind='shortage'
     WHERE ft.id=shortage_tx AND ft.pdv_financial_role='pdv_cash_shortage'
       AND ft.pdv_settlement_group_id=entry.operation_request_id
       AND ft.pdv_cash_session_id=session_2 AND ft.transaction_type::text='saida' AND ft.amount=10) THEN
    RAISE EXCEPTION 'falta do fechamento sem papel/grupo corretos'; END IF;

  -- ADMIN: ve a empresa inteira, numero a numero igual a projecao company-wide.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_admin,'role','authenticated')::text,true);
  FOREACH v_proj IN ARRAY ARRAY['dre_competence','dre_cash','dfc'] LOOP
    report:=public.pdv_partial_projection_report_v4(v_proj,today_a,today_a,500,0);
    full_page:=public.pdv_financial_projection_page_v2(company_a,v_proj,today_a,today_a,500,0);
    IF report->'revenue'<>full_page->'revenue' OR report->'expense'<>full_page->'expense'
       OR report->'cash_flow'<>full_page->'cash_flow' OR report->'result' IS DISTINCT FROM full_page->'result'
       OR report->'cmv' IS DISTINCT FROM full_page->'cmv' THEN
      RAISE EXCEPTION 'admin nao ve a projecao inteira em %: % x %',v_proj,report,full_page; END IF;
    IF (SELECT round(COALESCE(sum((e->>'revenue')::numeric),0),2) FROM jsonb_array_elements(report->'entries') e)
         <>(report->>'revenue')::numeric
       OR (SELECT round(COALESCE(sum((e->>'expense')::numeric),0),2) FROM jsonb_array_elements(report->'entries') e)
         <>(report->>'expense')::numeric
       OR (SELECT round(COALESCE(sum((e->>'cash_flow')::numeric),0),2) FROM jsonb_array_elements(report->'entries') e)
         <>(report->>'cash_flow')::numeric THEN
      RAISE EXCEPTION 'linhas do admin nao somam o topo em %: %',v_proj,report; END IF;
    -- Sobra nunca e receita, em nenhum recorte.
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
        WHERE e->>'source_type' IN ('pdv_cash_surplus','pdv_cash_shortage')
          AND (e->>'revenue')::numeric<>0) THEN
      RAISE EXCEPTION 'quebra de caixa entrou como receita em %: %',v_proj,report; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
        WHERE e->>'source_type'='legacy_financial' AND (e->>'revenue')::numeric<>7) THEN
      RAISE EXCEPTION 'quebra de caixa ainda cai no legado em %: %',v_proj,report; END IF;
    IF NOT (report ?& ARRAY['scope','projection','from','to','total_count','limit','offset','has_more',
        'revenue','cmv','expense','result','cash_flow','initial_balance','opening_availability',
        'closing_availability','availability_status','entries'])
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
         WHERE NOT (e ?& ARRAY['event_id','event_date','source_type','order_number','item_count',
           'revenue','cmv','expense','cash_flow','details']) OR e->>'event_id' NOT LIKE 'grupo-%') THEN
      RAISE EXCEPTION 'contrato do v4 mudou em %: %',v_proj,report; END IF;
  END LOOP;
  report:=public.pdv_partial_projection_report_v4('dre_competence',today_a,today_a,500,0);
  IF (report->>'revenue')::numeric<>sector_revenue+other_revenue+7
     OR (report->>'expense')::numeric<>0  -- falta 10 e sobra -10 se anulam
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
        WHERE e->>'source_type'='pdv_cash_surplus' AND (e->>'expense')::numeric=-10)
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
        WHERE e->>'source_type'='pdv_cash_shortage' AND (e->>'expense')::numeric=10) THEN
    RAISE EXCEPTION 'competencia do admin errada: %',report; END IF;
  report:=public.pdv_partial_projection_report_v4('dfc',today_a,today_a,500,0);
  IF (report->>'cash_flow')::numeric<>7 THEN  -- +7 legado, +10 sobra, -10 falta
    RAISE EXCEPTION 'DFC do admin errado: %',report; END IF;

  -- SETOR LOJA: so a venda da Loja e a sobra do caixa da Loja.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_sector,'role','authenticated')::text,true);
  report:=public.pdv_partial_projection_report_v4('dre_competence',today_a,today_a,500,0);
  IF (report->>'revenue')::numeric<>sector_revenue
     OR (report->>'expense')::numeric<>-10
     OR (SELECT round(COALESCE(sum((e->>'revenue')::numeric),0),2) FROM jsonb_array_elements(report->'entries') e)<>sector_revenue
     OR report::text LIKE '%Gás da oficina%'
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
        WHERE e->>'source_type' IN ('pdv_cash_shortage','legacy_financial')
           OR (e->>'order_number')::int=910002) THEN
    RAISE EXCEPTION 'setor Loja enxergou fora do seu estoque (competencia): %',report; END IF;
  report:=public.pdv_partial_projection_report_v4('dfc',today_a,today_a,500,0);
  IF (report->>'cash_flow')::numeric<>10 OR (report->>'total_count')::int<>1 THEN
    RAISE EXCEPTION 'setor Loja com DFC errado: %',report; END IF;
  report:=public.pdv_partial_projection_report_v4('dre_competence',today_a,today_a,1,1);
  IF (report->>'total_count')::int<>2 OR (report->>'revenue')::numeric<>sector_revenue THEN
    RAISE EXCEPTION 'pagina 2 do setor Loja mudou o total do topo: %',report; END IF;

  -- SETOR OFICINA: so a venda da Oficina e a falta do caixa da Oficina.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_other_sector,'role','authenticated')::text,true);
  report:=public.pdv_partial_projection_report_v4('dre_competence',today_a,today_a,500,0);
  IF (report->>'revenue')::numeric<>other_revenue
     OR (report->>'expense')::numeric<>10
     OR report::text LIKE '%Capacitor%'
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'entries') e
        WHERE e->>'source_type' IN ('pdv_cash_surplus','legacy_financial')
           OR (e->>'order_number')::int=910001) THEN
    RAISE EXCEPTION 'setor Oficina enxergou fora do seu estoque (competencia): %',report; END IF;
  report:=public.pdv_partial_projection_report_v4('dfc',today_a,today_a,500,0);
  IF (report->>'cash_flow')::numeric<>-10 THEN
    RAISE EXCEPTION 'setor Oficina com DFC errado: %',report; END IF;

  -- v3 legado continua fail-closed mesmo para quem tinha acesso antes.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.pdv_partial_projection_report_v3('dre_competence',today_a,today_a,10,0);
    RESET ROLE;
    RAISE EXCEPTION 'v3 legado ainda responde para authenticated';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
END
$behavior$;

ROLLBACK;
