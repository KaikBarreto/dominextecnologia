-- =============================================================================
-- Hardening: remove o CRON_SECRET hardcoded do cron `activate-scheduled-orders-daily`
-- =============================================================================
-- PROBLEMA: o `command` desse job tinha o CRON_SECRET em TEXTO PURO no header
-- Authorization ('Bearer d1d0db...'), visível em `cron.job` e nesta migration —
-- exposição de segredo no banco e no repo.
--
-- CORREÇÃO: passar a ler o segredo `CRON_SECRET` do Supabase Vault em tempo de
-- execução, via (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE
-- name='CRON_SECRET'). O job do pg_cron roda como `postgres` (superuser), que
-- consegue decriptar o Vault — então NÃO precisamos hardcodar nada no repo.
-- É exatamente o padrão já usado por `generate-payroll-daily` e
-- `sync-asaas-ledger-hourly`.
--
-- NADA MUDA no comportamento: mesmo jobname, mesmo schedule ('0 9 * * *'),
-- mesmo endpoint (activate-scheduled-orders), mesmo body ('{}'). A edge
-- `activate-scheduled-orders` autentica por `Authorization: Bearer <CRON_SECRET>`,
-- então o único header sensível é esse — agora resolvido do Vault.
--
-- Pré-requisito: o segredo `CRON_SECRET` já está no Vault (usado pelos crons
-- citados acima). Nada novo a configurar.
-- =============================================================================

-- Garante extensões (já habilitadas em migrations anteriores)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove agendamento anterior (com secret hardcoded) antes de recriar. Idempotente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activate-scheduled-orders-daily') THEN
    PERFORM cron.unschedule('activate-scheduled-orders-daily');
    RAISE NOTICE 'Cron activate-scheduled-orders-daily anterior removido antes de reagendar.';
  END IF;
END $$;

-- Reagenda com o MESMO schedule ('0 9 * * *'), trocando apenas o secret
-- hardcoded pelo lookup do Vault em runtime.
SELECT cron.schedule(
  'activate-scheduled-orders-daily',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/activate-scheduled-orders',
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
