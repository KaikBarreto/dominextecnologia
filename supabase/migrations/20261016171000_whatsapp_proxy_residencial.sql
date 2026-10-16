-- =============================================================================
-- Onda 3 / A3 + A5 + B1-B2 — Sinais de comportamento humano e pool de proxy.
--
-- Três coisas entram aqui:
--
-- A3) `whatsapp_inbound_keys` — guarda SÓ a chave da mensagem recebida, pra ser
--     possível marcar a conversa como lida antes de responder. NUNCA o corpo da
--     mensagem: o compose da Evolution roda com DATABASE_SAVE_DATA_NEW_MESSAGE
--     desligado justamente por privacidade, e o banco não é o lugar onde isso
--     volta pela porta de trás.
--
-- A5) `whatsapp_number_checks` — cache de "esse telefone tem WhatsApp?".
--     Disparar pra número que não existe no WhatsApp é a assinatura de lista
--     comprada e um dos sinais de spam mais fortes que existem.
--
-- B1-B2) `whatsapp_proxies` — pool de IP residencial gerenciado pela Dominex.
--     O tenant não compra, não escolhe e não vê proxy; é detalhe de infra.
--     REGRA DE OURO: 1 IP por instância, nunca compartilhado entre tenants.
--     Vários números de WhatsApp saindo do mesmo IP residencial é um cluster de
--     spam perfeito — pior que o IP do VPS. E a credencial do proxy NUNCA fica
--     nesta tabela: vai pro Vault, igual ao token da Meta.
--
-- Junto com B1-B2 entra `whatsapp_connections.warmup_started_at` (item 4): o
-- relógio do aquecimento do número, separado de `connected_at`. Mora aqui, e
-- não numa migration nova, porque quem reinicia o aquecimento é justamente a
-- troca de IP — a regra e as duas funções que a aplicam ficam no mesmo arquivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Chaves de mensagem recebida (A3)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  phone         text NOT NULL,
  remote_jid    text NOT NULL,
  message_id    text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz,
  UNIQUE (connection_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_keys_unread
  ON public.whatsapp_inbound_keys(company_id, phone, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_keys_received
  ON public.whatsapp_inbound_keys(received_at);

COMMENT ON TABLE public.whatsapp_inbound_keys IS
  'Chave (remote_jid + message_id) das mensagens recebidas, só pra marcar como lida antes de responder. NUNCA guarda o corpo da mensagem. Retenção de 7 dias via whatsapp_purge_inbound_keys.';

ALTER TABLE public.whatsapp_inbound_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_whatsapp_inbound_keys" ON public.whatsapp_inbound_keys;
CREATE POLICY "service_role_full_access_whatsapp_inbound_keys"
  ON public.whatsapp_inbound_keys FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Nenhuma policy pra `authenticated`: o frontend não precisa dessas chaves.
-- O REVOKE é obrigatório e explícito porque o ACL default deste projeto concede
-- arwdDxtm pra anon E authenticated em toda tabela nova de `public`.
REVOKE ALL ON TABLE public.whatsapp_inbound_keys FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Cache de número com WhatsApp (A5)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_number_checks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone               text NOT NULL,
  exists_on_whatsapp  boolean NOT NULL,
  checked_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_number_checks_checked
  ON public.whatsapp_number_checks(checked_at);

COMMENT ON TABLE public.whatsapp_number_checks IS
  'Cache de 90 dias do whatsappNumbers da Evolution: esse telefone tem WhatsApp? Evita disparo pra número inexistente, que é assinatura de lista comprada.';

ALTER TABLE public.whatsapp_number_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_whatsapp_number_checks" ON public.whatsapp_number_checks;
CREATE POLICY "service_role_full_access_whatsapp_number_checks"
  ON public.whatsapp_number_checks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.whatsapp_number_checks FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Pool de proxy da Dominex (B1-B2)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_proxies (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label                   text NOT NULL,
  -- 'datacenter_tunnel' = saída própria num VPS/nuvem (ex.: VM gratuita da
  -- Oracle com SOCKS5). Resolve SÓ metade do problema: dá um IP distinto por
  -- tenant, eliminando o cluster de várias contas num IP só, mas continua
  -- sendo IP de datacenter, que é o outro sinal. É degrau intermediário entre
  -- não ter nada e o residencial, não substituto dele. Não trate como igual.
  kind                    text NOT NULL DEFAULT 'residential_static'
                            CHECK (kind IN ('residential_static','mobile','datacenter_tunnel')),
  host                    text NOT NULL,
  port                    integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  protocol                text NOT NULL DEFAULT 'http'
                            CHECK (protocol IN ('http','https','socks5')),
  region                  text,
  secret_name             text,
  assigned_connection_id  uuid UNIQUE REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'free'
                            CHECK (status IN ('free','assigned','blocked')),
  monthly_cost            numeric(10,2),
  last_check_at           timestamptz,
  last_check_ok           boolean,
  last_error              text,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_proxies_status
  ON public.whatsapp_proxies(status);

COMMENT ON TABLE public.whatsapp_proxies IS
  'Pool de IPs residenciais/móveis comprados pela Dominex e atribuídos 1-pra-1 a uma conexão. A credencial do proxy NUNCA fica aqui: vai no Vault como whatsapp_proxy_cred_<proxy_id>, e secret_name só aponta pra ela.';
COMMENT ON COLUMN public.whatsapp_proxies.secret_name IS
  'Nome do segredo no Vault com usuário/senha do proxy. A credencial em si nunca é gravada nesta tabela.';
COMMENT ON COLUMN public.whatsapp_proxies.assigned_connection_id IS
  'UNIQUE de propósito: um IP nunca é compartilhado entre duas conexões/tenants. IP residencial compartilhado por várias contas WhatsApp é pior que o IP do VPS.';

DROP TRIGGER IF EXISTS set_updated_at_whatsapp_proxies ON public.whatsapp_proxies;
CREATE TRIGGER set_updated_at_whatsapp_proxies
  BEFORE UPDATE ON public.whatsapp_proxies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_proxies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_whatsapp_proxies" ON public.whatsapp_proxies;
CREATE POLICY "service_role_full_access_whatsapp_proxies"
  ON public.whatsapp_proxies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Painel master Auctus: super_admin LÊ a lista (custo, a qual empresa está
-- atribuído, resultado do último teste). Escrita é só por service_role, via a
-- edge `whatsapp-proxy-manage`. Mesmo mecanismo canônico das outras tabelas de
-- painel master (`subscription_plans`, `whatsapp_tiers`): has_role envolto em
-- SELECT pra virar InitPlan e ser avaliado uma vez por query, não por linha.
DROP POLICY IF EXISTS "Super admins can view whatsapp proxies" ON public.whatsapp_proxies;
CREATE POLICY "Super admins can view whatsapp proxies"
  ON public.whatsapp_proxies FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role)));

