-- =============================================================================
-- Lembrete de visita agendada por WhatsApp.
--
-- O evento e opt-in por tenant, usa a janela restrita de lembretes e fotografa
-- data + antecedencia na deduplicacao. O worker revalida esse snapshot antes de
-- enviar, portanto reagendar, cancelar, iniciar ou concluir a OS invalida o job
-- antigo sem vazar mensagem de outro tenant.
-- =============================================================================

-- 1) Preferencia provider-agnostic. Empresas existentes nascem desligadas.
ALTER TABLE public.company_whatsapp_settings
  ALTER COLUMN automation_preferences SET DEFAULT
  '{
    "version": 1,
    "sendWindow": {
      "transactional": {"startHour": 6, "endHour": 23, "days": [1,2,3,4,5,6,7]},
      "reminders": {"startHour": 8, "endHour": 20, "days": [1,2,3,4,5,6]}
    },
    "humanBehavior": {"simulateTyping": true, "markAsReadBeforeReply": true},
    "os": {
      "includeLink": true,
      "events": {
        "scheduled_reminder": {"enabled": false, "template": "automatic", "timing": "day_before"},
        "a_caminho": {"enabled": true, "template": "automatic"},
        "em_andamento": {"enabled": true, "template": "automatic"},
        "concluida": {"enabled": true, "template": "automatic"}
      }
    },
    "billing": {
      "includeAmount": true,
      "includePaymentLink": true,
      "includeCreatedBy": false,
      "includeDescription": false,
      "events": {
        "created": {"enabled": true, "template": "automatic"},
        "before_due": {"enabled": true, "template": "cordial"},
        "due_today": {"enabled": true, "template": "objective"},
        "after_due": {"enabled": true, "template": "cordial"}
      },
      "daysBeforeDue": 3,
      "daysAfterDue": 2
    }
  }'::jsonb;

