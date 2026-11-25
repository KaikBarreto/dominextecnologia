-- =============================================================================
-- WhatsApp: mensagem de aniversario para cliente e contatos (opt-in).
--
-- A automacao nasce desligada para toda empresa, inclusive instalacoes novas.
-- O cron usa o dia civil e o ano do fuso da empresa, respeita a janela de
-- lembretes e cria no maximo um job por pessoa/ano. Cliente e contato nao usam
-- customer_whatsapp_routes: cada cadastro com aniversario e telefone valido e
-- um destinatario independente. O worker e a funcao de despacho revalidam
-- consentimento, telefone, opt-out, data e configuracao antes do provedor.
-- =============================================================================

-- 1) Data de nascimento de cada contato. Sem backfill.
ALTER TABLE public.customer_contacts
  ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN public.customer_contacts.birth_date IS
  'Data de nascimento opcional do contato, usada pela automacao opt-in de aniversario.';

CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_birthday
  ON public.customers (
    company_id,
    (EXTRACT(MONTH FROM birth_date)),
    (EXTRACT(DAY FROM birth_date))
  )
  WHERE birth_date IS NOT NULL
    AND is_deleted IS FALSE;

CREATE INDEX IF NOT EXISTS idx_customer_contacts_whatsapp_birthday
  ON public.customer_contacts (
    (EXTRACT(MONTH FROM birth_date)),
    (EXTRACT(DAY FROM birth_date)),
    customer_id
  )
  WHERE birth_date IS NOT NULL;

-- 2) Preferencia provider-agnostic. Ausencia tambem significa desligado.
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
        "criada": {"enabled": false, "template": "automatic"},
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
    },
    "birthday": {
      "events": {
        "greeting": {"enabled": false, "template": "cordial"}
      }
    }
  }'::jsonb;

UPDATE public.company_whatsapp_settings s
   SET automation_preferences = s.automation_preferences
     || jsonb_build_object(
          'birthday',
          CASE
            WHEN jsonb_typeof(s.automation_preferences -> 'birthday') = 'object'
              THEN s.automation_preferences -> 'birthday'
            ELSE '{}'::jsonb
          END
          || jsonb_build_object(
               'events',
               CASE
                 WHEN jsonb_typeof(s.automation_preferences #> '{birthday,events}') = 'object'
                   THEN s.automation_preferences #> '{birthday,events}'
                 ELSE '{}'::jsonb
               END
               || jsonb_build_object(
                    'greeting',
                    CASE
                      WHEN jsonb_typeof(s.automation_preferences #> '{birthday,events,greeting}') = 'object'
                        THEN s.automation_preferences #> '{birthday,events,greeting}'
                      ELSE '{"template": "cordial"}'::jsonb
                    END
                    || '{"enabled": false}'::jsonb
                  )
             )
        );

-- 3) Contrato da fila e futuro binding da Meta.
ALTER TABLE public.whatsapp_template_bindings
  DROP CONSTRAINT IF EXISTS whatsapp_template_bindings_event_key_check;
ALTER TABLE public.whatsapp_template_bindings
  ADD CONSTRAINT whatsapp_template_bindings_event_key_check CHECK (event_key IN (
    'os.scheduled_reminder', 'os.criada', 'os.a_caminho', 'os.em_andamento', 'os.concluida',
    'billing.created', 'billing.before_due', 'billing.due_today', 'billing.after_due',
    'birthday.greeting'
  )) NOT VALID;
ALTER TABLE public.whatsapp_template_bindings
  VALIDATE CONSTRAINT whatsapp_template_bindings_event_key_check;

ALTER TABLE public.whatsapp_send_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_send_jobs_event_key_check;
ALTER TABLE public.whatsapp_send_jobs
  ADD CONSTRAINT whatsapp_send_jobs_event_key_check CHECK (event_key IN (
    'os.scheduled_reminder', 'os.criada', 'os.a_caminho', 'os.em_andamento', 'os.concluida',
    'billing.created', 'billing.before_due', 'billing.due_today', 'billing.after_due',
    'birthday.greeting'
  )) NOT VALID;
ALTER TABLE public.whatsapp_send_jobs
  VALIDATE CONSTRAINT whatsapp_send_jobs_event_key_check;

ALTER TABLE public.whatsapp_send_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_send_jobs_source_type_check;
ALTER TABLE public.whatsapp_send_jobs
  ADD CONSTRAINT whatsapp_send_jobs_source_type_check CHECK (
    source_type IN ('service_order', 'tenant_charge', 'birthday')
  ) NOT VALID;
ALTER TABLE public.whatsapp_send_jobs
  VALIDATE CONSTRAINT whatsapp_send_jobs_source_type_check;

-- Birthday usa as horas da janela restrita de lembretes, mas todos os dias:
-- um aniversario de domingo nao pode ser deslocado para segunda. Eventos
-- desconhecidos continuam falhando fechado em reminders.
CREATE OR REPLACE FUNCTION public.whatsapp_event_window_group(p_event_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT CASE
           WHEN COALESCE(p_event_key, '') IN ('os.scheduled_reminder', 'os.criada') THEN 'reminders'
           WHEN COALESCE(p_event_key, '') LIKE 'os.%' THEN 'transactional'
           ELSE 'reminders'
         END;
$function$;

COMMENT ON FUNCTION public.whatsapp_event_window_group(text) IS
  'Grupo de janela: os.scheduled_reminder, os.criada, billing.* e birthday.* usam as horas de reminders; demais os.* usam transactional; desconhecido falha fechado.';

REVOKE ALL ON FUNCTION public.whatsapp_event_window_group(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_event_window_group(text) TO service_role;

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
AS $function$
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

  -- Visita agendada e aniversario podem ocorrer em qualquer dia. Ambos usam
  -- as horas de reminders, sem perder domingo por causa da lista de dias.
  IF p_event_key NOT IN ('os.scheduled_reminder', 'birthday.greeting')
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
$function$;

COMMENT ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz) IS
  'True quando o instante cai na janela do evento no fuso da empresa; visita agendada e aniversario usam horas de reminders em todos os dias.';

REVOKE ALL ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_in_send_window(uuid,uuid,text,timestamptz)
  TO service_role;

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
AS $function$
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
    IF p_event_key IN ('os.scheduled_reminder', 'birthday.greeting')
       OR EXTRACT(ISODOW FROM v_day)::integer = ANY (v_win.days) THEN
      v_candidate := (v_day + make_interval(hours => v_win.start_hour, secs => v_offset))
                       AT TIME ZONE v_timezone;
      IF v_candidate > v_from THEN RETURN v_candidate; END IF;
    END IF;
  END LOOP;

  RETURN v_from + interval '1 day';
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz) IS
  'Proxima abertura no fuso da empresa; visita agendada e aniversario usam horas de reminders em todos os dias.';

REVOKE ALL ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_next_window_opening(uuid,uuid,text,timestamptz)
  TO service_role;

-- 4) Enfileirador horario. A selecao nao consulta rotas: o aniversario e da
-- propria pessoa cadastrada. A chave anual usa o ano civil local da empresa.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_birthday_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  r record;
  v_phone text;
  v_inserted_id uuid;
  v_count integer := 0;
  v_prev_claims text;
  v_assumed_service boolean := false;
