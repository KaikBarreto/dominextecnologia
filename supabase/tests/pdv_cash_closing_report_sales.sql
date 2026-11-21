-- Contrato do relatório de fechamento de caixa: chave "sales" com TODAS as
-- vendas do caixa (não só dinheiro). Migration 20261121140000.
-- Executar após `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_cash_closing_report_sales.sql
--
-- Cenário (caixa fechado S1):
--   9101 entregue  30 = pix 20 + dinheiro 10 (troco 5 à parte)
--   9102 pago      15 = dinheiro 15
--   9103 cancelado 50 = pix 50                 -> fora
--   9104 cancelado_parcial 90 = dinheiro 40 + fiado 50; restante 65 cancelado
--        (abate 50 do fiado, 15 do dinheiro vira vale) -> líquido 25 em dinheiro
--   9105 pago em OUTRO caixa                    -> fora
-- Esperado: count 3, total 70, dinheiro 3/50, pix 1/20.
-- Caixa fechado S2 sem venda: count 0, total 0, listas vazias.

BEGIN;

DO $contract$
DECLARE v_function constant text := 'public.pdv_cash_session_projection_v3(uuid,boolean)';
BEGIN
  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'projeção interna do Caixa exposta: %', v_function;
  END IF;
  IF has_function_privilege('anon', 'public.pdv_cash_session_report_v2(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_cash_session_report_v2(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL incorreta no relatório de fechamento';
  END IF;
  IF strpos(pg_get_functiondef(v_function::regprocedure), 'pdv_assert_cash_session_actor_v3(p_session_id,NULL,false,p_report)') = 0 THEN
    RAISE EXCEPTION 'projeção perdeu a trava do ator do Caixa';
  END IF;
END
$contract$;

DO $sales$
DECLARE
  c uuid:='f3140000-0000-4000-8000-000000000001';
  c_other uuid:='f3140000-0000-4000-8000-000000000002';
  u uuid:='f3140000-0000-4000-8000-000000000011';
  acc uuid:='f3140000-0000-4000-8000-000000000021';
  term uuid:='f3140000-0000-4000-8000-000000000031';
  stock uuid:='f3140000-0000-4000-8000-000000000032';
  term2 uuid:='f3140000-0000-4000-8000-000000000033';
  term3 uuid:='f3140000-0000-4000-8000-000000000034';
  s1 uuid:='f3140000-0000-4000-8000-000000000041';
  s2 uuid:='f3140000-0000-4000-8000-000000000042';
  s3 uuid:='f3140000-0000-4000-8000-000000000043';
  o1 uuid:='f3140000-0000-4000-8000-000000000051';
  o2 uuid:='f3140000-0000-4000-8000-000000000052';
  o3 uuid:='f3140000-0000-4000-8000-000000000053';
  o4 uuid:='f3140000-0000-4000-8000-000000000054';
  o5 uuid:='f3140000-0000-4000-8000-000000000055';
  p4_cash uuid:='f3140000-0000-4000-8000-000000000064';
  p4_fiado uuid:='f3140000-0000-4000-8000-000000000065';
  op uuid:='f3140000-0000-4000-8000-000000000071';
  cust uuid:='f3140000-0000-4000-8000-000000000081';
  r jsonb; sales jsonb; snap jsonb; empty jsonb;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token)
  VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated',
    'closing-sales@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,business_core,subscription_status,subscription_plan,subscription_expires_at)
  VALUES(c,'Fechamento vendas fictício','retail','active','retail_start',now()+interval '10 days');
  UPDATE public.profiles SET company_id=c,is_active=TRUE WHERE user_id=u;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
  VALUES(u,'["screen:pdv","screen:pdv_reports"]',TRUE)
  ON CONFLICT(user_id) DO UPDATE SET permissions=EXCLUDED.permissions,is_active=TRUE;
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(acc,c,'Caixa fictício','caixa',0,TRUE);
  INSERT INTO public.customers(id,company_id,name) VALUES(cust,c,'Cliente fictício');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fictício',false);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES
    (term,c,'Caixa 1',stock,true),(term2,c,'Caixa 2',stock,true),(term3,c,'Caixa 3',stock,true);
  -- Um caixa aberto por operador: abre e fecha em sequência (S2 vazio, S3 com
  -- venda de outro caixa, S1 com o cenário).
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
  VALUES(s2,c,term2,u,0,'aberta',acc,'Caixa fictício','{}',2);
  UPDATE public.pdv_cash_sessions SET status='fechada',closed_at=now(),closed_by=u,
    expected_amount=0,counted_amount=0,difference=0 WHERE id=s2;
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
  VALUES(s3,c,term3,u,0,'aberta',acc,'Caixa fictício','{}',2);
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,terminal_id,status,subtotal,total,
    cash_session_id,client_request_id,created_at)
  VALUES(o5,c,9105,u,term3,'pago',99,99,s3,'closing-sales-5','2026-11-20 14:00+00');
  INSERT INTO public.pdv_order_payments(id,company_id,order_id,method,amount,change_amount)
  VALUES(gen_random_uuid(),c,o5,'pix',99,0);
  UPDATE public.pdv_cash_sessions SET status='fechada',closed_at=now(),closed_by=u,
    expected_amount=0,counted_amount=0,difference=0 WHERE id=s3;
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
  VALUES(s1,c,term,u,0,'aberta',acc,'Caixa fictício','{}',2);

  -- Estados finais gravados direto (fixture): o caminho canônico já tem testes próprios.
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,terminal_id,status,subtotal,total,
    cash_session_id,client_request_id,created_at,cancelled_at) VALUES
    (o1,c,9101,u,term,'entregue',30,30,s1,'closing-sales-1','2026-11-20 10:00+00',NULL),
    (o2,c,9102,u,term,'pago',15,15,s1,'closing-sales-2','2026-11-20 11:00+00',NULL),
    (o3,c,9103,u,term,'cancelado',50,50,s1,'closing-sales-3','2026-11-20 12:00+00',now()),
    (o4,c,9104,u,term,'cancelado_parcial',90,90,s1,'closing-sales-4','2026-11-20 13:00+00',now());
  INSERT INTO public.pdv_order_payments(id,company_id,order_id,method,amount,change_amount) VALUES
    (gen_random_uuid(),c,o1,'pix',20,0),
    (gen_random_uuid(),c,o1,'dinheiro',10,5),
    (gen_random_uuid(),c,o2,'dinheiro',15,0),
    (gen_random_uuid(),c,o3,'pix',50,0),
    (p4_cash,c,o4,'dinheiro',40,0),
    (p4_fiado,c,o4,'fiado',50,0);
  -- Mesmo formato de financial_plan gravado por pdv_cancel_order_residual_v3.
  INSERT INTO public.pdv_operation_requests(id,company_id,operation_type,idempotency_key,payload_hash,created_by)
  VALUES(op,c,'commercial.order.cancel_residual.v3','closing-sales-residual',repeat('d',64),u);
  INSERT INTO public.pdv_order_residual_cancellations(company_id,order_id,reason,released_quantity,
    delivered_quantity,operation_request_id,created_by,customer_id,residual_amount,financial_contract_version,occurred_on,financial_plan)
  VALUES(c,o4,'Cliente desistiu do restante',2,1,op,u,cust,65,3,current_date,jsonb_build_object(
    'order_total',90,'delivered_amount',25,'residual_amount',65,
    'receivable_reduction_amount',50,'paid_disposition_amount',15,
    'receivable_reductions',jsonb_build_array(jsonb_build_object('payment_id',p4_fiado,'amount',50)),
    'original_payments',jsonb_build_array(jsonb_build_object('payment_id',p4_cash,'method','dinheiro','amount',40)),
    'dispositions',jsonb_build_array(jsonb_build_object('kind','voucher','original_payment_id',p4_cash,'amount',15))));

  UPDATE public.pdv_cash_sessions SET status='fechada',closed_at=now(),closed_by=u,
    expected_amount=0,counted_amount=0,difference=0 WHERE id=s1;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,TRUE);

  r:=public.pdv_cash_session_report_v2(s1);
  sales:=r->'sales';
  IF sales IS NULL THEN RAISE EXCEPTION 'relatório sem a chave sales: %',r; END IF;
  IF sales->'count' IS DISTINCT FROM '3'::jsonb OR (sales->>'total')::numeric<>70 THEN
    RAISE EXCEPTION 'contagem/total errados (cancelada fora, parcial líquida): %',sales; END IF;
  IF sales->'by_method' IS DISTINCT FROM
     '[{"method":"dinheiro","count":3,"amount":50.00},{"method":"pix","count":1,"amount":20.00}]'::jsonb THEN
    RAISE EXCEPTION 'by_method errado (troco fora, fiado abatido, ordem amount desc): %',sales->'by_method'; END IF;
  IF (SELECT jsonb_agg(x->'number' ORDER BY ord) FROM jsonb_array_elements(sales->'orders') WITH ORDINALITY t(x,ord))
     IS DISTINCT FROM '[9101,9102,9104]'::jsonb THEN
    RAISE EXCEPTION 'orders fora de ordem ou com venda indevida: %',sales->'orders'; END IF;
  IF sales->'orders'->0->'methods' IS DISTINCT FROM '["dinheiro","pix"]'::jsonb
     OR (sales->'orders'->0->>'total')::numeric<>30 OR sales->'orders'->0->>'status'<>'entregue' THEN
    RAISE EXCEPTION 'venda em duas formas errada: %',sales->'orders'->0; END IF;
  IF sales->'orders'->2->'methods' IS DISTINCT FROM '["dinheiro"]'::jsonb
     OR (sales->'orders'->2->>'total')::numeric<>25 OR sales->'orders'->2->>'status'<>'cancelado_parcial' THEN
    RAISE EXCEPTION 'cancelamento parcial não ficou líquido: %',sales->'orders'->2; END IF;
  IF (SELECT array_agg(DISTINCT k ORDER BY k) FROM jsonb_array_elements(sales->'orders') x, jsonb_object_keys(x) k)
     IS DISTINCT FROM ARRAY['created_at','methods','number','status','total'] THEN
    RAISE EXCEPTION 'orders com chaves fora do contrato: %',sales->'orders'; END IF;
  IF sales::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
    RAISE EXCEPTION 'sales vazou UUID: %',sales; END IF;

  empty:=public.pdv_cash_session_report_v2(s2)->'sales';
  IF empty IS DISTINCT FROM '{"count":0,"total":0,"by_method":[],"orders":[]}'::jsonb THEN
    RAISE EXCEPTION 'caixa sem venda deve devolver zeros e listas vazias: %',empty; END IF;

  snap:=public.pdv_cash_session_projection_v3(s1,false);
  IF snap ? 'sales' THEN RAISE EXCEPTION 'snapshot operacional não pode ter sales'; END IF;
END
$sales$;

ROLLBACK;
