-- Contrato de seguranca da leitura do livro de custodia por sessao.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_cash_session_detail_v2.sql

BEGIN;

DO $contract$
DECLARE
  v_function constant text := 'public.pdv_cash_session_detail_v2(uuid)';
  v_definition text;
BEGIN
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
    RAISE EXCEPTION 'detalhe v2 deve ser SECURITY DEFINER STABLE com search_path fixo';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_cash_sessions', 'DELETE')
  THEN
    RAISE EXCEPTION 'sessao deve manter SELECT por RLS e negar toda escrita direta';
  END IF;

  IF has_table_privilege('authenticated', 'public.pdv_cash_custody_entries', 'SELECT')
  THEN
    RAISE EXCEPTION 'livro de custodia nao pode ser lido diretamente pelo cliente';
  END IF;

  SELECT pg_get_functiondef(v_function::regprocedure) INTO v_definition;
  IF strpos(v_definition, 's.opened_by=auth.uid()') = 0
     OR strpos(v_definition, 'pdv_can_operate_other_cash_v2') = 0
     OR strpos(v_definition, 'pdv_cash_session_detail_core_015_v2') = 0
  THEN
    RAISE EXCEPTION 'detalhe perdeu wrapper nominal do Caixa';
  END IF;
END
$contract$;

-- Sem JWT autenticado a funcao publica deve falhar antes de consultar qualquer
-- sessao. A mensagem tecnica fica no DETAIL e e mapeada pelo hook.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $unauthenticated$
DECLARE
  v_detail text;
BEGIN
  BEGIN
    PERFORM public.pdv_cash_session_detail_v2(
      '10000000-0000-4000-8000-000000000001'::uuid
    );
    RAISE EXCEPTION 'RPC permitiu leitura sem usuario autenticado';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'PDV_AUTH_REQUIRED' THEN
      RAISE EXCEPTION 'falha sem autenticacao retornou detalhe inesperado: %', v_detail;
    END IF;
  END;
END
$unauthenticated$;
RESET ROLE;

ROLLBACK;