BEGIN
  -- pg_cron roda sem JWT. A funcao e fechada a postgres/service_role; o claim
  -- temporario serve apenas para a guarda canonica de assinatura.
  IF auth.role() IS NULL THEN
    v_prev_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_assumed_service := true;
  END IF;

  -- O cron de recuperacao do worker acorda a fila a cada minuto. Evita um HTTP
  -- por aniversariante durante o lote.
  PERFORM set_config('app.suppress_whatsapp_worker_notify', 'true', true);

  FOR r IN
    WITH eligible_companies AS (
      SELECT s.company_id,
             s.active_connection_id AS connection_id,
             c.provider,
             public.whatsapp_company_timezone(s.company_id) AS timezone
        FROM public.company_whatsapp_settings s
        JOIN public.whatsapp_connections c
          ON c.id = s.active_connection_id
         AND c.company_id = s.company_id
         AND c.status = 'connected'
         AND c.provider = 'evolution_qr'
       WHERE s.enabled IS TRUE
         AND COALESCE(
               s.automation_preferences #>> '{birthday,events,greeting,enabled}',
               'false'
             ) = 'true'
         AND public.company_has_module(s.company_id, 'whatsapp') IS TRUE
         AND public.tenant_subscription_allows_access(s.company_id) IS TRUE
         AND public.whatsapp_in_send_window(
               s.company_id,
               s.active_connection_id,
               'birthday.greeting',
               now()
             ) IS TRUE
    ), candidates AS (
      SELECT ec.company_id,
             ec.connection_id,
             ec.provider,
             ec.timezone,
             c.id AS customer_id,
             c.id AS source_id,
             'customer_primary'::text AS recipient_kind,
             NULL::uuid AS customer_contact_id,
             COALESCE(NULLIF(btrim(c.celular), ''), c.phone) AS raw_phone,
             c.birth_date
        FROM eligible_companies ec
        JOIN public.customers c ON c.company_id = ec.company_id
       WHERE ec.timezone IS NOT NULL
         AND c.birth_date IS NOT NULL
         AND c.is_deleted IS FALSE
         AND c.whatsapp_notifications_enabled IS TRUE
         AND c.whatsapp_opt_out_at IS NULL
         AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM now() AT TIME ZONE ec.timezone)
         AND EXTRACT(DAY FROM c.birth_date) = EXTRACT(DAY FROM now() AT TIME ZONE ec.timezone)

      UNION ALL

      SELECT ec.company_id,
             ec.connection_id,
             ec.provider,
             ec.timezone,
             c.id AS customer_id,
             cc.id AS source_id,
             'customer_contact'::text AS recipient_kind,
             cc.id AS customer_contact_id,
             cc.phone AS raw_phone,
             cc.birth_date
        FROM eligible_companies ec
        JOIN public.customers c ON c.company_id = ec.company_id
        JOIN public.customer_contacts cc ON cc.customer_id = c.id
       WHERE ec.timezone IS NOT NULL
         AND cc.birth_date IS NOT NULL
         AND c.is_deleted IS FALSE
         AND c.whatsapp_notifications_enabled IS TRUE
         AND c.whatsapp_opt_out_at IS NULL
         AND EXTRACT(MONTH FROM cc.birth_date) = EXTRACT(MONTH FROM now() AT TIME ZONE ec.timezone)
         AND EXTRACT(DAY FROM cc.birth_date) = EXTRACT(DAY FROM now() AT TIME ZONE ec.timezone)
    )
    SELECT * FROM candidates
  LOOP
    v_phone := public.whatsapp_normalize_phone(r.company_id, r.raw_phone);
    IF v_phone IS NULL OR EXISTS (
      SELECT 1
        FROM public.whatsapp_opt_outs o
       WHERE o.company_id = r.company_id
         AND o.phone = v_phone
    ) THEN
      CONTINUE;
    END IF;

    v_inserted_id := NULL;
    INSERT INTO public.whatsapp_send_jobs (
      company_id, connection_id, provider, customer_id, event_key,
      source_type, source_id, dedupe_key, next_attempt_at,
      recipient_kind, customer_contact_id, recipient_route_id
    ) VALUES (
      r.company_id, r.connection_id, r.provider, r.customer_id, 'birthday.greeting',
      'birthday', r.source_id,
      format(
        'birthday.greeting:%s:%s:%s',
        CASE WHEN r.recipient_kind = 'customer_contact' THEN 'contact' ELSE 'customer' END,
        r.source_id,
        EXTRACT(YEAR FROM now() AT TIME ZONE r.timezone)::integer
      ),
      now(), r.recipient_kind, r.customer_contact_id, NULL
    )
    ON CONFLICT (company_id, dedupe_key) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;

  IF v_assumed_service THEN
    PERFORM set_config('request.jwt.claims', COALESCE(v_prev_claims, ''), true);
  END IF;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_enqueue_birthday_messages() IS
  'Enfileira, na janela reminders e no fuso da empresa, uma saudacao anual opt-in por cliente ou contato com aniversario no dia.';

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_birthday_messages()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_birthday_messages()
  TO service_role;

