-- Contrato da aba "Vendas" dos relatorios do PDV (pdv_sales_report_v1).
-- Executar depois de supabase db reset. Cobre ACL, SECURITY DEFINER/search_path,
-- fail-closed sem as capacidades do Resumo v4, validacao de entrada (22023),
-- forma do payload nas 4 dimensoes e ESCOPO DE ESTOQUE por impersonacao:
-- usuario restrito a um estoque nao ve receita de outro em nenhuma dimensao.
-- Os numeros esperados vem de pdv_commercial_facts_v2 (fonte unica), nao de
-- constantes, para o teste nao depender do rateio feito pelos gatilhos.
BEGIN;

DO $contract$
DECLARE v_fn text:='public.pdv_sales_report_v1(text,date,date,integer,integer)';
BEGIN
  IF has_function_privilege('anon',v_fn,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'ACL incorreta em %',v_fn; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc procedure, aclexplode(procedure.proacl) acl
    WHERE procedure.oid=v_fn::regprocedure AND acl.grantee=0) THEN
    RAISE EXCEPTION 'PUBLIC ainda executa %',v_fn; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc procedure
    WHERE procedure.oid=v_fn::regprocedure
      AND procedure.prosecdef
      AND procedure.provolatile='s'
      AND 'search_path=pg_catalog, public'=ANY(procedure.proconfig)) THEN
    RAISE EXCEPTION 'RPC sem STABLE/SECURITY DEFINER/search_path fixo em %',v_fn; END IF;
  IF COALESCE(obj_description(v_fn::regprocedure,'pg_proc'),'') NOT ILIKE '%can_access_stock%' THEN
    RAISE EXCEPTION 'funcao sem COMMENT explicando o escopo de estoque'; END IF;
END
$contract$;

