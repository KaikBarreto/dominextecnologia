-- =============================================================================
-- Onda 3 / A1 — Janela de envio por tenant e deferimento que não queima tentativa.
--
-- Dois problemas resolvidos aqui:
--
-- 1) Enviar 03:00 da manhã é, ao mesmo tempo, o sinal de robô mais óbvio pro
--    WhatsApp e o maior gerador de denúncia do cliente final — que é o que de
--    fato derruba um número. A janela de horário passa a ser predicado do
--    `whatsapp_claim_send_jobs`: job fora da janela simplesmente NÃO é
--    selecionado, fica `pending`/`retry` intacto e não consome nada.
--
-- 2) Bug latente: o claim faz `attempts = attempts + 1` em todo job que pega.
--    O worker, quando bate em limite (hora/dia/aquecimento/automação pausada/
--    conexão indisponível), chama `retryJob` — ou seja, um envio ADIADO por
--    limite consumia tentativa. Com `MAX_ATTEMPTS = 5` no worker, um job
--    legítimo morria só por ter sido adiado 5 vezes. Com janela de horário isso
--    viraria certeza. Separamos deferimento (`defers`) de tentativa real
--    (`attempts`), e o worker passa a adiar via `whatsapp_defer_send_job`.
--
-- -----------------------------------------------------------------------------
-- POR QUE A JANELA É DUPLA (e não uma só) — não "simplifique" isso de volta
-- -----------------------------------------------------------------------------
-- A primeira versão desta migration tinha UMA janela, 08:00–20:00 seg–sáb, pra
-- todos os eventos. Está errado, e o erro é de produto, não de SQL: o cliente
-- final da empresa é manutenção de ar-condicionado, atendida TAMBÉM fora do
-- horário comercial. Segurar um "técnico a caminho" das 22h até as 8h da manhã
-- não é educado, é quebrado: é a mensagem que o cliente está esperando NAQUELE
-- MINUTO, porque foi ele mesmo que chamou o técnico.
--
-- O que de fato precisa de janela estreita é o LEMBRETE DE COBRANÇA: ninguém
-- pediu pra receber cobrança de madrugada, e ele é gerado por cron, não por
-- ação humana. Então:
--
--   grupo `transactional` -> `os.*`      (o cliente está esperando agora)
--                            default 06:00–23:00, todos os 7 dias
--   grupo `reminders`     -> `billing.*` (gerado por cron, ninguém pediu)
--                            default 08:00–20:00, seg a sáb
--
-- O tenant pode alargar a transacional até 24h (`startHour` 0, `endHour` 24,
-- 7 dias). Grupo/evento desconhecido cai em `reminders`: falhar FECHADO, porque
-- o custo de errar pro lado estreito é um envio atrasado, e pro lado largo é um
-- número banido.
--
-- Fuso SEMPRE America/Sao_Paulo (lei do projeto: fuso Brasil, nunca UTC).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Deferimento não é tentativa
-- -----------------------------------------------------------------------------

ALTER TABLE public.whatsapp_send_jobs
  ADD COLUMN IF NOT EXISTS defers integer NOT NULL DEFAULT 0 CHECK (defers >= 0);

COMMENT ON COLUMN public.whatsapp_send_jobs.defers IS
  'Quantas vezes o job foi ADIADO sem chegar ao provedor (limite de hora/dia, aquecimento, fora da janela). Não é tentativa: só `attempts` conta chamada real ao provedor e só `attempts` alimenta o MAX_ATTEMPTS do worker.';