-- 5) Barreira transacional final. Independente do worker, impede o despacho
-- se a data, telefone, consentimento ou opt-in mudar depois do enfileiramento.
CREATE OR REPLACE FUNCTION public.whatsapp_validate_birthday_dispatch(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_connection public.whatsapp_connections%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_contact public.customer_contacts%ROWTYPE;
  v_timezone text;
  v_birth_date date;
  v_raw_phone text;
  v_normalized_phone text;
  v_local_date date;
  v_expected_dedupe text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.event_key = 'birthday.greeting'
     AND j.source_type = 'birthday'
     AND j.status = 'processing';
  IF v_job.id IS NULL THEN RETURN 'job_unavailable'; END IF;
  IF v_job.recipient_route_id IS NOT NULL THEN RETURN 'recipient_route_invalid'; END IF;

  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN 'channel_module_inactive';
  END IF;
  IF public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE THEN
    RETURN 'subscription_inactive';
  END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings s
   WHERE s.company_id = p_company_id
     AND s.enabled IS TRUE;
  IF v_settings.id IS NULL
     OR v_settings.active_connection_id IS DISTINCT FROM v_job.connection_id
     OR COALESCE(
          v_settings.automation_preferences #>> '{birthday,events,greeting,enabled}',
          'false'
        ) <> 'true' THEN
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
   WHERE c.id = v_job.customer_id
     AND c.company_id = p_company_id
     AND c.is_deleted IS FALSE;
  IF v_customer.id IS NULL THEN RETURN 'customer_unavailable'; END IF;
  IF v_customer.whatsapp_notifications_enabled IS NOT TRUE
     OR v_customer.whatsapp_opt_out_at IS NOT NULL THEN
    RETURN 'customer_opt_out';
  END IF;

  IF v_job.recipient_kind = 'customer_contact' THEN
    SELECT * INTO v_contact
      FROM public.customer_contacts cc
     WHERE cc.id = v_job.customer_contact_id
       AND cc.customer_id = v_customer.id;
    IF v_contact.id IS NULL OR v_job.source_id IS DISTINCT FROM v_contact.id THEN
      RETURN 'recipient_unavailable';
    END IF;
    v_birth_date := v_contact.birth_date;
    v_raw_phone := v_contact.phone;
  ELSIF v_job.recipient_kind = 'customer_primary'
        AND v_job.customer_contact_id IS NULL
        AND v_job.source_id = v_customer.id THEN
    v_birth_date := v_customer.birth_date;
    v_raw_phone := COALESCE(NULLIF(btrim(v_customer.celular), ''), v_customer.phone);
  ELSE
    RETURN 'recipient_unavailable';
  END IF;

  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN 'timezone_unavailable'; END IF;
  v_local_date := (now() AT TIME ZONE v_timezone)::date;
  IF v_birth_date IS NULL
     OR EXTRACT(MONTH FROM v_birth_date) <> EXTRACT(MONTH FROM v_local_date)
     OR EXTRACT(DAY FROM v_birth_date) <> EXTRACT(DAY FROM v_local_date) THEN
    RETURN 'birthday_date_changed';
  END IF;

  v_expected_dedupe := format(
    'birthday.greeting:%s:%s:%s',
    CASE WHEN v_job.recipient_kind = 'customer_contact' THEN 'contact' ELSE 'customer' END,
    v_job.source_id,
    EXTRACT(YEAR FROM v_local_date)::integer
  );
  IF v_job.dedupe_key IS DISTINCT FROM v_expected_dedupe THEN
    RETURN 'birthday_year_changed';
  END IF;

  v_normalized_phone := public.whatsapp_normalize_phone(p_company_id, v_raw_phone);
  IF v_normalized_phone IS NULL THEN RETURN 'invalid_phone'; END IF;
  IF v_normalized_phone IS DISTINCT FROM regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') THEN
    RETURN 'recipient_phone_changed';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.whatsapp_opt_outs o
     WHERE o.company_id = p_company_id
       AND o.phone = v_normalized_phone
  ) THEN
    RETURN 'customer_opt_out';
  END IF;

  RETURN 'valid';
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_validate_birthday_dispatch(uuid, uuid, text) IS
  'Revalida aniversario, ano local, pessoa, telefone, consentimento, opt-out, assinatura, modulo, configuracao e conexao antes do despacho.';

