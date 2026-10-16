-- =============================================================================
-- Onda 3 / B3 — Vigilância do IP residencial no pg_cron.
--
-- Esta migration só agenda. A correção do reset de saúde na troca de dono do IP
-- (`whatsapp_assign_proxy` / `whatsapp_release_proxy` zerando last_check_ok,
-- last_check_at e last_error) foi feita direto na 20261016171000, que nunca foi
-- aplicada em nenhum ambiente — não existia banco pra migrar, e um
-- CREATE OR REPLACE aqui só deixaria no histórico o rastro de um conserto que
-- nunca precisou acontecer em produção.
--
-- Por que o reset importa, pra quem ler isto depois: a vigilância só pausa a
-- fila na SEGUNDA falha consecutiva do mesmo IP. Se um IP falhasse, fosse
-- liberado e reatribuído a outra conexão carregando `last_check_ok = false` do
-- dono antigo, a primeira falha do dono NOVO já contaria como a segunda e
-- pausaria a fila dele indevidamente. Histórico de saúde é do par IP+conexão,
-- não do IP sozinho.
--
-- O que esta migration agenda: `whatsapp-proxy-healthcheck-15min`, chamando a
-- edge `whatsapp-proxy-healthcheck` a cada 15 minutos. Essa edge, por desenho,
-- NÃO escreve no pool (só nas colunas de saúde) e NÃO lê o Vault — logo o
-- CRON_SECRET que vai no header não dá poder de criar/apagar IP nem de ler
-- credencial de proxy. É o mesmo portão `Bearer <CRON_SECRET>` do worker.
-- =============================================================================

-- Mesmo padrão do cron `whatsapp-send-worker-every-minute` da 20261016143000:
-- unschedule idempotente antes do schedule, segredo lido do Vault na hora do
-- disparo (nunca gravado no corpo do job), e dollar-quote aninhado com tag
-- distinta ($job$ dentro de $block$) pra não encerrar o bloco no lugar errado.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-proxy-healthcheck-15min')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-proxy-healthcheck-15min');

    PERFORM cron.schedule(
      'whatsapp-proxy-healthcheck-15min',
      '*/15 * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/whatsapp-proxy-healthcheck',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            ''
          )
        ),
        body := jsonb_build_object('reason', 'proxy_healthcheck_cron')
      );
      $job$
    );
  END IF;
END;
$block$;