-- Tenant não lê nem escreve. `authenticated` fica só com SELECT (filtrado pela
-- policy de super_admin acima); anon não fica com nada.
REVOKE ALL ON TABLE public.whatsapp_proxies FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.whatsapp_proxies FROM authenticated;
GRANT SELECT ON TABLE public.whatsapp_proxies TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) A conexão aponta pro seu IP (e tem relógio próprio de aquecimento)
-- -----------------------------------------------------------------------------

-- `warmup_started_at` existe porque o aquecimento NÃO pode ser medido a partir
-- de `connected_at`. `connected_at` é reescrito a cada conexão bem-sucedida
-- (whatsapp-connect e whatsapp-webhook), então um número maduro mandando 400
-- msgs/dia há meses despencava pro teto de 20/dia por duas semanas inteiras só
-- porque o celular descarregou, o aparelho vinculado caiu ou o tenant escaneou
-- o QR de novo. Isso é custo puro, sem ganho de segurança: aquecimento existe
-- porque IP/número NOVO não tem reputação — reconectar no mesmo IP com o mesmo
-- número não apaga reputação nenhuma.
--
-- A semântica é contraintuitiva, então está escrita duas vezes (aqui e no
-- COMMENT ON COLUMN logo abaixo), de propósito:
--   * NULL = o aquecimento ainda não começou. Ou nunca conectou, ou o IP/número
--     acabou de mudar e a reputação zerou de verdade.
--   * A edge grava now() quando a conexão passa para `connected` e SOMENTE se o
--     valor estiver NULL — o relógio começa quando o número de fato já pode
--     enviar, não quando o IP foi reservado.
--   * Volta pra NULL quando o IP muda (whatsapp_assign_proxy /
--     whatsapp_release_proxy, item 5) ou quando o número conectado muda (isso é
--     na edge, não aqui).
--   * O worker trata NULL como DIA 0 do aquecimento (teto de 20/dia), que é o
--     lado conservador: na dúvida, aquece.
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS proxy_id uuid REFERENCES public.whatsapp_proxies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proxy_health_ok boolean,
  ADD COLUMN IF NOT EXISTS proxy_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_proxy
  ON public.whatsapp_connections(proxy_id)
  WHERE proxy_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_connections.proxy_health_ok IS
  'Resultado do último healthcheck do proxy. NULL = nunca testado (ou acabou de trocar de IP). Falha não cai pro IP do VPS: a fila pausa, porque trocar de IP no meio da vida da sessão é o próprio sinal que o proxy existe pra evitar.';

