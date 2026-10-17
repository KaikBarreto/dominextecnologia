-- Retencao operacional: idempotencia 7d, buckets 48h e auditoria 180d.
-- A RPC nao aceita anon/authenticated e o cron nao carrega segredo.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron_required_for_public_api_retention';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'public-api-retention-daily') THEN
    PERFORM cron.unschedule('public-api-retention-daily');
  END IF;
  PERFORM cron.schedule(
    'public-api-retention-daily',
    '17 3 * * *',
    'SELECT public.public_api_cleanup_expired_data();'
  );
END
$migration$;
