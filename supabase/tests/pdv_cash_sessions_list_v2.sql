-- Contrato das projecoes de listagem do caixa v2 e do gate financeiro manual.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_cash_sessions_list_v2.sql

BEGIN;

DO $contract$
DECLARE
  v_function text;
  v_definition text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_list_cash_terminals_v2()',
    'public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)',
    'public.pdv_has_open_cash_session_v2()'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'ACL publica incorreta em %', v_function;
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM pg_proc function
       WHERE function.oid = v_function::regprocedure
         AND function.prosecdef
         AND function.provolatile = 's'
         AND 'search_path=pg_catalog, public' = ANY (function.proconfig)
    ) THEN
      RAISE EXCEPTION '% deve ser SECURITY DEFINER STABLE com search_path fixo', v_function;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(
    'public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_can_operate_other_cash_v2') = 0
     OR strpos(v_definition, 'p_operator_id:=v_uid') = 0
     OR strpos(v_definition, 'pdv_list_cash_sessions_core_015_v2') = 0
     OR strpos(v_definition, 'can_manage_others') = 0
  THEN
    RAISE EXCEPTION 'listagem perdeu wrapper nominal de operador';
  END IF;

  -- Limitacao consciente: o hook legado ainda le a tabela diretamente. O V2
  -- usa as RPCs acima; escrita direta permanece fechada para ambos.
  IF NOT has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'DELETE')
  THEN
    RAISE EXCEPTION 'ACL transitoria da sessao divergiu: SELECT legado, escrita somente RPC';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.pdv_assert_manual_cash_event_permission_v2(uuid,text)',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'public.pdv_guard_manual_cash_event_permission_v2()',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'helpers do gate financeiro foram expostos ao cliente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger trigger
     WHERE trigger.tgrelid = 'public.pdv_cash_custody_entries'::regclass
       AND trigger.tgname = 'tg_pdv_guard_manual_cash_event_permission_v2'
       AND NOT trigger.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trigger do gate financeiro manual ausente';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_assert_manual_cash_event_permission_v2(uuid,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, '''cash_receipt''') = 0
     OR strpos(v_definition, '''cash_payment''') = 0
     OR strpos(v_definition, '''refund''') = 0
     OR strpos(v_definition, '''fn:manage_finance''') = 0
     OR strpos(v_definition, 'public.is_admin_or_gestor') = 0
     OR strpos(v_definition, 'PDV_CASH_FINANCE_EVENT_FORBIDDEN') = 0
  THEN
    RAISE EXCEPTION 'gate financeiro manual incompleto';
  END IF;
END
$contract$;

-- Um operador sem fn:manage_finance nao pode registrar os tres fatos
-- financeiros manuais. Supply/withdrawal continuam sendo operacao da gaveta.
DO $finance_gate$
DECLARE
  v_operator uuid := '14400000-0000-4000-8000-000000000001';
  v_kind text;
  v_detail text;
BEGIN
  FOREACH v_kind IN ARRAY ARRAY['cash_receipt', 'cash_payment', 'refund'] LOOP
    BEGIN
      PERFORM public.pdv_assert_manual_cash_event_permission_v2(v_operator, v_kind);
      RAISE EXCEPTION 'operador sem financeiro conseguiu registrar %', v_kind;
    EXCEPTION WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      IF v_detail IS DISTINCT FROM 'PDV_CASH_FINANCE_EVENT_FORBIDDEN' THEN
        RAISE EXCEPTION 'gate de % retornou detalhe inesperado: %', v_kind, v_detail;
      END IF;
    END;
  END LOOP;

  PERFORM public.pdv_assert_manual_cash_event_permission_v2(v_operator, 'supply');
  PERFORM public.pdv_assert_manual_cash_event_permission_v2(v_operator, 'withdrawal');
END
$finance_gate$;

ROLLBACK;