COMMENT ON COLUMN public.whatsapp_connections.warmup_started_at IS
  'Início do aquecimento do número (teto diário de 20 a 400 mensagens ao longo de 14 dias no whatsapp-send-worker). NÃO use connected_at pra isso: connected_at é reescrito a cada reconexão, e medir o aquecimento por ele derrubava um número maduro pra 20 msgs/dia por duas semanas só porque o celular descarregou. NULL = o aquecimento ainda não começou (nunca conectou, ou o IP/número acabou de mudar e a reputação zerou) e o worker trata NULL como dia 0, teto de 20/dia — o lado conservador. A edge grava now() quando a conexão passa para `connected` e SOMENTE se o valor estiver NULL, pra o relógio começar quando o número de fato já pode enviar, não quando o IP foi reservado. Volta pra NULL quando o IP muda (whatsapp_assign_proxy / whatsapp_release_proxy) ou quando o número conectado muda (na edge). Reconexão comum nunca reinicia o aquecimento.';

-- Backfill de quem JÁ tinha reputação. A 20261016143000 migra as conexões
-- Evolution legadas de company_whatsapp_settings pra whatsapp_connections; essas
-- linhas nasceriam com warmup_started_at = NULL e o worker as trataria como dia
-- 0, capando em 20 msgs/dia um número que está maduro e rodando há meses. Pra
-- essas, connected_at é a melhor prova de idade que existe no banco.
-- Depois deste UPDATE, NULL passa a significar de verdade "precisa aquecer":
-- ou nunca conectou, ou acabou de trocar de IP/número.
UPDATE public.whatsapp_connections
   SET warmup_started_at = connected_at
 WHERE warmup_started_at IS NULL
   AND connected_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5) Atribuir e liberar IP, atomicamente
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_assign_proxy(
  p_connection_id uuid,
  p_proxy_id uuid
)
RETURNS public.whatsapp_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_proxy public.whatsapp_proxies%ROWTYPE;
BEGIN
  IF p_connection_id IS NULL OR p_proxy_id IS NULL THEN
    RAISE EXCEPTION 'Informe a conexão e o IP que serão vinculados.' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha do proxy antes de qualquer decisão: duas atribuições
  -- simultâneas do mesmo IP não podem passar as duas.
  SELECT * INTO v_proxy
    FROM public.whatsapp_proxies
   WHERE id = p_proxy_id
     FOR UPDATE;

  IF v_proxy.id IS NULL THEN
    RAISE EXCEPTION 'IP não encontrado no pool.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_connections WHERE id = p_connection_id) THEN
    RAISE EXCEPTION 'Conexão de WhatsApp não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_proxy.status = 'blocked' THEN
    RAISE EXCEPTION 'Este IP está bloqueado e não pode ser atribuído.' USING ERRCODE = '23514';
  END IF;

  IF v_proxy.assigned_connection_id IS NOT NULL
     AND v_proxy.assigned_connection_id <> p_connection_id THEN
    RAISE EXCEPTION 'Este IP já está em uso por outra conexão. Um IP nunca é compartilhado entre empresas.'
      USING ERRCODE = '23505';
  END IF;

  -- Libera o IP anterior desta conexão ANTES de atribuir o novo: a coluna
  -- assigned_connection_id é UNIQUE, dois apontadores pra mesma conexão
  -- estouram a constraint. IP bloqueado continua bloqueado ao ser liberado.
  -- Zera a saúde junto: histórico de saúde é do par IP+conexão, não do IP
  -- sozinho (ver comentário no UPDATE de atribuição abaixo).
  UPDATE public.whatsapp_proxies
     SET assigned_connection_id = NULL,
         status = CASE WHEN status = 'blocked' THEN 'blocked' ELSE 'free' END,
         last_check_ok = NULL,
         last_check_at = NULL,
         last_error = NULL
   WHERE assigned_connection_id = p_connection_id
     AND id <> p_proxy_id;

  -- A saúde do IP zera ao trocar de dono. Sem isso, um IP que falhou uma vez,
  -- foi liberado e reatribuído a outra conexão chega com last_check_ok = false
  -- herdado do dono antigo — e a vigilância, que só pausa a fila na SEGUNDA
  -- falha consecutiva, leria a falha do dono anterior como a primeira e
  -- pausaria a fila do novo dono já no primeiro tropeço dele.
  UPDATE public.whatsapp_proxies
     SET assigned_connection_id = p_connection_id,
         status = 'assigned',
         last_check_ok = NULL,
         last_check_at = NULL,
         last_error = NULL
   WHERE id = p_proxy_id
  RETURNING * INTO v_proxy;

  -- Saúde volta pra desconhecida: é um IP novo, ninguém testou ainda.
  -- E o aquecimento REINICIA (warmup_started_at = NULL), porque IP novo é
  -- reputação nova: trocar de IP e continuar mandando 400 msgs/dia no primeiro
  -- dia é exatamente o padrão que derruba número. Zerar aqui e deixar a edge
  -- gravar now() só quando a conexão entrar em `connected` é deliberado — se
  -- gravássemos now() já na atribuição, o aquecimento "envelheceria" durante
  -- todo o tempo em que a conexão ficou parada esperando o tenant escanear o
  -- QR novo, e o número voltaria ao ar já liberado pra volume alto.
  UPDATE public.whatsapp_connections
     SET proxy_id = p_proxy_id,
         proxy_health_ok = NULL,
         proxy_checked_at = NULL,
         warmup_started_at = NULL
   WHERE id = p_connection_id;

  RETURN v_proxy;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_assign_proxy(uuid,uuid) IS
  'Vincula um IP do pool a uma conexão, 1-pra-1 e atomicamente. Libera o IP anterior da conexão e devolve a linha do proxy aplicada (host/porta/protocolo/secret_name) pra quem vai chamar /proxy/set na Evolution.';

