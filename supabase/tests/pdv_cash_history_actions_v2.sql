-- Contrato de seguranca do historico, relatorio e reabertura auditavel do caixa.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_cash_history_actions_v2.sql

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $contract$
DECLARE
  v_function text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_cash_history_v2(uuid,uuid,integer,integer)',
    'public.pdv_cash_session_report_v2(uuid)',
    'public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'ACL publica incorreta em %', v_function;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc function
       WHERE function.oid = v_function::regprocedure
         AND function.prosecdef
         AND 'search_path=pg_catalog, public' = ANY (function.proconfig)
    ) THEN
      RAISE EXCEPTION '% deve ser SECURITY DEFINER com search_path fixo', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.pdv_cash_history_context_v2()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pdv_cash_history_context_v2()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'contexto interno do historico foi exposto ao cliente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pdv_cash_sessions'
       AND column_name = 'reopened_from_session_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'pdv_cash_sessions'
       AND indexname = 'uniq_pdv_cash_sessions_reopened_from'
  ) THEN
    RAISE EXCEPTION 'vinculo unico da continuacao auditavel esta ausente';
  END IF;

  -- Implementações delegadas não precisam repetir tokens SQL do core.
  -- RPCs públicas e helpers privados mantêm ACL; comportamento é exercitado abaixo.
  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_reopen_cash_session_explicit_core_018_v2(uuid,uuid,text,text)',
    'public.pdv_assert_cash_session_actor_v3(uuid,uuid,boolean,boolean)',
    'public.pdv_cash_session_projection_v3(uuid,boolean)',
    'public.pdv_cash_session_report_wrapper_015_v2(uuid)'
  ] LOOP
    IF has_function_privilege('authenticated',v_function,'EXECUTE')
       OR has_function_privilege('anon',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'helper interno do histórico foi exposto: %',v_function;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.pdv_cash_custody_entries', 'INSERT')
  THEN
    RAISE EXCEPTION 'cliente ganhou escrita direta em sessao ou custodia';
  END IF;
END
$contract$;


-- Fixture inteiramente transacional: duas empresas, dois operadores e uma
-- continuação real. Nenhum registro anterior à fixture é lido ou comparado.
DO $behavior$
DECLARE
  c uuid:='f2400000-0000-4000-8000-000000000001';
  cx uuid:='f2400000-0000-4000-8000-000000000002';
  ua uuid:='f2400000-0000-4000-8000-000000000011';
  ub uuid:='f2400000-0000-4000-8000-000000000012';
  ux uuid:='f2400000-0000-4000-8000-000000000013';
  account_id uuid:='f2400000-0000-4000-8000-000000000021';
  ta uuid:='f2400000-0000-4000-8000-000000000031';
  tb uuid:='f2400000-0000-4000-8000-000000000032';
  local_stock uuid; sa uuid; sb uuid; continuation uuid;
  result jsonb; replay jsonb; history jsonb; report jsonb;
  blocked boolean; original_hash text; before_financial integer; original_entries integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','history-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','history-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','history-x@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Histórico A/B','active'),(cx,'Histórico outro tenant','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(ua,ub);
  UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'gestor'),(ux,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv","screen:pdv_cash_history"]',true),
    (ub,'["screen:pdv","screen:pdv_cash_history","fn:reopen_pdv_cash"]',true),
    (ux,'["screen:pdv","screen:pdv_cash_history","fn:reopen_pdv_cash","fn:operate_other_pdv_cash"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
  SELECT stock.id INTO STRICT local_stock FROM public.stocks stock
   WHERE stock.company_id=c AND stock.is_default IS TRUE;
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(account_id,c,'Cofre histórico','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Histórico',account_id,true,'simples') ON CONFLICT(company_id) DO UPDATE SET
      pdv_cash_account_id=excluded.pdv_cash_account_id,pdv_strict_cash_tracking=true,pdv_mode='simples';
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
    VALUES(ta,c,'Caixa A',local_stock,true),(tb,c,'Caixa B',local_stock,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(ta,account_id,50,'history-open-a');
  sa:=(result->>'session_id')::uuid;
  PERFORM public.pdv_close_cash_session_v2(sa,account_id,50,'Fechamento A','history-close-a');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(tb,account_id,25,'history-open-b');
  sb:=(result->>'session_id')::uuid;
  PERFORM public.pdv_close_cash_session_v2(sb,account_id,25,'Fechamento B','history-close-b');
  history:=public.pdv_cash_history_v2(NULL,NULL,0,20);
  IF jsonb_array_length(COALESCE(history->'rows','[]'::jsonb))<>1 OR history#>>'{rows,0,id}'<>sb::text
     OR COALESCE((history->>'can_manage_others')::boolean,true) THEN
    RAISE EXCEPTION 'cargo gestor abriu histórico de outro operador';
  END IF;
  blocked:=false;BEGIN PERFORM public.pdv_cash_session_report_v2(sa);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'relatório revelou caixa de outro operador';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_reopen_cash_session_v2(sa,account_id,'Revisão A','history-reopen-a');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'capacidade de reabrir dispensou custódia do caixa';END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  blocked:=false;BEGIN PERFORM public.pdv_cash_session_report_v2(sa);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'relatório atravessou tenant';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_reopen_cash_session_v2(sa,account_id,'Revisão A','history-reopen-a');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'reabertura atravessou tenant';END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  report:=public.pdv_cash_session_report_v2(sa);
  IF report->>'session_id' IS DISTINCT FROM sa::text OR (report->>'opening_amount')::numeric IS DISTINCT FROM 50
     OR (report->>'counted_amount')::numeric IS DISTINCT FROM 50 OR (report->>'difference')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'relatório próprio divergiu do fechamento';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_reopen_cash_session_v2(sa,account_id,'Revisão A','history-reopen-a');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador reabriu sem capacidade nominal';END IF;
  UPDATE public.user_permissions SET permissions=permissions||'["fn:reopen_pdv_cash"]'::jsonb WHERE user_id=ua;
  SELECT md5(to_jsonb(session)::text) INTO original_hash FROM public.pdv_cash_sessions session WHERE session.id=sa;
  SELECT count(*) INTO before_financial FROM public.financial_transactions WHERE company_id=c;
  SELECT count(*) INTO original_entries FROM public.pdv_cash_custody_entries WHERE session_id=sa;
  result:=public.pdv_reopen_cash_session_v2(sa,account_id,'Revisão A','history-reopen-a');
  continuation:=(result->>'session_id')::uuid;
  replay:=public.pdv_reopen_cash_session_v2(sa,account_id,'Revisão A','history-reopen-a');
  IF continuation IS NULL OR continuation=sa OR replay->>'session_id'<>continuation::text
     OR (SELECT count(*) FROM public.pdv_cash_sessions WHERE reopened_from_session_id=sa)<>1
     OR (SELECT md5(to_jsonb(session)::text) FROM public.pdv_cash_sessions session WHERE session.id=sa)<>original_hash
     OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE session_id=sa)<>original_entries
     OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_financial
     OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions WHERE id=continuation AND opened_by=ua AND opening_amount=50 AND status='aberta')
     OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE session_id=continuation AND entry_kind='opening' AND amount=50)<>1 THEN
    RAISE EXCEPTION 'reabertura/replay alterou origem, duplicou custódia ou criou fato financeiro';END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  blocked:=false;BEGIN PERFORM public.pdv_reopen_cash_session_v2(sa,account_id,'Revisão A','history-reopen-a');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'outro operador obteve replay sabendo a chave';END IF;
  UPDATE public.user_permissions SET permissions=permissions||'["fn:operate_other_pdv_cash"]'::jsonb WHERE user_id=ub;
  history:=public.pdv_cash_history_v2(NULL,NULL,0,20);
  IF jsonb_array_length(COALESCE(history->'rows','[]'::jsonb))<>2 OR NOT (history->>'can_manage_others')::boolean THEN
    RAISE EXCEPTION 'permissão nominal não liberou histórico da própria empresa';END IF;
  PERFORM public.pdv_cash_session_report_v2(sa);
END
$behavior$;

ROLLBACK;