REVOKE ALL ON FUNCTION public.whatsapp_validate_birthday_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_validate_birthday_dispatch(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_begin_send_job_dispatch(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_validation text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.status = 'processing'
   FOR UPDATE;
  IF v_job.id IS NULL OR v_job.dispatch_started_at IS NOT NULL THEN
    RETURN 'job_unavailable';
  END IF;

  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN 'channel_module_inactive';
  END IF;
  IF v_job.event_key LIKE 'os.%'
     AND public.company_has_module(p_company_id, 'service_operations') IS NOT TRUE THEN
    RETURN 'event_module_inactive';
  END IF;
  IF v_job.event_key LIKE 'billing.%'
     AND public.company_has_module(p_company_id, 'cobrancas') IS NOT TRUE THEN
    RETURN 'event_module_inactive';
  END IF;

  IF v_job.event_key = 'os.scheduled_reminder' THEN
    v_validation := public.whatsapp_validate_scheduled_os_reminder(
      p_job_id, p_company_id, p_phone
    );
    IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;
  ELSIF v_job.event_key = 'os.criada' THEN
    v_validation := public.whatsapp_validate_os_created_notice(p_job_id, p_company_id);
    IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;
  ELSIF v_job.event_key = 'birthday.greeting' THEN
    v_validation := public.whatsapp_validate_birthday_dispatch(
      p_job_id, p_company_id, p_phone
    );
    IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;
  END IF;

  UPDATE public.whatsapp_send_jobs j
     SET dispatch_started_at = now(),
         locked_at = now()
   WHERE j.id = v_job.id
     AND j.company_id = v_job.company_id
     AND j.status = 'processing'
     AND j.dispatch_started_at IS NULL;
  IF NOT FOUND THEN RETURN 'job_unavailable'; END IF;
  RETURN 'ready';
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid, uuid, text) IS
  'Marca o inicio do envio apos revalidar WhatsApp, o modulo funcional e as barreiras especializadas de OS/aniversario.';

-- 6) Executa em todos os fusos sem rajada na virada da hora. Sem backfill:
-- apenas aniversarios do dia civil corrente entram na fila.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-enqueue-birthday-messages')
     WHERE EXISTS (
       SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-enqueue-birthday-messages'
     );
    PERFORM cron.schedule(
      'whatsapp-enqueue-birthday-messages',
      '37 * * * *',
      'SELECT public.whatsapp_enqueue_birthday_messages();'
    );
  END IF;
END;
$block$;
