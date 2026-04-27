-- =============================================================================
-- Agenda diária da edge function generate-payroll via pg_cron
-- =============================================================================
-- Roda às 07:00 UTC = 04:00 BRT, todo dia. A função é idempotente — rodar
-- repetidas vezes no mesmo dia não cria duplicatas (índice único parcial em
-- financial_transactions cuida disso).
--
-- Pré-requisito: o segredo `CRON_SECRET` precisa estar no Supabase Vault
-- (Dashboard → Project Settings → Vault → New secret, name: CRON_SECRET).
-- Se ele já existe lá (porque a generate-pmoc-orders também usa), nada
-- mais precisa ser feito.
-- =============================================================================

-- Garante extensões (já estavam habilitadas em 20260228223345)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove agendamento anterior se existir (idempotente em re-deploys)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-payroll-daily') THEN
    PERFORM cron.unschedule('generate-payroll-daily');
  END IF;
END $$;

-- Agenda: 07:00 UTC todo dia (= 04:00 BRT)
SELECT cron.schedule(
  'generate-payroll-daily',
  '0 7 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/generate-payroll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
