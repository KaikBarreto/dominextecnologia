-- Contrato de seguranca do historico, relatorio e reabertura auditavel do caixa.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_cash_history_actions_v2.sql

BEGIN;

DO $contract$
DECLARE
  v_function text;
  v_definition text;
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

  SELECT pg_get_functiondef(
    'public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'public.pdv_cash_history_context_v2()') = 0
     OR strpos(v_definition, '''fn:reopen_pdv_cash''') = 0
     OR strpos(v_definition, 'session.company_id = v_context.company_id') = 0
     OR strpos(v_definition, 'public.pdv_lock_treasury_account') = 0
     OR strpos(v_definition, '''cash.reopen.v2''') = 0
     OR strpos(v_definition, 'public.pdv_claim_operation_request') = 0
     OR strpos(v_definition, 'reopened_from_session_id') = 0
     OR strpos(v_definition, '''opening''') = 0
     OR strpos(v_definition, 'v_source.counted_amount') = 0
     OR strpos(v_definition, 'PDV_CASH_REOPEN_NOT_LATEST') = 0
  THEN
    RAISE EXCEPTION 'reabertura perdeu permissao, tenant, lock, idempotencia ou vinculo auditavel';
  END IF;
  IF strpos(lower(v_definition), 'delete from') > 0
     OR strpos(lower(v_definition), 'update public.pdv_cash_sessions') > 0
     OR strpos(lower(v_definition), 'insert into public.financial_transactions') > 0
  THEN
    RAISE EXCEPTION 'reabertura nao pode apagar/mutar fechamento nem criar fato de DRE/DFC';
  END IF;

  SELECT pg_get_functiondef('public.pdv_cash_session_report_v2(uuid)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, 's.opened_by=auth.uid()') = 0
     OR strpos(v_definition, 'pdv_can_operate_other_cash_v2') = 0
     OR strpos(v_definition, 'pdv_cash_session_report_core_015_v2') = 0
  THEN
    RAISE EXCEPTION 'relatorio perdeu wrapper nominal do Caixa';
  END IF;

  IF has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.pdv_cash_custody_entries', 'INSERT')
  THEN
    RAISE EXCEPTION 'cliente ganhou escrita direta em sessao ou custodia';
  END IF;
END
$contract$;

ROLLBACK;
