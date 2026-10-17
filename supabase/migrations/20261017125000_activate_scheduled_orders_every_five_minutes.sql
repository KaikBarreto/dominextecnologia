-- A agenda publica precisa promover OS no minuto, nao apenas uma vez ao dia.
-- Reusa o comando ja persistido (incluindo lookup atual do Vault), sem copiar
-- segredo nem criar job duplicado. Se o job base nao existir, falha fechado.
DO $migration$
DECLARE
  v_command text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron_required_for_activate_scheduled_orders';
  END IF;

  SELECT command INTO v_command
    FROM cron.job
   WHERE jobname = 'activate-scheduled-orders-daily'
   ORDER BY jobid DESC
   LIMIT 1;
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'activate_scheduled_orders_job_not_found';
  END IF;

  PERFORM cron.unschedule('activate-scheduled-orders-daily');
  PERFORM cron.schedule(
    'activate-scheduled-orders-daily',
    '*/5 * * * *',
    v_command
  );
END
$migration$;
