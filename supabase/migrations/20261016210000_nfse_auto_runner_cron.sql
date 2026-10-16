-- ============================================================================
-- NFS-e AUTOMÁTICA — ONDA 2: agendamento do RUNNER (drenar a fila)
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE (e por que é SÓ isto):
--   Regra de autorização: docs/planos/2026-10-16-nfse-automatica-regra-de-autorizacao.md
--   R9 — "Como o runner é invocado e protegido".
--   As RPCs do runner nascem em 20261016200000; a edge `nfse-auto-runner`
--   nasce em supabase/functions/nfse-auto-runner/. Aqui mora APENAS o
--   agendamento, porque agendamento é a última coisa a entrar: cron apontando
--   pra edge que ainda não existe é 404 silencioso de 10 em 10 minutos.
--
-- DOIS CRONS, NUNCA UM ENCADEADO (R9.2 — correção ao §1.4 do plano-pai):
--   `nfse-auto-enfileirar-daily` (Onda 1, SQL puro, 02:50 America/Sao_Paulo)
--   ENCHE a fila. Este job a DRENA. São schedules INDEPENDENTES de propósito:
--   encadear faria uma falha do enfileirador derrubar a emissão (e vice-versa)
--   e impediria reprocessar a fila sem reenfileirar. E mantém o runner como o
--   ÚNICO ponto de emissão automática do sistema.
--
-- POR QUE */10 E NÃO 1x/DIA:
--   O modo 'pagamento' enfileira por TRIGGER, a qualquer hora: o cliente baixa
--   a parcela e espera a nota. Rodada com fila vazia custa um SELECT indexado
--   (índice parcial idx_nfse_auto_jobs_fila_viva). Com MAX_JOBS=6 por rodada,
--   a vazão é de ~36 notas/hora — folga enorme para a fila real (hoje: zero
--   contrato com a automação ligada).
--
-- O SEGREDO NUNCA É CHUMBADO AQUI:
--   `Authorization: Bearer <CRON_SECRET>` é lido do Vault
--   (vault.decrypted_secrets) no momento da execução, exatamente no molde de
--   20260924170000 §12 (dfe-sync-notas / dfe-manifestar-worker). Nenhum
--   literal de segredo existe neste arquivo — e `COALESCE(..., '')` garante que
--   segredo ausente no Vault produza um 401 na edge (fail-closed), não um
--   `NULL` que viraria header malformado.
--   ⚠️ CRON_SECRET é COMPARTILHADO por ~8 jobs (folha, OS agendadas,
--   contratos, DF-e, Asaas). Rotação mexe em todos: gerar o valor novo e
--   aplicá-lo NO MESMO MINUTO em (a) vault.secrets e (b) o secret da função
--   (`supabase secrets set CRON_SECRET=...`, que alimenta Deno.env). Há uma
--   janela curta de 401; todos os jobs envolvidos são idempotentes e perder um
--   tick é inócuo. Nunca manter dois valores aceitos "pra não dar erro".
--
-- LIGAR ISTO NÃO EMITE NOTA NENHUMA:
--   `contracts.nfse_auto_enabled` nasce `false` em 100% dos contratos e não há
--   backfill (invariante 4 da Onda 1). A primeira rodada em produção reivindica
--   zero jobs e termina. Mesmo argumento do DF-e: ligar o consumidor não fala
--   com o governo sozinho.
--
-- ORDEM DE DEPLOY (regra-lei do projeto — servidor antes do frontend, mas
-- nunca exigindo o que ainda não existe):
--   1. 20261016200000 (as 5 RPCs)  →  2. deploy da edge `nfse-auto-runner`
--   →  3. ESTA migration           →  4. Onda 3 (telas)
--   Aplicar isto antes do passo 2 agenda chamadas para uma URL que devolve 404.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ausente — agendamento do nfse-auto-runner pulado';
    RETURN;
  END IF;

  -- Idempotente: reaplicar a migration reescreve o schedule, não duplica job.
  PERFORM cron.unschedule('nfse-auto-runner')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nfse-auto-runner');

  PERFORM cron.schedule(
    'nfse-auto-runner',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/nfse-auto-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
          ''
        )
      ),
      -- Corpo VAZIO, e a edge ignora o corpo por completo (nenhum req.json()).
      -- Não existe company_id, job_id, contract_id nem limite vindo de fora: é
      -- isso que mantém o raio de explosão de um CRON_SECRET vazado em "a fila
      -- que nós mesmos construímos sai mais cedo hoje", em vez de "emita nota
      -- arbitrária em nome de qualquer tenant".
      body := '{}'::jsonb
    );
    $job$
  );

  RAISE NOTICE 'cron nfse-auto-runner agendado (*/10 * * * *)';
END
$cron$;

-- ----------------------------------------------------------------------------
-- Conferência: os DOIS jobs têm que existir, separados.
-- ----------------------------------------------------------------------------
DO $audit$
DECLARE
  v_enfileirar integer;
  v_runner     integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_enfileirar FROM cron.job WHERE jobname = 'nfse-auto-enfileirar-daily';
  SELECT count(*) INTO v_runner     FROM cron.job WHERE jobname = 'nfse-auto-runner';

  RAISE NOTICE 'cron NFS-e automatica: enfileirar=% runner=% (esperado 1 e 1, schedules independentes)',
    v_enfileirar, v_runner;

  IF v_runner <> 1 THEN
    RAISE EXCEPTION 'Abortado: o cron nfse-auto-runner nao ficou agendado (encontrados %).', v_runner;
  END IF;

  IF v_enfileirar <> 1 THEN
    -- Não aborta: a fila ainda é drenada (o modo 'pagamento' enfileira por
    -- trigger). Mas enfileirador ausente = modos dia_fixo/vencimento mudos, em
    -- silêncio, que é exatamente o desfecho que a Onda 1 proíbe.
    RAISE WARNING '[nfse-auto] cron nfse-auto-enfileirar-daily NAO esta agendado (encontrados %): os modos dia_fixo e vencimento nao vao enfileirar nada.', v_enfileirar;
  END IF;
END
$audit$;