-- Adia um job já reivindicado SEM gastar tentativa.
--
-- O `attempts = GREATEST(attempts - 1, 0)` DESFAZ o incremento que o
-- `whatsapp_claim_send_jobs` aplicou ao reivindicar: não houve nenhuma chamada
-- ao provedor, então não houve tentativa. Sem esse decremento, 5 adiamentos por
-- limite matam um job legítimo (`MAX_ATTEMPTS = 5` no worker).
--
-- O filtro `status = 'processing'` torna a chamada idempotente: adiar duas vezes
-- o mesmo job não decrementa `attempts` duas vezes.
CREATE OR REPLACE FUNCTION public.whatsapp_defer_send_job(
  p_job_id uuid,
  p_company_id uuid,
  p_code text,
  p_message text,
  p_next_attempt_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  IF p_job_id IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.whatsapp_send_jobs
     SET status          = 'retry',
         locked_at       = NULL,
         defers          = defers + 1,
         attempts        = GREATEST(attempts - 1, 0),
         last_error_code = p_code,
         last_error      = p_message,
         next_attempt_at = COALESCE(p_next_attempt_at, now() + interval '5 minutes')
   WHERE id = p_job_id
     AND company_id = p_company_id
     AND status = 'processing';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_defer_send_job(uuid,uuid,text,text,timestamptz) IS
  'Adia um job reivindicado sem consumir tentativa (deferimento != tentativa). Devolve true se o job estava em processing e foi adiado.';

REVOKE ALL ON FUNCTION public.whatsapp_defer_send_job(uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_defer_send_job(uuid,uuid,text,text,timestamptz) TO service_role;

-- -----------------------------------------------------------------------------
-- 2) Janela de envio por tenant, em dois grupos
-- -----------------------------------------------------------------------------

-- As assinaturas antigas de 1 e 3 argumentos (janela única, sem grupo) NÃO
-- podem coexistir com as novas: duas funções vivas é alguém chamando a errada e
-- descobrindo seis meses depois. Esta migration nunca foi aplicada em nenhum
-- ambiente, então em prod os DROPs são no-op; eles existem só pra um banco de
-- desenvolvimento que tenha rodado a versão anterior do arquivo.
DROP FUNCTION IF EXISTS public.whatsapp_send_window(uuid);
DROP FUNCTION IF EXISTS public.whatsapp_in_send_window(uuid,uuid,timestamptz);
DROP FUNCTION IF EXISTS public.whatsapp_next_window_opening(uuid,uuid,timestamptz);

-- Grupo de janela do evento. Um lugar só porque três funções precisam da mesma
-- derivação (`in_send_window`, `next_window_opening` e, indiretamente, o claim).
--
-- `os.*`      -> transacional: disparado por ação do técnico, o cliente está
--                esperando a mensagem no minuto em que ela acontece.
-- `billing.*` -> lembrete: disparado por cron, ninguém pediu pra receber.
-- outro       -> lembrete. Falha FECHADO de propósito: evento novo que alguém
--                adicionar ao CHECK sem passar por aqui nasce na janela
--                estreita, nunca na larga.
CREATE OR REPLACE FUNCTION public.whatsapp_event_window_group(p_event_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE
           WHEN COALESCE(p_event_key, '') LIKE 'os.%' THEN 'transactional'
           ELSE 'reminders'
         END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_event_window_group(text) IS
  'Grupo de janela de envio do evento: os.* -> transactional (cliente esperando), billing.* e qualquer outro -> reminders (janela estreita, falha fechado).';

REVOKE ALL ON FUNCTION public.whatsapp_event_window_group(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_event_window_group(text) TO service_role;

-- Jitter determinístico de abertura da janela, em segundos (0 a 24min59s).
--
-- Sem isso, todos os tenants começam a disparar às 08:00:00 em ponto — uma
-- rajada sincronizada que é exatamente a assinatura de automação que estamos
-- tentando apagar. O offset é derivado do id da conexão: determinístico (o mesmo
-- número abre sempre no mesmo minuto, como uma pessoa com rotina), sem estado
-- novo e sem precisar sortear a cada rodada do worker.
--
-- NÃO entra o grupo na derivação, de propósito: se o jitter variasse por grupo,
-- dois jobs da MESMA conexão abririam em instantes diferentes sem nenhuma razão,
-- e a "rotina" do número ficaria menos humana, não mais.
--
-- `hashtext` pode devolver -2147483648, cujo `abs` estoura integer; por isso o
-- cast pra bigint antes do abs.
CREATE OR REPLACE FUNCTION public.whatsapp_window_open_offset(p_connection_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT (abs(hashtext(COALESCE(p_connection_id::text, ''))::bigint) % 1500)::integer;
$fn$;

COMMENT ON FUNCTION public.whatsapp_window_open_offset(uuid) IS
  'Segundos (0..1499) somados à abertura da janela, determinísticos por conexão (nunca por grupo). Evita rajada sincronizada no minuto da abertura em todos os tenants.';

REVOKE ALL ON FUNCTION public.whatsapp_window_open_offset(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_window_open_offset(uuid) TO service_role;

-- Janela efetiva do tenant para um grupo, já com default aplicado e sanitizada.
--
-- A preferência mora em `company_whatsapp_settings.automation_preferences`,
-- caminho `{sendWindow}`, no shape:
--
--   "sendWindow": {
--     "transactional": { "startHour": 6, "endHour": 23, "days": [1,2,3,4,5,6,7] },
--     "reminders":     { "startHour": 8, "endHour": 20, "days": [1,2,3,4,5,6]   }
--   }
--
-- `days` usa dia da semana ISO (1 = segunda … 7 = domingo).
--
-- COMPATIBILIDADE COM O SHAPE PLANO ANTIGO: `sendWindow` gravado como
-- `{"startHour":9,"endHour":18,"days":[1,2,3,4,5]}` (sem os dois grupos) vale
-- como a janela de `reminders`, e `transactional` recebe o default largo. Não é
-- arbitrário: o shape plano é o mais restritivo, foi o único que a tela ofereceu,
-- e o que o tenant quis dizer ao configurá-lo foi "não incomode meu cliente fora
-- disso" — que é o significado de LEMBRETE, não de transacional (transacional o
-- cliente pediu, está esperando, e herdar 09:00–18:00 seg–sex ali seguraria um
-- "técnico a caminho" de sábado). Se existir o nó do grupo, ele ganha do plano.
--
-- Qualquer lixo (tipo errado, hora fora de faixa, fim antes do começo, lista
-- vazia) cai no default DAQUELE GRUPO. Grupo desconhecido é tratado como
-- `reminders`, o mais estreito. Não existe backfill do jsonb: linha sem
-- `sendWindow` recebe o default aqui, na leitura.
CREATE OR REPLACE FUNCTION public.whatsapp_send_window(
  p_company_id uuid,
  p_group text
)
RETURNS TABLE (start_hour integer, end_hour integer, days integer[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_group  text;
  v_window jsonb;
  v_node   jsonb;
  v_start  integer;
  v_end    integer;
  v_days   integer[];
BEGIN
  -- Grupo desconhecido/NULL -> reminders (o mais restritivo): falhar fechado.
  v_group := CASE WHEN p_group = 'transactional' THEN 'transactional' ELSE 'reminders' END;

  IF v_group = 'transactional' THEN
    start_hour := 6;
    end_hour   := 23;
    days       := ARRAY[1,2,3,4,5,6,7];
  ELSE
    start_hour := 8;
    end_hour   := 20;
    days       := ARRAY[1,2,3,4,5,6];
  END IF;

  IF p_company_id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT s.automation_preferences #> '{sendWindow}'
    INTO v_window
    FROM public.company_whatsapp_settings s
   WHERE s.company_id = p_company_id;

  IF v_window IS NULL OR jsonb_typeof(v_window) <> 'object' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF jsonb_typeof(v_window -> v_group) = 'object' THEN
    -- Shape novo (por grupo). Ganha do plano quando os dois existem.
    v_node := v_window -> v_group;
  ELSIF v_window ? 'startHour' OR v_window ? 'endHour' OR v_window ? 'days' THEN
    -- Shape plano antigo: só vale como janela de lembrete (ver cabeçalho).
    v_node := CASE WHEN v_group = 'reminders' THEN v_window ELSE NULL END;
  ELSE
    v_node := NULL;
  END IF;

  IF v_node IS NULL OR jsonb_typeof(v_node) <> 'object' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF jsonb_typeof(v_node -> 'startHour') = 'number' THEN
    v_start := floor((v_node #>> '{startHour}')::numeric)::integer;
  END IF;

  IF jsonb_typeof(v_node -> 'endHour') = 'number' THEN
    v_end := floor((v_node #>> '{endHour}')::numeric)::integer;
  END IF;

  IF jsonb_typeof(v_node -> 'days') = 'array' THEN
    SELECT array_agg(DISTINCT q.d ORDER BY q.d)
      INTO v_days
      FROM (
        SELECT floor((x.e #>> '{}')::numeric)::integer AS d
          FROM jsonb_array_elements(v_node -> 'days') AS x(e)
         WHERE jsonb_typeof(x.e) = 'number'
      ) q
     WHERE q.d BETWEEN 1 AND 7;
  END IF;

  -- `endHour` até 24 de propósito: 0–24 em 7 dias é a janela 24h que o tenant
  -- pode escolher pra transacional.
  IF v_start IS NOT NULL AND v_end IS NOT NULL
     AND v_start BETWEEN 0 AND 23
     AND v_end BETWEEN 1 AND 24
     AND v_end > v_start THEN
    start_hour := v_start;
    end_hour   := v_end;
  END IF;

  IF v_days IS NOT NULL AND array_length(v_days, 1) > 0 THEN
    days := v_days;
  END IF;

  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_send_window(uuid,text) IS
  'Janela de envio do tenant para um grupo (hora inicial, hora final, dias ISO), sanitizada. Default transactional 06-23 todos os dias (os.*: cliente esperando); default reminders 08-20 seg-sab (billing.*: cron). Grupo desconhecido -> reminders. Shape plano antigo de sendWindow vale como reminders. Fuso America/Sao_Paulo.';

REVOKE ALL ON FUNCTION public.whatsapp_send_window(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_window(uuid,text) TO service_role;

-- Está dentro da janela agora, para ESTE evento? Horário de Brasília, nunca UTC.
-- O grupo sai do `event_key` (whatsapp_event_window_group): um "técnico a
-- caminho" às 22:30 de domingo passa; um lembrete de cobrança no mesmo instante
-- não.
CREATE OR REPLACE FUNCTION public.whatsapp_in_send_window(
  p_company_id uuid,
  p_connection_id uuid,
  p_event_key text,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_win    record;
  v_local  timestamp;
  v_dow    integer;
  v_hour   integer;
  v_offset integer;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT w.start_hour, w.end_hour, w.days
    INTO v_win
    FROM public.whatsapp_send_window(
           p_company_id,
           public.whatsapp_event_window_group(p_event_key)
         ) w;

  v_local := COALESCE(p_at, now()) AT TIME ZONE 'America/Sao_Paulo';
  v_dow   := EXTRACT(ISODOW FROM v_local)::integer;

  IF NOT (v_dow = ANY (v_win.days)) THEN
    RETURN false;
  END IF;

  v_hour := EXTRACT(HOUR FROM v_local)::integer;

  IF v_hour < v_win.start_hour OR v_hour >= v_win.end_hour THEN
    RETURN false;
  END IF;

  -- Na primeira hora da janela, só libera depois do jitter determinístico da
  -- conexão. Evita a rajada em ponto descrita em whatsapp_window_open_offset.
  IF v_hour = v_win.start_hour THEN
    v_offset := public.whatsapp_window_open_offset(p_connection_id);
    IF (EXTRACT(MINUTE FROM v_local)::integer * 60
        + floor(EXTRACT(SECOND FROM v_local))::integer) < v_offset THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz) IS
  'True se o instante cai na janela de envio do grupo derivado do event_key (os.* = transacional larga, billing.*/desconhecido = lembrete estreita), no fuso America/Sao_Paulo, já respeitando o jitter de abertura por conexão.';

REVOKE ALL ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz) TO service_role;

-- Próxima abertura da janela DO GRUPO do evento, com o jitter já somado. O
-- worker usa isso pra gravar `next_attempt_at` de uma vez, em vez de re-sortear
-- de minuto em minuto. Olha até 8 dias à frente (cobre qualquer `days`).
--
-- Chamada enquanto o instante JÁ está dentro da janela, devolve a abertura do
-- próximo dia válido — por definição a função responde "próxima abertura", não
-- "pode enviar agora"; quem responde isso é whatsapp_in_send_window.
CREATE OR REPLACE FUNCTION public.whatsapp_next_window_opening(
  p_company_id uuid,
  p_connection_id uuid,
  p_event_key text,
  p_from timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_win       record;
  v_from      timestamptz := COALESCE(p_from, now());
  v_local     timestamp;
  v_offset    integer;
  v_day       date;
  v_candidate timestamptz;
  i           integer;
BEGIN
  SELECT w.start_hour, w.end_hour, w.days
    INTO v_win
    FROM public.whatsapp_send_window(
           p_company_id,
           public.whatsapp_event_window_group(p_event_key)
         ) w;

  v_offset := public.whatsapp_window_open_offset(p_connection_id);
  v_local  := v_from AT TIME ZONE 'America/Sao_Paulo';

  FOR i IN 0..8 LOOP
    v_day := (v_local + make_interval(days => i))::date;

    IF EXTRACT(ISODOW FROM v_day)::integer = ANY (v_win.days) THEN
      v_candidate := (v_day + make_interval(hours => v_win.start_hour, secs => v_offset))
                       AT TIME ZONE 'America/Sao_Paulo';
      IF v_candidate > v_from THEN
        RETURN v_candidate;
      END IF;
    END IF;
  END LOOP;

  -- Inalcançável com `days` não vazio (a função sanitiza), mas nunca devolve
  -- NULL: NULL em next_attempt_at violaria NOT NULL e derrubaria o adiamento.
  RETURN v_from + interval '1 day';
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) IS
  'Próxima abertura da janela do grupo derivado do event_key (os.* = transacional, billing.*/desconhecido = lembrete), no fuso America/Sao_Paulo, com o jitter determinístico da conexão somado. Usada pelo worker como next_attempt_at.';

REVOKE ALL ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) TO service_role;

-- Nenhuma dessas funções é concedida a `authenticated`: nenhuma policy de RLS as
-- referencia e o frontend não precisa delas (a UI da janela lê/escreve o próprio
-- jsonb de `automation_preferences`). Função aberta a mais papel do que o
-- chamador provado é superfície de graça.

-- -----------------------------------------------------------------------------
-- 3) O claim passa a respeitar a janela do grupo do job
-- -----------------------------------------------------------------------------

-- Recriado a partir da definição vigente (20261016143000), preservando a
-- recuperação de órfão, 1 job em processing por empresa e o `next_send_at` da
-- conexão. A única mudança é o predicado da janela, agora com o `event_key` do
-- próprio job — é o que faz uma OS de sábado à noite sair e uma cobrança no
-- mesmo instante esperar. `CREATE OR REPLACE` de propósito: `DROP FUNCTION`
-- levaria os GRANTs embora.
CREATE OR REPLACE FUNCTION public.whatsapp_claim_send_jobs(
  p_limit integer DEFAULT 20,
  p_orphan_minutes integer DEFAULT 10
)
RETURNS SETOF public.whatsapp_send_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  UPDATE public.whatsapp_send_jobs
     SET status = 'retry', locked_at = NULL,
         next_attempt_at = now(), last_error_code = 'orphan_recovered',
         last_error = 'Processamento anterior interrompido; job recuperado.'
   WHERE status = 'processing'
     AND locked_at < now() - make_interval(mins => GREATEST(COALESCE(p_orphan_minutes,10),1));

  RETURN QUERY
  WITH ranked AS (
    SELECT j.id,
           row_number() OVER (PARTITION BY j.company_id ORDER BY j.next_attempt_at, j.created_at) AS rn
      FROM public.whatsapp_send_jobs j
      JOIN public.whatsapp_connections c ON c.id = j.connection_id
      JOIN public.company_whatsapp_settings s ON s.company_id = j.company_id AND s.enabled IS TRUE
     WHERE j.status IN ('pending','retry')
       AND j.next_attempt_at <= now()
       AND c.status = 'connected'
       AND COALESCE(c.next_send_at, '-infinity'::timestamptz) <= now()
       AND public.whatsapp_in_send_window(j.company_id, j.connection_id, j.event_key, now())
       AND NOT EXISTS (
         SELECT 1 FROM public.whatsapp_send_jobs p
          WHERE p.company_id = j.company_id AND p.status = 'processing'
       )
  ), selected AS (
    SELECT id FROM ranked WHERE rn = 1 LIMIT GREATEST(COALESCE(p_limit,20),1)
  )
  UPDATE public.whatsapp_send_jobs j
     SET status = 'processing', locked_at = now(), attempts = attempts + 1
    FROM selected s
   WHERE j.id = s.id
     AND j.status IN ('pending','retry')
  RETURNING j.*;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_claim_send_jobs(integer,integer) IS
  'Claim atômico da fila de WhatsApp: um job por empresa por rodada, respeitando next_send_at da conexão e a janela de envio do GRUPO do event_key do job (os.* transacional, billing.* lembrete). Job fora da janela não é selecionado e não consome tentativa.';

REVOKE ALL ON FUNCTION public.whatsapp_claim_send_jobs(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_claim_send_jobs(integer,integer) TO service_role;