REVOKE ALL ON FUNCTION public.whatsapp_assign_proxy(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_assign_proxy(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_release_proxy(p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  IF p_connection_id IS NULL THEN
    RETURN false;
  END IF;

  -- Varre por assigned_connection_id (não por connections.proxy_id) pra também
  -- limpar qualquer apontador órfão que tenha sobrado.
  -- Zera a saúde ao devolver o IP ao pool, pelo mesmo motivo da atribuição:
  -- a próxima conexão que receber este IP tem que começar com a contagem de
  -- falhas em zero, senão a vigilância pausa a fila dela com a falha alheia.
  UPDATE public.whatsapp_proxies
     SET assigned_connection_id = NULL,
         status = CASE WHEN status = 'blocked' THEN 'blocked' ELSE 'free' END,
         last_check_ok = NULL,
         last_check_at = NULL,
         last_error = NULL
   WHERE assigned_connection_id = p_connection_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Mesmo motivo da atribuição: sair do IP atual zera a reputação de saída, logo
  -- o aquecimento reinicia. A edge preenche warmup_started_at com now() na
  -- próxima vez que a conexão chegar a `connected`.
  UPDATE public.whatsapp_connections
     SET proxy_id = NULL,
         proxy_health_ok = NULL,
         proxy_checked_at = NULL,
         warmup_started_at = NULL
   WHERE id = p_connection_id;

  RETURN v_rows > 0;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_release_proxy(uuid) IS
  'Desvincula o IP da conexão e devolve o IP ao pool (IP bloqueado permanece bloqueado). True se havia algum IP vinculado.';

REVOKE ALL ON FUNCTION public.whatsapp_release_proxy(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_release_proxy(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6) Retenção dos sinais
-- -----------------------------------------------------------------------------

-- Chave de mensagem recebida serve pra marcar como lida na hora de responder;
-- passada uma semana não serve pra nada e virou dado guardado sem motivo.
-- Cache de número com WhatsApp vale 90 dias (o plano assumiu esse prazo).
CREATE OR REPLACE FUNCTION public.whatsapp_purge_signals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_keys integer;
  v_checks integer;
BEGIN
  DELETE FROM public.whatsapp_inbound_keys
   WHERE received_at < now() - interval '7 days';
  GET DIAGNOSTICS v_keys = ROW_COUNT;

  DELETE FROM public.whatsapp_number_checks
   WHERE checked_at < now() - interval '90 days';
  GET DIAGNOSTICS v_checks = ROW_COUNT;

  RAISE NOTICE 'whatsapp_purge_signals: % chaves recebidas e % checagens de número apagadas.', v_keys, v_checks;
  RETURN v_keys + v_checks;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_purge_signals() IS
  'Retenção: apaga chaves de mensagem recebida com mais de 7 dias e cache de número com mais de 90 dias. Devolve o total apagado.';

REVOKE ALL ON FUNCTION public.whatsapp_purge_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_purge_signals() TO service_role;

-- Alias com o nome citado no plano, pra não quebrar quem chamar pelo outro nome.
CREATE OR REPLACE FUNCTION public.whatsapp_purge_inbound_keys()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public.whatsapp_purge_signals();
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_purge_inbound_keys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_purge_inbound_keys() TO service_role;

-- Diário às 04:00 de Brasília (07:00 UTC), mesmo padrão da 20261016143000.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-purge-signals')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-purge-signals');

    PERFORM cron.schedule(
      'whatsapp-purge-signals',
      '0 7 * * *',
      'SELECT public.whatsapp_purge_signals();'
    );
  END IF;
END;
$block$;

-- O cron de healthcheck de proxy (a cada 15 min, 2 falhas seguidas levam a
-- conexão pra `attention` e pausam a fila) NÃO entra aqui, pra não agendar
-- net.http_post contra uma função que ainda não subiu. Ele está na migration
-- 20261016172000_whatsapp_proxy_cron_e_saude.sql, que roda depois desta e
-- chama a edge `whatsapp-proxy-healthcheck`.