UPDATE public.company_whatsapp_settings s
   SET automation_preferences = s.automation_preferences
     || jsonb_build_object(
          'os',
          CASE WHEN jsonb_typeof(s.automation_preferences -> 'os') = 'object'
               THEN s.automation_preferences -> 'os'
               ELSE '{}'::jsonb END
          || jsonb_build_object(
               'events',
               CASE WHEN jsonb_typeof(s.automation_preferences #> '{os,events}') = 'object'
                    THEN s.automation_preferences #> '{os,events}'
                    ELSE '{}'::jsonb END
               || jsonb_build_object(
                    'scheduled_reminder',
                    '{"enabled": false, "template": "automatic", "timing": "day_before"}'::jsonb
                  )
             )
        )
 WHERE NOT (
   CASE WHEN jsonb_typeof(s.automation_preferences #> '{os,events}') = 'object'
        THEN s.automation_preferences #> '{os,events}'
        ELSE '{}'::jsonb END
   ? 'scheduled_reminder'
 );

-- 2) O evento passa a ser aceito na fila e no binding futuro da Meta.
ALTER TABLE public.whatsapp_template_bindings
  DROP CONSTRAINT IF EXISTS whatsapp_template_bindings_event_key_check;
ALTER TABLE public.whatsapp_template_bindings
  ADD CONSTRAINT whatsapp_template_bindings_event_key_check CHECK (event_key IN (
    'os.scheduled_reminder','os.a_caminho','os.em_andamento','os.concluida',
    'billing.created','billing.before_due','billing.due_today','billing.after_due'
  )) NOT VALID;
ALTER TABLE public.whatsapp_template_bindings
  VALIDATE CONSTRAINT whatsapp_template_bindings_event_key_check;

ALTER TABLE public.whatsapp_send_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_send_jobs_event_key_check;
ALTER TABLE public.whatsapp_send_jobs
  ADD CONSTRAINT whatsapp_send_jobs_event_key_check CHECK (event_key IN (
    'os.scheduled_reminder','os.a_caminho','os.em_andamento','os.concluida',
    'billing.created','billing.before_due','billing.due_today','billing.after_due'
  )) NOT VALID;
ALTER TABLE public.whatsapp_send_jobs
  VALIDATE CONSTRAINT whatsapp_send_jobs_event_key_check;

ALTER TABLE public.whatsapp_send_jobs
  ADD COLUMN IF NOT EXISTS schedule_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_snapshot_timing text,
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz;

ALTER TABLE public.whatsapp_send_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_send_jobs_schedule_snapshot_check;
ALTER TABLE public.whatsapp_send_jobs
  ADD CONSTRAINT whatsapp_send_jobs_schedule_snapshot_check CHECK (
    event_key <> 'os.scheduled_reminder'
    OR (
      schedule_snapshot_at IS NOT NULL
      AND schedule_snapshot_timing IN ('day_before', 'same_day')
    )
  ) NOT VALID;
ALTER TABLE public.whatsapp_send_jobs
  VALIDATE CONSTRAINT whatsapp_send_jobs_schedule_snapshot_check;

COMMENT ON COLUMN public.whatsapp_send_jobs.schedule_snapshot_at IS
  'Instante da primeira jornada da OS fotografado ao criar um lembrete agendado.';
COMMENT ON COLUMN public.whatsapp_send_jobs.schedule_snapshot_timing IS
  'Antecedencia fotografada do lembrete de OS: day_before ou same_day.';
COMMENT ON COLUMN public.whatsapp_send_jobs.dispatch_started_at IS
  'Marco de nao retorno antes de chamar o provedor; um orfao marcado nunca e reenviado automaticamente.';

-- Ajuda o cron a localizar somente OSs reais da data local de cada empresa.
CREATE INDEX IF NOT EXISTS idx_service_orders_whatsapp_scheduled_reminder
  ON public.service_orders(scheduled_date, company_id)
  WHERE entry_type = 'os'
    AND scheduled_time IS NOT NULL
    AND status IN ('agendada'::public.os_status, 'pendente'::public.os_status);

CREATE INDEX IF NOT EXISTS idx_service_orders_whatsapp_schedule_plan_first
  ON public.service_orders ((schedule_plan->0->>'date'), company_id)
  WHERE entry_type = 'os'
    AND jsonb_array_length(schedule_plan) > 0
    AND status IN ('agendada'::public.os_status, 'pendente'::public.os_status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_scheduled_os_active
  ON public.whatsapp_send_jobs(company_id, source_id)
  WHERE event_key = 'os.scheduled_reminder'
    AND source_type = 'service_order'
    AND status IN ('pending', 'retry', 'processing');

-- 3) Fonte unica e defensiva do fuso. Ausencia ou texto IANA invalido devolve
-- NULL: automacao de horario falha fechada, sem adivinhar o dia do tenant.
CREATE OR REPLACE FUNCTION public.whatsapp_company_timezone(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $fn$
  SELECT tz.name
    FROM public.company_settings cs
    JOIN pg_catalog.pg_timezone_names tz ON tz.name = NULLIF(cs.timezone, '')
   WHERE cs.company_id = p_company_id
   ORDER BY cs.updated_at DESC
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.whatsapp_company_timezone(uuid) IS
  'Fuso IANA valido da empresa para automacoes WhatsApp; NULL quando ausente/invalido para falhar fechado.';

REVOKE ALL ON FUNCTION public.whatsapp_company_timezone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_company_timezone(uuid) TO service_role;

-- Normalizacao E.164 compartilhada com o worker. Numero com `+` ja e
-- internacional; numero local recebe o DDI do pais configurado no tenant.
CREATE OR REPLACE FUNCTION public.whatsapp_country_dial_code(p_country_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE upper(COALESCE(p_country_code, ''))
    WHEN 'BR' THEN '55' WHEN 'CV' THEN '238' WHEN 'PT' THEN '351'
    WHEN 'AO' THEN '244' WHEN 'MZ' THEN '258' WHEN 'ST' THEN '239'
    WHEN 'GW' THEN '245' WHEN 'TL' THEN '670' WHEN 'US' THEN '1'
    WHEN 'CA' THEN '1' WHEN 'GB' THEN '44' WHEN 'AU' THEN '61'
    WHEN 'ES' THEN '34' WHEN 'MX' THEN '52' WHEN 'AR' THEN '54'
    WHEN 'CL' THEN '56' WHEN 'CO' THEN '57' WHEN 'PE' THEN '51'
    WHEN 'UY' THEN '598' WHEN 'PY' THEN '595' WHEN 'BO' THEN '591'
    WHEN 'FR' THEN '33' WHEN 'BE' THEN '32' WHEN 'CH' THEN '41'
    WHEN 'DE' THEN '49' WHEN 'IT' THEN '39' WHEN 'JP' THEN '81'
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.whatsapp_normalize_phone(p_company_id uuid, p_raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $fn$
DECLARE
  v_country text;
  v_dial text;
  v_digits text;
  v_international boolean;
  v_national_length integer;
  v_national_min integer;
  v_national_max integer;
  v_strip_trunk_zero boolean;
BEGIN
  SELECT upper(btrim(cs.country_code)) INTO v_country
    FROM public.company_settings cs
   WHERE cs.company_id = p_company_id
   ORDER BY cs.updated_at DESC
   LIMIT 1;
  v_dial := public.whatsapp_country_dial_code(v_country);
  IF v_dial IS NULL THEN RETURN NULL; END IF;

  v_international := btrim(COALESCE(p_raw, '')) LIKE '+%'
    OR btrim(COALESCE(p_raw, '')) LIKE '00%';
  v_digits := regexp_replace(COALESCE(p_raw, ''), '\D', '', 'g');
  IF btrim(COALESCE(p_raw, '')) LIKE '00%' THEN
    v_digits := substring(v_digits FROM 3);
  END IF;
  IF v_international THEN
    RETURN CASE WHEN length(v_digits) BETWEEN 8 AND 15 THEN v_digits ELSE NULL END;
  END IF;

  SELECT national_min, national_max, strip_trunk_zero
    INTO v_national_min, v_national_max, v_strip_trunk_zero
    FROM (VALUES
      ('BR',10,11,true), ('CV',7,7,false), ('PT',9,9,false),
      ('AO',9,9,false), ('MZ',9,9,false), ('ST',7,7,false),
      ('GW',7,7,false), ('TL',7,8,false), ('US',10,10,false),
      ('CA',10,10,false), ('GB',9,10,true), ('AU',9,9,true),
      ('ES',9,9,false), ('MX',10,10,false), ('AR',10,11,true),
      ('CL',9,9,false), ('CO',10,10,false), ('PE',9,9,false),
      ('UY',8,8,false), ('PY',9,9,true), ('BO',8,8,false),
      ('FR',9,9,true), ('BE',9,9,true), ('CH',9,9,true),
      ('DE',5,11,true), ('IT',6,11,false), ('JP',9,10,true)
    ) AS rules(country_code, national_min, national_max, strip_trunk_zero)
   WHERE rules.country_code = v_country;

  IF v_national_min IS NULL THEN RETURN NULL; END IF;

  v_national_length := CASE
    WHEN left(v_digits, length(v_dial)) = v_dial
      THEN length(v_digits) - length(v_dial)
    ELSE -1
  END;
  IF v_national_length BETWEEN v_national_min AND v_national_max THEN
    RETURN CASE WHEN length(v_digits) BETWEEN 8 AND 15 THEN v_digits ELSE NULL END;
  END IF;

  IF v_strip_trunk_zero THEN v_digits := regexp_replace(v_digits, '^0', ''); END IF;
  IF length(v_digits) NOT BETWEEN v_national_min AND v_national_max THEN RETURN NULL; END IF;
  v_digits := v_dial || v_digits;

  IF length(v_digits) NOT BETWEEN 8 AND 15 THEN RETURN NULL; END IF;
  RETURN v_digits;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_country_dial_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_normalize_phone(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_country_dial_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_normalize_phone(uuid,text) TO service_role;

-- O lembrete de agenda e excecao a regra os.*: nasce de cron e deve respeitar
-- a janela restrita, como cobranca, nunca a janela operacional do tecnico.
CREATE OR REPLACE FUNCTION public.whatsapp_event_window_group(p_event_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE
           WHEN COALESCE(p_event_key, '') = 'os.scheduled_reminder' THEN 'reminders'
           WHEN COALESCE(p_event_key, '') LIKE 'os.%' THEN 'transactional'
           ELSE 'reminders'
         END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_event_window_group(text) IS
  'Grupo de janela: os.scheduled_reminder e billing.* usam reminders; demais os.* usam transactional; desconhecido falha fechado em reminders.';

REVOKE ALL ON FUNCTION public.whatsapp_event_window_group(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_event_window_group(text) TO service_role;

-- Substitui apenas a fonte do fuso da versao anterior. Janela, dias e jitter
-- continuam iguais, mas agora sao interpretados no relogio civil do tenant.
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
  v_win      record;
  v_local    timestamp;
  v_timezone text;
  v_dow      integer;
  v_hour     integer;
  v_offset   integer;
BEGIN
  IF p_company_id IS NULL THEN RETURN false; END IF;

  SELECT w.start_hour, w.end_hour, w.days
    INTO v_win
    FROM public.whatsapp_send_window(
           p_company_id,
           public.whatsapp_event_window_group(p_event_key)
         ) w;

  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN false; END IF;
  v_local := COALESCE(p_at, now()) AT TIME ZONE v_timezone;
  v_dow := EXTRACT(ISODOW FROM v_local)::integer;

  -- Visita agendada pode existir em qualquer dia. Reutiliza as horas da janela
  -- restrita, mas nao perde OS de domingo nem o day_before de uma OS na segunda.
  IF p_event_key IS DISTINCT FROM 'os.scheduled_reminder'
     AND NOT (v_dow = ANY (v_win.days)) THEN RETURN false; END IF;

  v_hour := EXTRACT(HOUR FROM v_local)::integer;
  IF v_hour < v_win.start_hour OR v_hour >= v_win.end_hour THEN RETURN false; END IF;

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
  'True quando o instante cai na janela do grupo do evento, interpretada em company_settings.timezone e com jitter por conexao.';

REVOKE ALL ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz) TO service_role;

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
  v_timezone  text;
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

  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN v_from + interval '1 day'; END IF;
  v_offset := public.whatsapp_window_open_offset(p_connection_id);
  v_local := v_from AT TIME ZONE v_timezone;

  FOR i IN 0..8 LOOP
    v_day := (v_local + make_interval(days => i))::date;
    IF p_event_key = 'os.scheduled_reminder'
       OR EXTRACT(ISODOW FROM v_day)::integer = ANY (v_win.days) THEN
      v_candidate := (v_day + make_interval(hours => v_win.start_hour, secs => v_offset))
                       AT TIME ZONE v_timezone;
      IF v_candidate > v_from THEN RETURN v_candidate; END IF;
    END IF;
  END LOOP;

  RETURN v_from + interval '1 day';
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) IS
  'Proxima abertura da janela do evento no fuso da empresa, com jitter deterministico por conexao.';

REVOKE ALL ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) TO service_role;

-- 4) Enfileirador dedicado: o generico existente falha fechado para eventos de
-- OS desconhecidos e, portanto, nao consegue criar o lembrete sem snapshot.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(
  p_company_id uuid,
  p_customer_id uuid,
  p_source_id uuid,
  p_dedupe_key text,
  p_scheduled_at timestamptz,
  p_timing text,
  p_next_attempt_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_connection public.whatsapp_connections%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_timezone text;
  v_scheduled_date date;
  v_scheduled_time time;
  v_expected_scheduled_at timestamptz;
  v_expected_dedupe_key text;
  v_job_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_id IS NULL
     OR p_scheduled_at IS NULL OR p_timing NOT IN ('day_before', 'same_day') THEN
    RETURN NULL;
  END IF;
  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings
   WHERE company_id = p_company_id
   FOR SHARE;
  IF v_settings.id IS NULL
     OR v_settings.enabled IS NOT TRUE
     OR v_settings.active_connection_id IS NULL
     OR COALESCE(v_settings.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false') <> 'true'
     OR (CASE
           WHEN v_settings.automation_preferences #>> '{os,events,scheduled_reminder,timing}' = 'same_day'
             THEN 'same_day'
           ELSE 'day_before'
         END) IS DISTINCT FROM p_timing THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_connection
    FROM public.whatsapp_connections
   WHERE id = v_settings.active_connection_id
     AND company_id = p_company_id
     AND status = 'connected'
     AND provider = 'evolution_qr';
  IF v_connection.id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = p_company_id
       AND c.whatsapp_notifications_enabled IS TRUE
       AND c.whatsapp_opt_out_at IS NULL
  ) THEN RETURN NULL; END IF;

  SELECT * INTO v_order
    FROM public.service_orders so
   WHERE so.id = p_source_id
     AND so.company_id = p_company_id
     AND so.customer_id = p_customer_id
     AND so.entry_type = 'os'
     AND so.status::text IN ('agendada', 'pendente')
   FOR SHARE;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;

  IF jsonb_array_length(v_order.schedule_plan) > 0 THEN
    v_scheduled_date := (v_order.schedule_plan->0->>'date')::date;
    v_scheduled_time := (v_order.schedule_plan->0->>'time')::time;
  ELSE
    v_scheduled_date := v_order.scheduled_date;
    v_scheduled_time := v_order.scheduled_time;
  END IF;
  IF v_scheduled_date IS NULL OR v_scheduled_time IS NULL THEN RETURN NULL; END IF;

  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN NULL; END IF;
  v_expected_scheduled_at := (v_scheduled_date + v_scheduled_time) AT TIME ZONE v_timezone;
  v_expected_dedupe_key := format(
    'os.scheduled_reminder:%s:at=%s:timing=%s',
    v_order.id,
    floor(EXTRACT(EPOCH FROM v_expected_scheduled_at))::bigint,
    p_timing
  );
  IF p_scheduled_at IS DISTINCT FROM v_expected_scheduled_at
     OR p_dedupe_key IS DISTINCT FROM v_expected_dedupe_key THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.whatsapp_send_jobs (
    company_id, connection_id, provider, customer_id, event_key,
    source_type, source_id, dedupe_key, next_attempt_at,
    schedule_snapshot_at, schedule_snapshot_timing
  ) VALUES (
    p_company_id, v_connection.id, v_connection.provider, p_customer_id,
    'os.scheduled_reminder', 'service_order', p_source_id, p_dedupe_key,
    COALESCE(p_next_attempt_at, now()), p_scheduled_at, p_timing
  )
  ON CONFLICT (company_id, dedupe_key) DO UPDATE
    SET connection_id = EXCLUDED.connection_id,
        provider = EXCLUDED.provider,
        customer_id = EXCLUDED.customer_id,
        status = 'pending',
        attempts = 0,
        defers = 0,
        next_attempt_at = EXCLUDED.next_attempt_at,
        locked_at = NULL,
        dispatch_started_at = NULL,
        last_error_code = NULL,
        last_error = NULL,
        schedule_snapshot_at = EXCLUDED.schedule_snapshot_at,
        schedule_snapshot_timing = EXCLUDED.schedule_snapshot_timing
  WHERE whatsapp_send_jobs.status = 'cancelled'
    AND whatsapp_send_jobs.sent_at IS NULL
    AND whatsapp_send_jobs.provider_message_id IS NULL
    AND whatsapp_send_jobs.attempts = 0
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(uuid,uuid,uuid,text,timestamptz,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(uuid,uuid,uuid,text,timestamptz,text,timestamptz)
  TO service_role;

-- 5) Cron idempotente. A chave inclui OS + instante fotografado + timing.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_scheduled_os_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r record;
  v_local_now timestamp;
  v_timing text;
  v_offset integer;
  v_scheduled_at timestamptz;
  v_dedupe_key text;
  v_id uuid;
  v_count integer := 0;
BEGIN
  -- O cron de recuperacao ja chama o worker a cada minuto. Suprimimos o trigger
  -- por INSERT durante este lote para nao gerar um HTTP wake por candidata que
  -- apenas colidiu com a chave idempotente.
  PERFORM set_config('app.suppress_whatsapp_worker_notify', 'true', true);

  FOR r IN
    WITH bounded_orders AS (
      SELECT so.id, so.company_id, so.customer_id, so.entry_type, so.status,
             so.scheduled_date, so.scheduled_time, so.schedule_plan
        FROM public.service_orders so
       WHERE so.entry_type = 'os'
         AND so.status IN ('agendada'::public.os_status, 'pendente'::public.os_status)
         AND so.scheduled_time IS NOT NULL
         AND so.scheduled_date BETWEEN ((now() AT TIME ZONE 'UTC')::date - 2)
                                     AND ((now() AT TIME ZONE 'UTC')::date + 2)
      UNION
      SELECT so.id, so.company_id, so.customer_id, so.entry_type, so.status,
             so.scheduled_date, so.scheduled_time, so.schedule_plan
        FROM public.service_orders so
       WHERE so.entry_type = 'os'
         AND so.status IN ('agendada'::public.os_status, 'pendente'::public.os_status)
         AND jsonb_array_length(so.schedule_plan) > 0
         AND (so.schedule_plan->0->>'date')
             BETWEEN (((now() AT TIME ZONE 'UTC')::date - 2)::text)
                 AND (((now() AT TIME ZONE 'UTC')::date + 2)::text)
    ), candidates AS (
      SELECT so.id, so.company_id, so.customer_id, so.entry_type, so.status,
             COALESCE(
               CASE WHEN jsonb_array_length(so.schedule_plan) > 0
                    THEN (so.schedule_plan->0->>'date')::date END,
               so.scheduled_date
             ) AS scheduled_date,
             COALESCE(
               CASE WHEN jsonb_array_length(so.schedule_plan) > 0
                    THEN (so.schedule_plan->0->>'time')::time END,
               so.scheduled_time
             ) AS scheduled_time,
             s.enabled, s.active_connection_id, s.automation_preferences,
             public.whatsapp_company_timezone(so.company_id) AS timezone
        FROM bounded_orders so
        JOIN public.company_whatsapp_settings s ON s.company_id = so.company_id
    )
    SELECT * FROM candidates c
     WHERE c.entry_type = 'os'
       AND c.customer_id IS NOT NULL
       AND c.scheduled_date IS NOT NULL
       AND c.scheduled_time IS NOT NULL
       AND c.status::text IN ('agendada', 'pendente')
       AND c.enabled IS TRUE
       AND c.active_connection_id IS NOT NULL
       AND c.timezone IS NOT NULL
       AND COALESCE(c.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false') = 'true'
  LOOP
    v_timing := CASE
      WHEN r.automation_preferences #>> '{os,events,scheduled_reminder,timing}' = 'same_day' THEN 'same_day'
      ELSE 'day_before'
    END;
    v_offset := CASE WHEN v_timing = 'same_day' THEN 0 ELSE 1 END;
    IF r.timezone IS NULL THEN CONTINUE; END IF;
    v_local_now := now() AT TIME ZONE r.timezone;
    v_scheduled_at := (r.scheduled_date + r.scheduled_time) AT TIME ZONE r.timezone;
    v_dedupe_key := format(
      'os.scheduled_reminder:%s:at=%s:timing=%s',
      r.id,
      floor(EXTRACT(EPOCH FROM v_scheduled_at))::bigint,
      v_timing
    );

    IF r.scheduled_date = v_local_now::date + v_offset
       AND (v_offset <> 0 OR now() < v_scheduled_at) THEN
      BEGIN
        v_id := public.whatsapp_enqueue_scheduled_os_reminder_job(
          r.company_id,
          r.customer_id,
          r.id,
          v_dedupe_key,
          v_scheduled_at,
          v_timing,
          now()
        );
        IF v_id IS NOT NULL THEN v_count := v_count + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Uma OS inconsistente nao pode impedir os demais tenants do lote.
        RAISE WARNING 'Falha ao enfileirar lembrete WhatsApp da OS %: %', r.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminders() IS
  'Enfileira lembretes idempotentes de OS agendada/pendente no dia configurado, usando o fuso de cada empresa.';

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminders() TO service_role;

-- 6) Revalidacao final chamada pelo worker. Retorna codigo interno, nunca copy
-- para usuario final. Falha de leitura e tratada pelo worker como deferimento.
CREATE OR REPLACE FUNCTION public.whatsapp_validate_scheduled_os_reminder(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_connection public.whatsapp_connections%ROWTYPE;
  v_timezone text;
  v_local_now timestamp;
  v_timing text;
  v_offset integer;
  v_scheduled_at timestamptz;
  v_expected_dedupe text;
  v_phone text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.event_key = 'os.scheduled_reminder'
     AND j.source_type = 'service_order'
     AND j.status = 'processing';
  IF v_job.id IS NULL THEN RETURN 'job_unavailable'; END IF;

  SELECT * INTO v_order
    FROM public.service_orders so
   WHERE so.id = v_job.source_id
     AND so.company_id = p_company_id
     AND so.entry_type = 'os';
  IF v_order.id IS NULL THEN RETURN 'source_unavailable'; END IF;
  IF v_job.customer_id IS DISTINCT FROM v_order.customer_id THEN RETURN 'customer_changed'; END IF;

  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN 'module_inactive';
  END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings s
   WHERE s.company_id = p_company_id
     AND s.enabled IS TRUE;
  IF v_settings.id IS NULL THEN RETURN 'automation_disabled'; END IF;
  IF v_settings.active_connection_id IS DISTINCT FROM v_job.connection_id THEN
    RETURN 'connection_changed';
  END IF;
  IF COALESCE(v_settings.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false') <> 'true' THEN
    RETURN 'automation_disabled';
  END IF;

  SELECT * INTO v_connection
    FROM public.whatsapp_connections c
   WHERE c.id = v_job.connection_id
     AND c.company_id = p_company_id
     AND c.provider = v_job.provider
     AND c.status = 'connected';
  IF v_connection.id IS NULL THEN RETURN 'connection_unavailable'; END IF;

  SELECT * INTO v_customer
    FROM public.customers c
   WHERE c.id = v_order.customer_id
     AND c.company_id = p_company_id;
  IF v_customer.id IS NULL
     OR v_customer.whatsapp_notifications_enabled IS NOT TRUE
     OR v_customer.whatsapp_opt_out_at IS NOT NULL THEN
    RETURN 'customer_opt_out';
  END IF;

  v_phone := public.whatsapp_normalize_phone(
    p_company_id,
    COALESCE(NULLIF(btrim(v_customer.celular), ''), v_customer.phone)
  );
  IF v_phone IS NULL THEN RETURN 'invalid_phone'; END IF;
  IF v_phone IS DISTINCT FROM regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') THEN
    RETURN 'customer_phone_changed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_opt_outs o
     WHERE o.company_id = p_company_id
       AND o.phone = v_phone
  ) THEN RETURN 'customer_opt_out'; END IF;

  IF v_order.status::text NOT IN ('agendada', 'pendente') THEN RETURN 'status_changed'; END IF;
  IF jsonb_array_length(v_order.schedule_plan) > 0 THEN
    v_order.scheduled_date := (v_order.schedule_plan->0->>'date')::date;
    v_order.scheduled_time := (v_order.schedule_plan->0->>'time')::time;
  END IF;
  IF v_order.scheduled_date IS NULL OR v_order.scheduled_time IS NULL THEN RETURN 'schedule_unavailable'; END IF;

  v_timing := CASE
    WHEN v_settings.automation_preferences #>> '{os,events,scheduled_reminder,timing}' = 'same_day' THEN 'same_day'
    ELSE 'day_before'
  END;
  v_offset := CASE WHEN v_timing = 'same_day' THEN 0 ELSE 1 END;
  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN 'timezone_unavailable'; END IF;
  v_scheduled_at := (v_order.scheduled_date + v_order.scheduled_time) AT TIME ZONE v_timezone;
  v_expected_dedupe := format(
    'os.scheduled_reminder:%s:at=%s:timing=%s',
    v_order.id,
    floor(EXTRACT(EPOCH FROM v_scheduled_at))::bigint,
    v_timing
  );
  IF v_job.dedupe_key IS DISTINCT FROM v_expected_dedupe THEN RETURN 'schedule_changed'; END IF;
  IF v_job.schedule_snapshot_at IS DISTINCT FROM v_scheduled_at
     OR v_job.schedule_snapshot_timing IS DISTINCT FROM v_timing THEN
    RETURN 'schedule_changed';
  END IF;

  v_local_now := now() AT TIME ZONE v_timezone;
  IF v_order.scheduled_date IS DISTINCT FROM (v_local_now::date + v_offset) THEN
    RETURN 'reminder_day_passed';
  END IF;
  IF v_offset = 0 AND now() >= v_scheduled_at THEN
    RETURN 'appointment_passed';
  END IF;

  RETURN 'valid';
END;
$fn$;

COMMENT ON FUNCTION public.whatsapp_validate_scheduled_os_reminder(uuid,uuid,text) IS
  'Rele tenant, preferencia, status, data, hora e dedupe do lembrete imediatamente antes do envio. Somente service_role.';

REVOKE ALL ON FUNCTION public.whatsapp_validate_scheduled_os_reminder(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_validate_scheduled_os_reminder(uuid,uuid,text) TO service_role;

-- Lineariza a ultima revalidacao com o marco de despacho. Depois deste commit,
-- mudancas concorrentes nao cancelam mais o job: a chamada externa pode estar
-- em andamento e nao existe forma segura de a desfazer.
CREATE OR REPLACE FUNCTION public.whatsapp_begin_scheduled_os_dispatch(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_validation text;
BEGIN
  v_validation := public.whatsapp_validate_scheduled_os_reminder(
    p_job_id, p_company_id, p_phone
  );
  IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;

  UPDATE public.whatsapp_send_jobs j
     SET dispatch_started_at = now(),
         locked_at = now()
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.event_key = 'os.scheduled_reminder'
     AND j.status = 'processing'
     AND j.dispatch_started_at IS NULL;
  IF NOT FOUND THEN RETURN 'job_unavailable'; END IF;
  RETURN 'ready';
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_begin_scheduled_os_dispatch(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_begin_scheduled_os_dispatch(uuid,uuid,text)
  TO service_role;

-- Job, auditoria e cadencia viram uma unica transacao. Se qualquer escrita
-- falhar, nenhuma delas fica parcialmente aplicada.
CREATE OR REPLACE FUNCTION public.whatsapp_finalize_scheduled_os_reminder(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text,
  p_provider_message_id text,
  p_sent_at timestamptz,
  p_next_send_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
BEGIN
  UPDATE public.whatsapp_send_jobs j
     SET status = 'sent',
         locked_at = NULL,
         sent_at = p_sent_at,
         provider_message_id = p_provider_message_id,
         last_error = NULL,
         last_error_code = NULL
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.event_key = 'os.scheduled_reminder'
     AND j.status = 'processing'
     AND j.dispatch_started_at IS NOT NULL
  RETURNING j.* INTO v_job;
  IF v_job.id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.whatsapp_events (
    company_id, job_id, connection_id, provider, trigger, os_id,
    phone, status, error, sent_at, provider_message_id
  ) VALUES (
    v_job.company_id, v_job.id, v_job.connection_id, v_job.provider,
    v_job.event_key, v_job.source_id, p_phone, 'enviado', NULL,
    p_sent_at, p_provider_message_id
  )
  ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO UPDATE
    SET phone = EXCLUDED.phone,
        status = 'enviado',
        error = NULL,
        sent_at = EXCLUDED.sent_at,
        provider_message_id = EXCLUDED.provider_message_id;

  UPDATE public.whatsapp_connections c
     SET next_send_at = p_next_send_at,
         consecutive_failures = 0,
         last_error = NULL,
         last_seen_at = p_sent_at
   WHERE c.id = v_job.connection_id
     AND c.company_id = v_job.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conexao do job de WhatsApp nao encontrada na finalizacao';
  END IF;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_finalize_scheduled_os_reminder(uuid,uuid,text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_finalize_scheduled_os_reminder(uuid,uuid,text,text,timestamptz,timestamptz)
  TO service_role;

-- Jobs abandonados antes de tocar no provedor continuam recuperaveis. Depois
-- do marco, a entrega e ambigua e o unico comportamento seguro e nao repetir.
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
     SET status = 'failed',
         locked_at = NULL,
         last_error_code = 'delivery_unknown',
         last_error = 'O processamento foi interrompido depois do inicio do envio; reenvio automatico bloqueado.'
   WHERE status = 'processing'
     AND dispatch_started_at IS NOT NULL
     AND locked_at < now() - make_interval(mins => GREATEST(COALESCE(p_orphan_minutes,10),1));

  UPDATE public.whatsapp_send_jobs
     SET status = 'retry', locked_at = NULL,
         next_attempt_at = now(), last_error_code = 'orphan_recovered',
         last_error = 'Processamento anterior interrompido; job recuperado.'
   WHERE status = 'processing'
     AND dispatch_started_at IS NULL
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

REVOKE ALL ON FUNCTION public.whatsapp_claim_send_jobs(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_claim_send_jobs(integer,integer) TO service_role;

-- Mudanca de agenda/status invalida imediatamente jobs ainda nao enviados. O
-- worker tambem valida de novo para fechar a corrida com um job ja reivindicado.
CREATE OR REPLACE FUNCTION public.cancel_obsolete_scheduled_os_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_old_company_id uuid;
  v_new_company_id uuid;
  v_order_id uuid;
  v_changed boolean;
BEGIN
  v_old_company_id := OLD.company_id;
  v_new_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  v_order_id := OLD.id;

  IF TG_OP = 'DELETE' THEN
    v_changed := true;
  ELSE
    v_changed := OLD.company_id IS DISTINCT FROM NEW.company_id
      OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
      OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
      OR OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time
      OR OLD.schedule_plan IS DISTINCT FROM NEW.schedule_plan
      OR OLD.entry_type IS DISTINCT FROM NEW.entry_type
      OR (OLD.status::text IN ('agendada', 'pendente')
          AND NEW.status::text NOT IN ('agendada', 'pendente'));
  END IF;

  IF v_changed THEN
    UPDATE public.whatsapp_send_jobs j
       SET status = 'cancelled',
           locked_at = NULL,
           last_error_code = 'schedule_changed',
           last_error = 'A agenda ou o status da OS mudou antes do envio.'
     WHERE j.company_id IN (v_old_company_id, v_new_company_id)
       AND j.source_type = 'service_order'
       AND j.source_id = v_order_id
       AND j.event_key = 'os.scheduled_reminder'
       AND j.status IN ('pending', 'retry', 'processing')
       AND j.dispatch_started_at IS NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cancel_obsolete_scheduled_os_reminders ON public.service_orders;
CREATE TRIGGER cancel_obsolete_scheduled_os_reminders
  AFTER UPDATE OF company_id, customer_id, scheduled_date, scheduled_time, schedule_plan, entry_type, status OR DELETE
  ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.cancel_obsolete_scheduled_os_reminders();

REVOKE ALL ON FUNCTION public.cancel_obsolete_scheduled_os_reminders() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_os_reminders_on_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_old_enabled text;
  v_new_enabled text;
  v_old_timing text;
  v_new_timing text;
BEGIN
  v_old_enabled := COALESCE(OLD.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false');
  v_new_enabled := COALESCE(NEW.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false');
  v_old_timing := COALESCE(OLD.automation_preferences #>> '{os,events,scheduled_reminder,timing}', 'day_before');
  v_new_timing := COALESCE(NEW.automation_preferences #>> '{os,events,scheduled_reminder,timing}', 'day_before');

  IF OLD.enabled IS DISTINCT FROM NEW.enabled
     OR OLD.active_connection_id IS DISTINCT FROM NEW.active_connection_id
     OR v_old_enabled IS DISTINCT FROM v_new_enabled
     OR v_old_timing IS DISTINCT FROM v_new_timing THEN
    UPDATE public.whatsapp_send_jobs j
       SET status = 'cancelled',
           locked_at = NULL,
           last_error_code = 'reminder_settings_changed',
           last_error = 'A configuracao do lembrete mudou antes do envio.'
     WHERE j.company_id = NEW.company_id
       AND j.event_key = 'os.scheduled_reminder'
       AND j.status IN ('pending', 'retry', 'processing')
       AND j.dispatch_started_at IS NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cancel_scheduled_os_reminders_on_settings_change ON public.company_whatsapp_settings;
CREATE TRIGGER cancel_scheduled_os_reminders_on_settings_change
  AFTER UPDATE OF enabled, active_connection_id, automation_preferences
  ON public.company_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.cancel_scheduled_os_reminders_on_settings_change();

REVOKE ALL ON FUNCTION public.cancel_scheduled_os_reminders_on_settings_change() FROM PUBLIC, anon, authenticated;

-- O trigger historico e statement-level e tambem roda em INSERT que apenas
-- colide. Durante o cron acima, o wake por minuto ja e a rede de recuperacao.
CREATE OR REPLACE FUNCTION public.notify_whatsapp_send_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
BEGIN
  IF current_setting('app.suppress_whatsapp_worker_notify', true) = 'true' THEN
    RETURN NULL;
  END IF;
  PERFORM net.http_post(
    url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/whatsapp-send-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        ''
      )
    ),
    body := jsonb_build_object('reason', 'new_job')
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Nao foi possivel acordar whatsapp-send-worker: %', SQLERRM;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_whatsapp_send_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_whatsapp_send_worker() TO service_role;

-- A cada cinco minutos cobre fusos com meia hora e evita depender de um unico
-- horario UTC. A fila continua sendo drenada pelo worker ja existente.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-enqueue-scheduled-os-reminders')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-enqueue-scheduled-os-reminders');

    PERFORM cron.schedule(
      'whatsapp-enqueue-scheduled-os-reminders',
      '*/5 * * * *',
      'SELECT public.whatsapp_enqueue_scheduled_os_reminders();'
    );
  END IF;
END;
$block$;
