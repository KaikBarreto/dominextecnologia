-- =============================================================================
-- Desativar cron job que gerava OSs PMOC via edge function `generate-pmoc-orders`.
--
-- CONTEXTO (v1.9.12, Onda F):
--   A partir desta release, contratos PMOC geram TODAS as OSs futuras logo
--   na criação do contrato (via useContracts.createContract), igual contrato
--   comum. O cron diário deixa de ter razão de existir.
--
-- ESTADO ESPERADO ANTES:
--   cron.job tem 1 row com jobname='generate-pmoc-orders-daily' (jobid=1,
--   schedule '0 4 * * *', active=true) chamando
--   https://<project>.supabase.co/functions/v1/generate-pmoc-orders.
--
-- ESTADO ESPERADO DEPOIS:
--   cron.job NÃO tem mais row pra esse jobname (unschedule remove a linha).
--   A edge function `generate-pmoc-orders` continua DEPLOYED no Supabase
--   (não deletada) — fica em standby caso seja preciso reativar pra
--   "auto-renew" de horizon vencido no futuro.
--
-- IDEMPOTÊNCIA:
--   Bloco verifica existência do job antes do unschedule. Rodar 2x não quebra.
-- =============================================================================

DO $$
DECLARE
  v_job_id   BIGINT;
  v_jobname  TEXT;
BEGIN
  SELECT jobid, jobname
    INTO v_job_id, v_jobname
    FROM cron.job
   WHERE command ILIKE '%generate-pmoc-orders%'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
    RAISE NOTICE 'Cron desativado: jobid=% jobname=%', v_job_id, v_jobname;
  ELSE
    RAISE NOTICE 'Nenhum cron `generate-pmoc-orders` encontrado (já desativado ou nunca existiu).';
  END IF;
END
$$;
