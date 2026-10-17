-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/public_api_v1_security.sql
BEGIN;

DO $test$
DECLARE
  v_table text;
  v_sensitive text[] := ARRAY[
    'public_api_integrations','public_api_keys','public_api_external_refs',
    'public_api_idempotency','public_api_rate_limit_buckets',
    'api_key_manager_rate_limit_buckets','public_api_request_audit',
    'schedule_booking_settings','schedule_booking_exceptions',
    'public_api_integration_resources','booking_reservations',
    'schedule_conflict_overrides'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_sensitive LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'RLS ausente em public.%',v_table; END IF;
    IF has_table_privilege('anon','public.'||v_table,'SELECT')
       OR has_table_privilege('authenticated','public.'||v_table,'SELECT') THEN
      RAISE EXCEPTION 'leitura direta indevida em public.%',v_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='public_api_keys'
       AND column_name IN ('secret','api_key','raw_key','token','key_hash')
  ) THEN RAISE EXCEPTION 'public_api_keys contem coluna de segredo em claro/contrato antigo'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_name='public_api_keys_hash_check'
       AND check_clause LIKE '%64%'
  ) THEN RAISE EXCEPTION 'check SHA-256 ausente'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='booking_reservations_no_overlap' AND contype='x'
  ) THEN RAISE EXCEPTION 'exclusion de reservas ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_feature_flags WHERE key='public_api_v1') THEN
    RAISE EXCEPTION 'kill switch public_api_v1 ausente';
  END IF;
  IF has_function_privilege('authenticated','public.public_api_create_service_order(uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.public_api_get_service_order(uuid,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.public_api_get_availability(uuid,timestamptz,timestamptz,integer,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC publica privilegiada exposta a authenticated';
  END IF;
  IF has_function_privilege('service_role','public.schedule_book_service_order(uuid,text,uuid,timestamptz,timestamptz,text)','EXECUTE') THEN
    RAISE EXCEPTION 'API/service_role nao pode executar override interno';
  END IF;
  IF has_function_privilege('service_role','public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'API/service_role nao pode criar OS interna com override';
  END IF;
  IF NOT has_function_privilege('authenticated','public.api_key_manager_consume_rate_limit(uuid,text,text,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'rate limit persistente do key manager indisponivel';
  END IF;
  IF to_regprocedure('public.public_api_create_key(uuid,text)') IS NOT NULL
     OR to_regprocedure('public.public_api_rotate_key(uuid,text)') IS NOT NULL
     OR to_regprocedure('public.public_api_revoke_key(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'RPC paralela de gestao contorna o rate limit oficial da edge';
  END IF;
END
$test$;

ROLLBACK;
