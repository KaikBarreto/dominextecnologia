-- =============================================================================
-- Agenda os 2 crons do coletor de saúde do banco (db_health_history)
-- =============================================================================
-- CONTEXTO: já estão NO AR a tabela `db_health_history`, a função
-- `prune_db_health_history()` (retenção 30d) e a edge `collect-db-health`
-- (autentica por `Authorization: Bearer <CRON_SECRET>`). Falta só AGENDAR.
--
-- Esta migration cria 2 jobs de pg_cron:
--   1. `collect-db-health-2min` — a cada 2 min ('*/2 * * * *'): dispara a edge
--      `collect-db-health` via net.http_post, que insere 1 linha no histórico.
--   2. `prune-db-health-daily` — diário 07:30 UTC ('30 7 * * *' = 04:30 BRT,
--      janela ociosa; mesmo offset -3 usado por generate-payroll-daily e
--      user-notifications-cleanup): chama SQL puro public.prune_db_health_history().
--
-- SEGREDO: o header Authorization lê o `CRON_SECRET` do Supabase Vault em runtime
-- (SELECT decrypted_secret FROM vault.decrypted_secrets), COALESCE pra '' se não
-- achar — exatamente o padrão de
-- 20260609130000_activate_scheduled_orders_cron_vault_secret.sql. Nada novo a
-- configurar: o `CRON_SECRET` já existe no Vault (usado por outros crons).
--
-- IDEMPOTENTE: cada job é removido (cron.unschedule guardado por EXISTS) antes de
-- reagendar, então reaplicar a migration não duplica job.
-- =============================================================================

-- Garante extensões (já habilitadas em migrations anteriores)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- Job 1: collect-db-health-2min ('*/2 * * * *')
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'collect-db-health-2min') THEN
    PERFORM cron.unschedule('collect-db-health-2min');
    RAISE NOTICE 'Cron collect-db-health-2min anterior removido antes de reagendar.';
  END IF;
END $$;

SELECT cron.schedule(
  'collect-db-health-2min',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/collect-db-health',
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

-- -----------------------------------------------------------------------------
-- Job 2: prune-db-health-daily ('30 7 * * *' = 04:30 BRT) — SQL puro
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-db-health-daily') THEN
    PERFORM cron.unschedule('prune-db-health-daily');
    RAISE NOTICE 'Cron prune-db-health-daily anterior removido antes de reagendar.';
  END IF;
END $$;

SELECT cron.schedule(
  'prune-db-health-daily',
  '30 7 * * *',
  $cron$
  SELECT public.prune_db_health_history();
  $cron$
);
