-- =============================================================================
-- Agenda horária da edge function `sync-asaas-ledger` via pg_cron
-- =============================================================================
-- Por quê: o sync do extrato Asaas (popula `ledger_asaas` pra conciliação)
-- precisa rodar sozinho de hora em hora, sem alguém clicar. A edge é
-- idempotente — rodar repetidas vezes não duplica lançamentos.
--
-- COMO O SECRET É PASSADO (replica o padrão do cron `generate-payroll-daily`):
-- o segredo `CRON_SECRET` vem do Supabase Vault em tempo de execução, via
-- (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET').
-- O job do pg_cron roda como `postgres` (superuser), que consegue decriptar o
-- Vault — por isso NÃO precisamos hardcodar o valor em texto puro no repo.
--
-- DIFERENÇA pra generate-payroll/activate-scheduled-orders:
-- aquelas edges checam `Authorization: Bearer <CRON_SECRET>`. A `sync-asaas-ledger`
-- autentica pelo header `x-cron-secret == CRON_SECRET` (ver index.ts linha ~149).
-- Por isso mandamos o secret do Vault no header `x-cron-secret`. Mandamos também
-- em `Authorization: Bearer` pra espelhar exatamente a chamada do cron que já
-- funciona em produção (gateway se comporta igual).
--
-- Pré-requisito: o segredo `CRON_SECRET` já está no Vault (usado por
-- generate-payroll e generate-pmoc-orders). Nada novo a configurar.
-- =============================================================================

-- Garante extensões (já habilitadas em 20260228223345 / 20260426020000)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove agendamento anterior se existir (idempotente em re-deploys)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-asaas-ledger-hourly') THEN
    PERFORM cron.unschedule('sync-asaas-ledger-hourly');
    RAISE NOTICE 'Cron sync-asaas-ledger-hourly anterior removido antes de reagendar.';
  END IF;
END $$;

-- Agenda: de hora em hora ('0 * * * *')
SELECT cron.schedule(
  'sync-asaas-ledger-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/sync-asaas-ledger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        ''
      ),
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