DO $behavior$
DECLARE
  company_a uuid:='c5a1e500-0000-4000-8000-000000000001';
  company_b uuid:='c5a1e500-0000-4000-8000-000000000002';
  user_admin uuid:='c5a1e500-0000-4000-8000-000000000011';
  user_sector uuid:='c5a1e500-0000-4000-8000-000000000012';
  user_other_sector uuid:='c5a1e500-0000-4000-8000-000000000013';
  user_no_finance uuid:='c5a1e500-0000-4000-8000-000000000014';
  user_no_cash uuid:='c5a1e500-0000-4000-8000-000000000015';
  user_tenant_b uuid:='c5a1e500-0000-4000-8000-000000000016';
  stock_1 uuid:='c5a1e500-0000-4000-8000-000000000021';
  stock_2 uuid:='c5a1e500-0000-4000-8000-000000000022';
  customer_1 uuid:='c5a1e500-0000-4000-8000-000000000031';
  inventory_1 uuid:='c5a1e500-0000-4000-8000-000000000041';
  inventory_2 uuid:='c5a1e500-0000-4000-8000-000000000042';
  order_1 uuid:='c5a1e500-0000-4000-8000-000000000051';
  order_2 uuid:='c5a1e500-0000-4000-8000-000000000052';
  item_1 uuid:='c5a1e500-0000-4000-8000-000000000061';
  item_2 uuid:='c5a1e500-0000-4000-8000-000000000062';
  reservation_1 uuid:='c5a1e500-0000-4000-8000-000000000071';
  reservation_2 uuid:='c5a1e500-0000-4000-8000-000000000072';
  movement_1 uuid:='c5a1e500-0000-4000-8000-000000000081';
  movement_2 uuid:='c5a1e500-0000-4000-8000-000000000082';
  delivery_1 uuid:='c5a1e500-0000-4000-8000-000000000091';
  delivery_2 uuid:='c5a1e500-0000-4000-8000-000000000092';
  delivery_item_1 uuid:='c5a1e500-0000-4000-8000-0000000000a1';
  delivery_item_2 uuid:='c5a1e500-0000-4000-8000-0000000000a2';
  today_a date; report jsonb; v_dim text; v_detail text; v_state text; blocked boolean;
  expected_revenue numeric; expected_cmv numeric; expected_quantity numeric;
  sector_revenue numeric; other_revenue numeric;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000',u.id,'authenticated','authenticated',u.email,'',now(),
         '{}','{}',now(),now(),'','','',''
    FROM (VALUES(user_admin,'sales-admin@example.invalid'),(user_sector,'sales-sector@example.invalid'),
                (user_other_sector,'sales-other@example.invalid'),(user_no_finance,'sales-nofin@example.invalid'),
                (user_no_cash,'sales-nocash@example.invalid'),(user_tenant_b,'sales-tenantb@example.invalid')) u(id,email);
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan,subscription_expires_at) VALUES
    (company_a,'Vendas Empresa PDV','active','start',now()+interval '10 days'),
    (company_b,'Vendas Outro tenant','active','start',now()+interval '10 days');
  UPDATE public.profiles SET company_id=company_a,is_active=true
   WHERE user_id IN(user_admin,user_sector,user_other_sector,user_no_finance,user_no_cash);
  UPDATE public.profiles SET full_name='Vendedora Setor' WHERE user_id=user_sector;
  UPDATE public.profiles SET full_name='Dono Admin' WHERE user_id=user_admin;
  UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=user_tenant_b;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (user_admin,'admin'),(user_sector,'comercial'),(user_other_sector,'comercial'),
    (user_no_finance,'comercial'),(user_no_cash,'comercial'),(user_tenant_b,'admin');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_sector,'["screen:pdv_reports","fn:operate_other_pdv_cash","fn:view_finance_totals"]',true),
    (user_other_sector,'["screen:pdv_reports","fn:operate_other_pdv_cash","fn:view_finance_totals"]',true),
    (user_no_finance,'["screen:pdv_reports","fn:operate_other_pdv_cash"]',true),
    (user_no_cash,'["screen:pdv_reports","fn:view_finance_totals"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES
    (company_a,'basic'),(company_a,'pdv'),(company_b,'basic'),(company_b,'pdv');
  INSERT INTO public.company_settings(company_id,name,timezone) VALUES(company_a,'Vendas Empresa PDV','America/Sao_Paulo')
  ON CONFLICT (company_id) DO UPDATE SET name=EXCLUDED.name, timezone=EXCLUDED.timezone;
  today_a:=public.company_today(company_a);

  UPDATE public.stocks SET is_default=false WHERE company_id=company_a AND is_default IS TRUE;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock_1,company_a,'Setor Loja',true),(stock_2,company_a,'Setor Oficina',false);
  -- Cada setor tem dono: quem nao esta na lista do estoque nao o enxerga.
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES
    (company_a,stock_1,user_sector),(company_a,stock_2,user_other_sector);
  INSERT INTO public.customers(id,company_id,name) VALUES(customer_1,company_a,'Cliente Balcão');
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES
    (inventory_1,company_a,'VD-1','Capacitor 35uF','un',2,2,5),
    (inventory_2,company_a,'VD-2','Gás da oficina','kg',1,NULL,50);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity) VALUES
    (company_a,inventory_1,stock_1,2),(company_a,inventory_2,stock_2,1);

  -- Venda 1: setor Loja, com cliente e vendedora, 10h15 local, custo conhecido.
  -- Venda 2: setor Oficina, sem cliente, admin vende, 15h30 local, custo desconhecido.
  INSERT INTO public.pdv_orders(id,company_id,number,stock_id,customer_id,salesperson_id,status,subtotal,total,
    client_request_id,contract_version,operation_mode_snapshot) VALUES
    (order_1,company_a,900001,stock_1,customer_1,user_sector,'entregue',10,10,'sales-report-1',2,'direct'),
    (order_2,company_a,900002,stock_2,NULL,user_admin,'entregue',50,50,'sales-report-2',2,'direct');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,total,
    sort_order,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES
    (item_1,company_a,order_1,inventory_1,'Capacitor 35uF',2,5,2,10,1,'material',2,2,10,0,0),
    (item_2,company_a,order_2,inventory_2,'Gás da oficina',1,50,0,50,1,'material',NULL,2,50,0,0);
  INSERT INTO public.pdv_stock_reservation_items(id,company_id,inventory_id,stock_id,order_item_id,state,
    reserved_quantity,consumed_quantity,cost_price_snapshot) VALUES
    (reservation_1,company_a,inventory_1,stock_1,item_1,'consumed',2,2,2),
    (reservation_2,company_a,inventory_2,stock_2,item_2,'consumed',1,1,NULL);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes,created_at)
  VALUES
    (movement_1,company_a,inventory_1,stock_1,'saida',-2,2,'Entrega vendas 1',(today_a+time '10:15') AT TIME ZONE 'America/Sao_Paulo'),
    (movement_2,company_a,inventory_2,stock_2,'saida',-1,NULL,'Entrega vendas 2',(today_a+time '15:30') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_at) VALUES
    (delivery_1,company_a,order_1,gen_random_uuid(),repeat('7',64),(today_a+time '10:15') AT TIME ZONE 'America/Sao_Paulo'),
    (delivery_2,company_a,order_2,gen_random_uuid(),repeat('8',64),(today_a+time '15:30') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,reservation_id,inventory_movement_id,
    quantity,item_type,unit_cost_snapshot) VALUES
    (delivery_item_1,company_a,delivery_1,item_1,reservation_1,movement_1,2,'material',2),
    (delivery_item_2,company_a,delivery_2,item_2,reservation_2,movement_2,1,'material',NULL);

  SELECT round(sum(net_revenue),2),
         CASE WHEN bool_or(NOT cost_known) THEN NULL ELSE round(sum(net_cmv),2) END,
         sum(net_quantity),
         round(sum(net_revenue) FILTER (WHERE stock_id=stock_1),2),
         round(sum(net_revenue) FILTER (WHERE stock_id=stock_2),2)
    INTO expected_revenue,expected_cmv,expected_quantity,sector_revenue,other_revenue
    FROM public.pdv_commercial_facts_v2(company_a) WHERE event_date=today_a;
  IF expected_revenue IS NULL OR sector_revenue IS NULL OR other_revenue IS NULL
     OR sector_revenue<=0 OR other_revenue<=0 OR expected_cmv IS NOT NULL THEN
    RAISE EXCEPTION 'fixture nao gerou fatos nos dois setores (custo desconhecido no 2): % % % %',
      expected_revenue,sector_revenue,other_revenue,expected_cmv; END IF;

  -- Sem ator: a trava de outros caixas vem antes de tudo.
  PERFORM set_config('request.jwt.claims','',true);
  BEGIN
    PERFORM public.pdv_sales_report_v1('product',today_a,today_a,50,0);
    RAISE EXCEPTION 'relatorio respondeu sem ator';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'code=pdv_cross_cash_report_denied' THEN
      RAISE EXCEPTION 'sem ator com detail inesperado: %',v_detail; END IF;
  END;

  -- Sem fn:operate_other_pdv_cash: negado.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_no_cash,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.pdv_sales_report_v1('product',today_a,today_a,50,0);
    RAISE EXCEPTION 'relatorio respondeu sem capacidade de caixa';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'code=pdv_cross_cash_report_denied' THEN
      RAISE EXCEPTION 'trava de caixa com detail inesperado: %',v_detail; END IF;
  END;

  -- Sem fn:view_finance_totals: negado.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_no_finance,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.pdv_sales_report_v1('product',today_a,today_a,50,0);
    RAISE EXCEPTION 'relatorio respondeu sem totais financeiros';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'code=pdv_finance_report_denied' THEN
      RAISE EXCEPTION 'trava financeira com detail inesperado: %',v_detail; END IF;
  END;

  -- Entradas invalidas: 22023 com mensagem PT-BR.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_admin,'role','authenticated')::text,true);
  FOR v_dim IN SELECT x FROM unnest(ARRAY['dim','periodo','periodo_nulo','limite0','limite501','limite_nulo','offset']) x LOOP
    blocked:=false;
    BEGIN
      CASE v_dim
        WHEN 'dim' THEN PERFORM public.pdv_sales_report_v1('categoria',today_a,today_a,50,0);
        WHEN 'periodo' THEN PERFORM public.pdv_sales_report_v1('product',today_a,today_a-1,50,0);
        WHEN 'periodo_nulo' THEN PERFORM public.pdv_sales_report_v1('product',NULL,today_a,50,0);
        WHEN 'limite0' THEN PERFORM public.pdv_sales_report_v1('product',today_a,today_a,0,0);
        WHEN 'limite501' THEN PERFORM public.pdv_sales_report_v1('product',today_a,today_a,501,0);
        WHEN 'limite_nulo' THEN PERFORM public.pdv_sales_report_v1('product',today_a,today_a,NULL,0);
        ELSE PERFORM public.pdv_sales_report_v1('product',today_a,today_a,50,-1);
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_detail=MESSAGE_TEXT;
      IF v_state<>'22023' OR v_detail !~ '(inválid|Escolha)' THEN
        RAISE EXCEPTION 'entrada % falhou com % / %',v_dim,v_state,v_detail; END IF;
      blocked:=true;
    END;
    IF NOT blocked THEN RAISE EXCEPTION 'entrada invalida aceita: %',v_dim; END IF;
  END LOOP;

  -- Admin: ve os dois setores. Totais = fonte unica, linhas somam os totais.
  FOREACH v_dim IN ARRAY ARRAY['product','customer','salesperson','hour'] LOOP
    report:=public.pdv_sales_report_v1(v_dim,today_a,today_a,50,0);
    IF report->>'dimension'<>v_dim OR report->>'from'<>today_a::text OR report->>'to'<>today_a::text
       OR (report->>'limit')::int<>50 OR (report->>'offset')::int<>0
       OR jsonb_typeof(report->'rows')<>'array' OR jsonb_typeof(report->'has_more')<>'boolean'
       OR (report#>>'{totals,revenue}')::numeric<>expected_revenue
       OR report#>'{totals,cmv}'<>'null'::jsonb OR report#>'{totals,margin}'<>'null'::jsonb
       OR (report#>>'{totals,quantity}')::numeric<>expected_quantity
       OR (report#>>'{totals,orders_count}')::int<>2
       OR (report->>'total_count')::int<>jsonb_array_length(report->'rows') THEN
      RAISE EXCEPTION 'payload/totais do admin errados em %: %',v_dim,report; END IF;
    IF (SELECT round(sum((r->>'revenue')::numeric),2) FROM jsonb_array_elements(report->'rows') r)<>expected_revenue
       OR (SELECT sum((r->>'quantity')::numeric) FROM jsonb_array_elements(report->'rows') r)<>expected_quantity THEN
      RAISE EXCEPTION 'linhas nao somam os totais em %: %',v_dim,report; END IF;
    -- CMV desconhecido derruba cmv e margem so no grupo que o contem.
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r
        WHERE r->'cmv'='null'::jsonb AND r->'margin'='null'::jsonb)
       OR (v_dim<>'hour' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r
        WHERE r->'cmv'<>'null'::jsonb AND (r->>'margin')::numeric=(r->>'revenue')::numeric-(r->>'cmv')::numeric)) THEN
      RAISE EXCEPTION 'propagacao de CMV desconhecido errada em %: %',v_dim,report; END IF;
    -- Nenhum id de pedido no payload; uuid so pode aparecer em key.
    IF report::text LIKE '%'||order_1::text||'%' OR report::text LIKE '%'||order_2::text||'%'
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r, jsonb_each_text(r-'key') f
          WHERE f.value ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') THEN
      RAISE EXCEPTION 'id vazou no payload de %: %',v_dim,report; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r
        WHERE NOT (r ?& ARRAY['key','label','detail','orders_count','quantity','revenue','cmv','margin','share'])) THEN
      RAISE EXCEPTION 'linha sem campo do contrato em %: %',v_dim,report; END IF;
  END LOOP;

  report:=public.pdv_sales_report_v1('customer',today_a,today_a,50,0);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r
      WHERE r->'key'='null'::jsonb AND r->>'label'='Sem cliente identificado')
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r
      WHERE r->>'key'=customer_1::text AND r->>'label'='Cliente Balcão') THEN
    RAISE EXCEPTION 'rotulos de cliente errados: %',report; END IF;
  report:=public.pdv_sales_report_v1('salesperson',today_a,today_a,50,0);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r
      WHERE r->>'key'=user_sector::text AND r->>'label'='Vendedora Setor') THEN
    RAISE EXCEPTION 'rotulo de vendedor errado: %',report; END IF;
  report:=public.pdv_sales_report_v1('product',today_a,today_a,50,0);
  IF report#>>'{rows,0,label}'<>'Gás da oficina' OR report#>>'{rows,1,detail}'<>'SKU VD-1 · un'
     OR (report#>>'{rows,0,share}')::numeric+(report#>>'{rows,1,share}')::numeric NOT BETWEEN 0.999 AND 1.001 THEN
    RAISE EXCEPTION 'ranking por produto fora de ordem (receita desc): %',report; END IF;
  -- Horario e hora local da empresa, ordenado 0..23.
  report:=public.pdv_sales_report_v1('hour',today_a,today_a,50,0);
  IF report#>>'{rows,0,key}'<>'10' OR report#>>'{rows,1,key}'<>'15'
     OR report#>>'{rows,0,label}'<>'10h às 11h' THEN
    RAISE EXCEPTION 'horario local/ordem errados: %',report; END IF;
  -- Paginacao recorta o ranking inteiro.
  report:=public.pdv_sales_report_v1('product',today_a,today_a,1,1);
  IF (report->>'total_count')::int<>2 OR (report->>'has_more')::boolean
     OR jsonb_array_length(report->'rows')<>1 OR report#>>'{rows,0,label}'<>'Capacitor 35uF' THEN
    RAISE EXCEPTION 'paginacao errada: %',report; END IF;
  report:=public.pdv_sales_report_v1('product',today_a,today_a,1,0);
  IF NOT (report->>'has_more')::boolean THEN
    RAISE EXCEPTION 'has_more falso com segunda pagina: %',report; END IF;

  -- ESCOPO DE ESTOQUE: a vendedora do setor Loja so ve a Loja, em toda
  -- dimensao e nos totais; o dono da Oficina so ve a Oficina.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_sector,'role','authenticated')::text,true);
  FOREACH v_dim IN ARRAY ARRAY['product','customer','salesperson','hour'] LOOP
    report:=public.pdv_sales_report_v1(v_dim,today_a,today_a,50,0);
    IF (report#>>'{totals,revenue}')::numeric<>sector_revenue
       OR report#>'{totals,cmv}'='null'::jsonb
       OR (report#>>'{totals,orders_count}')::int<>1
       OR (SELECT round(sum((r->>'revenue')::numeric),2) FROM jsonb_array_elements(report->'rows') r)<>sector_revenue
       OR report::text LIKE '%Gás da oficina%' OR report::text LIKE '%'||inventory_2::text||'%'
       OR report::text LIKE '%Sem cliente identificado%' OR report::text LIKE '%Dono Admin%'
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r WHERE r->>'key'='15') THEN
      RAISE EXCEPTION 'setor Loja enxergou a Oficina em %: %',v_dim,report; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_other_sector,'role','authenticated')::text,true);
  FOREACH v_dim IN ARRAY ARRAY['product','customer','salesperson','hour'] LOOP
    report:=public.pdv_sales_report_v1(v_dim,today_a,today_a,50,0);
    IF (report#>>'{totals,revenue}')::numeric<>other_revenue
       OR report#>'{totals,cmv}'<>'null'::jsonb
       OR report::text LIKE '%Capacitor%' OR report::text LIKE '%Cliente Balcão%'
       OR report::text LIKE '%Vendedora Setor%' THEN
      RAISE EXCEPTION 'setor Oficina enxergou a Loja em %: %',v_dim,report; END IF;
  END LOOP;

  -- Outro tenant (admin com PDV) nao ve nada da empresa A.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_tenant_b,'role','authenticated')::text,true);
  report:=public.pdv_sales_report_v1('product',today_a,today_a,50,0);
  IF (report#>>'{totals,revenue}')::numeric<>0 OR jsonb_array_length(report->'rows')<>0
     OR (report#>>'{totals,cmv}')::numeric<>0 OR report->>'has_more'<>'false' THEN
    RAISE EXCEPTION 'outro tenant viu vendas da empresa A: %',report; END IF;
END
$behavior$;

ROLLBACK;
