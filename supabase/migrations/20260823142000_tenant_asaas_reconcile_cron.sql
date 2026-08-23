-- =============================================================================
-- Agenda a edge function `tenant-asaas-reconcile` a cada 6h via pg_cron
-- =============================================================================
-- Por quê: rede de segurança pra webhook perdido. O `tenant-asaas-reconcile`
-- varre as cobranças pendentes de TODOS os tenants ativos, consulta o status
-- no Asaas e recupera baixas que o webhook não entregou. Como é só um fallback
-- (o webhook segue sendo o caminho primário), 1x a cada 6h basta — não precisa
-- ser de minuto em minuto e evita martelar a API do Asaas. A edge é idempotente:
-- rodar de novo não duplica baixa.
--
-- COMO O SECRET É PASSADO (replica EXATAMENTE o cron `sync-asaas-ledger-hourly`,
-- que aponta pra um edge com a MESMA autenticação):
-- o `CRON_SECRET` vem do Supabase Vault em runtime, via
-- (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET').
-- O job roda como `postgres` (superuser), que decripta o Vault — por isso o valor
-- NÃO fica hardcodado em texto puro no repo. Mandamos o segredo no header
-- `x-cron-secret` (que a edge valida timing-safe) E também em `Authorization:
-- Bearer` pra espelhar exatamente a chamada do cron que já funciona em produção.
--
-- Pré-requisito: `CRON_SECRET` já está no Vault (usado por sync-asaas-ledger,
-- generate-payroll etc.). Nada novo a configurar.
-- =============================================================================

-- Garante extensões (já habilitadas em migrations anteriores)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove agendamento anterior se existir (idempotente em re-deploys)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tenant-asaas-reconcile') THEN
    PERFORM cron.unschedule('tenant-asaas-reconcile');
    RAISE NOTICE 'Cron tenant-asaas-reconcile anterior removido antes de reagendar.';
  END IF;
END $$;

-- Agenda: a cada 6 horas ('0 */6 * * *')
SELECT cron.schedule(
  'tenant-asaas-reconcile',
  '0 */6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/tenant-asaas-reconcile',
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
