-- Reagenda o alarme Asaas usando URL-base por ambiente no Vault. Esta migration
-- corrige bancos que já receberam a primeira versão do cron com URL fixa.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_base_url TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'asaas-webhook-health-hourly'
  ) THEN
    PERFORM cron.unschedule('asaas-webhook-health-hourly');
  END IF;

  SELECT rtrim(decrypted_secret, '/')
    INTO v_base_url
    FROM vault.decrypted_secrets
   WHERE name = 'SUPABASE_FUNCTIONS_BASE_URL'
   LIMIT 1;

  IF COALESCE(v_base_url, '') = '' THEN
    RAISE NOTICE 'Cron asaas-webhook-health-hourly não agendado: SUPABASE_FUNCTIONS_BASE_URL ausente no Vault.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'asaas-webhook-health-hourly',
    '20 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', COALESCE(
            (SELECT decrypted_secret
               FROM vault.decrypted_secrets
              WHERE name = 'CRON_SECRET'
              LIMIT 1),
            ''
          )
        ),
        body := '{"action":"diagnose"}'::jsonb
      );
      $cron$,
      v_base_url || '/functions/v1/admin-asaas-webhook-health'
    )
  );
END $$;
