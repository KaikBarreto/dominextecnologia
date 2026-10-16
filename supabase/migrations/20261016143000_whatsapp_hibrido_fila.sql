-- =============================================================================
-- WhatsApp híbrido: Meta Cloud API + Evolution QR, fila durável e auditoria.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- O produto pago cobre a automação Dominex, não promete que o canal atual é
-- oficial. O preço permanece inalterado; apenas removemos o nome enganoso.
UPDATE public.whatsapp_tiers
   SET name = 'WhatsApp Dominex', updated_at = now()
 WHERE tier = 2 AND name = 'Integração Oficial';

-- 1) Conexões por provedor. Segredos nunca ficam nesta tabela: tokens da Meta
-- são gravados no Vault com name `tenant_whatsapp_meta_token_<connection_id>`.
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider                 text NOT NULL CHECK (provider IN ('meta_cloud','evolution_qr')),
  status                   text NOT NULL DEFAULT 'disconnected'
                             CHECK (status IN ('disconnected','connecting','qr','connected','attention','banned','error')),
  display_number           text,
  instance_name            text,
  meta_business_id         text,
  meta_waba_id             text,
  meta_phone_number_id     text,
  meta_quality_rating      text CHECK (meta_quality_rating IS NULL OR meta_quality_rating IN ('GREEN','YELLOW','RED','NA')),
  secret_name              text,
  risk_accepted_at         timestamptz,
  risk_accepted_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  risk_terms_version       text,
  connected_at             timestamptz,
  last_seen_at             timestamptz,
  next_send_at             timestamptz,
  last_error               text,
  consecutive_failures     integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider),
  UNIQUE (instance_name),
  UNIQUE (meta_phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_company
  ON public.whatsapp_connections(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_status
  ON public.whatsapp_connections(status);

DROP TRIGGER IF EXISTS set_updated_at_whatsapp_connections ON public.whatsapp_connections;
CREATE TRIGGER set_updated_at_whatsapp_connections
  BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "service_role_full_access_whatsapp_connections"
  ON public.whatsapp_connections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view whatsapp connections from their company" ON public.whatsapp_connections;
CREATE POLICY "Users can view whatsapp connections from their company"
  ON public.whatsapp_connections FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.whatsapp_connections FROM authenticated, anon;
GRANT SELECT ON public.whatsapp_connections TO authenticated;

-- Apenas uma conexão é a escolhida para novos jobs. A conexão escolhida deve
-- pertencer à mesma empresa; o trigger fecha o buraco que uma FK simples deixa.
ALTER TABLE public.company_whatsapp_settings
  ADD COLUMN IF NOT EXISTS active_connection_id uuid
    REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_whatsapp_active_connection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.active_connection_id IS NOT NULL
      OR TG_OP = 'UPDATE' AND NEW.active_connection_id IS DISTINCT FROM OLD.active_connection_id)
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin'::public.app_role, 'gestor'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Somente administradores ou gestores podem trocar o canal de WhatsApp.' USING ERRCODE = '42501';
  END IF;
  IF NEW.active_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_connections c
     WHERE c.id = NEW.active_connection_id
       AND c.company_id = NEW.company_id
       AND (c.provider <> 'evolution_qr' OR c.risk_accepted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'A conexão não pertence à empresa ou exige aceite de risco.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS validate_whatsapp_active_connection ON public.company_whatsapp_settings;
CREATE TRIGGER validate_whatsapp_active_connection
  BEFORE INSERT OR UPDATE OF active_connection_id, company_id
  ON public.company_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_whatsapp_active_connection();

-- Migra configurações Evolution legadas sem apagar campos antigos; eles ficam
-- durante uma janela de compatibilidade para bundles/edges anteriores.
INSERT INTO public.whatsapp_connections (
  company_id, provider, status, display_number, instance_name, connected_at, last_seen_at
)
SELECT
  s.company_id,
  'evolution_qr',
  CASE s.connection_status
    WHEN 'connected' THEN 'connected'
    WHEN 'qr' THEN 'qr'
    WHEN 'banned' THEN 'banned'
    ELSE 'disconnected'
  END,
  s.connected_number,
  s.instance_name,
  s.connected_at,
  s.updated_at
FROM public.company_whatsapp_settings s
WHERE s.instance_name IS NOT NULL
ON CONFLICT (company_id, provider) DO UPDATE SET
  instance_name = COALESCE(EXCLUDED.instance_name, whatsapp_connections.instance_name),
  display_number = COALESCE(EXCLUDED.display_number, whatsapp_connections.display_number),
  connected_at = COALESCE(EXCLUDED.connected_at, whatsapp_connections.connected_at),
  status = EXCLUDED.status;

UPDATE public.company_whatsapp_settings s
   SET active_connection_id = c.id
  FROM public.whatsapp_connections c
 WHERE c.company_id = s.company_id
   AND c.provider = 'evolution_qr'
   AND c.status = 'connected'
   AND c.risk_accepted_at IS NOT NULL
   AND s.active_connection_id IS NULL;

-- 2) Vínculo tenant/evento -> template aprovado na Meta. O catálogo global
-- whatsapp_templates continua sendo usado somente pelas variações Evolution.
CREATE TABLE IF NOT EXISTS public.whatsapp_template_bindings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id         uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  event_key             text NOT NULL CHECK (event_key IN (
                            'os.a_caminho','os.em_andamento','os.concluida',
                            'billing.created','billing.before_due','billing.due_today','billing.after_due'
                          )),
  template_name         text NOT NULL,
  language_code         text NOT NULL DEFAULT 'pt_BR',
  category              text NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('UTILITY','AUTHENTICATION','MARKETING')),
  approval_status       text NOT NULL DEFAULT 'PENDING'
                          CHECK (approval_status IN ('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','DELETED')),
  external_template_id  text,
  body                  text NOT NULL,
  variable_keys         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variable_keys) = 'array'),
  rejection_reason      text,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_bindings_company
  ON public.whatsapp_template_bindings(company_id);

DROP TRIGGER IF EXISTS set_updated_at_whatsapp_template_bindings ON public.whatsapp_template_bindings;
CREATE TRIGGER set_updated_at_whatsapp_template_bindings
  BEFORE UPDATE ON public.whatsapp_template_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_template_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access_whatsapp_template_bindings"
  ON public.whatsapp_template_bindings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Users can view whatsapp templates from their company"
  ON public.whatsapp_template_bindings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.whatsapp_template_bindings FROM authenticated, anon;
GRANT SELECT ON public.whatsapp_template_bindings TO authenticated;

-- 3) Fila durável. Não contém o texto final nem segredo; o worker reconcilia os
-- dados da OS/cobrança no servidor imediatamente antes de enviar.
CREATE TABLE IF NOT EXISTS public.whatsapp_send_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id         uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('meta_cloud','evolution_qr')),
  customer_id           uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  event_key             text NOT NULL CHECK (event_key IN (
                            'os.a_caminho','os.em_andamento','os.concluida',
                            'billing.created','billing.before_due','billing.due_today','billing.after_due'
                          )),
  source_type           text NOT NULL CHECK (source_type IN ('service_order','tenant_charge')),
  source_id             uuid NOT NULL,
  dedupe_key            text NOT NULL,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','sent','delivered','read','skipped','retry','failed','cancelled')),
  attempts              integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  locked_at             timestamptz,
  sent_at               timestamptz,
  provider_message_id   text,
  last_error_code       text,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_ready
  ON public.whatsapp_send_jobs(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_company
  ON public.whatsapp_send_jobs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_send_jobs_provider_message
  ON public.whatsapp_send_jobs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_whatsapp_send_jobs ON public.whatsapp_send_jobs;
CREATE TRIGGER set_updated_at_whatsapp_send_jobs
  BEFORE UPDATE ON public.whatsapp_send_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_send_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access_whatsapp_send_jobs"
  ON public.whatsapp_send_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Users can view whatsapp jobs from their company"
  ON public.whatsapp_send_jobs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.whatsapp_send_jobs FROM authenticated, anon;
GRANT SELECT ON public.whatsapp_send_jobs TO authenticated;

-- Amplia o histórico para os dois provedores e todos os estados de entrega.
ALTER TABLE public.whatsapp_events
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.whatsapp_send_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider text CHECK (provider IS NULL OR provider IN ('meta_cloud','evolution_qr')),
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_estimate numeric(12,6);

ALTER TABLE public.whatsapp_events DROP CONSTRAINT IF EXISTS whatsapp_events_status_check;
ALTER TABLE public.whatsapp_events ADD CONSTRAINT whatsapp_events_status_check
  CHECK (status IN ('fila','enviado','entregue','lido','ignorado','erro'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_events_job_unique
  ON public.whatsapp_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_provider_message
  ON public.whatsapp_events(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Um ACK de leitura muda o estado de entregue para lido; a cota precisa
-- continuar contando a mensagem depois dessa transição.
CREATE OR REPLACE FUNCTION public.whatsapp_can_send(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_limit int;
  v_used int;
BEGIN
  IF p_company_id IS NULL THEN RETURN false; END IF;
  SELECT t.monthly_limit INTO v_limit
    FROM public.companies c
    JOIN public.whatsapp_tiers t ON t.tier = COALESCE(c.whatsapp_tier, 1)
   WHERE c.id = p_company_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_limit IS NULL THEN RETURN true; END IF;
  SELECT COUNT(*)::int INTO v_used
    FROM public.whatsapp_events e
   WHERE e.company_id = p_company_id
     AND date_trunc('month', e.sent_at AT TIME ZONE 'America/Sao_Paulo')
         = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
     AND e.status IN ('enviado','entregue','lido');
  RETURN COALESCE(v_used, 0) < v_limit;
END;
$function$;

-- 4) Enfileiramento central. O trigger só cria job se módulo/configuração,
-- consentimento e conexão ativa estiverem válidos. O worker revalida tudo.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_transactional_job(
  p_company_id uuid,
  p_customer_id uuid,
  p_event_key text,
  p_source_type text,
  p_source_id uuid,
  p_dedupe_key text,
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
  v_job_id uuid;
  v_enabled boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings
   WHERE company_id = p_company_id;

  IF v_settings.id IS NULL OR v_settings.enabled IS NOT TRUE OR v_settings.active_connection_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_connection
    FROM public.whatsapp_connections
   WHERE id = v_settings.active_connection_id
     AND company_id = p_company_id
     AND status = 'connected';

  IF v_connection.id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = p_company_id
       AND c.whatsapp_notifications_enabled IS TRUE
       AND c.whatsapp_opt_out_at IS NULL
  ) THEN RETURN NULL; END IF;

  IF p_event_key LIKE 'os.%' THEN
    v_enabled := CASE p_event_key
      WHEN 'os.a_caminho' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,a_caminho,enabled}')::boolean, v_settings.trigger_a_caminho)
      WHEN 'os.em_andamento' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,em_andamento,enabled}')::boolean, v_settings.trigger_em_andamento)
      WHEN 'os.concluida' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,concluida,enabled}')::boolean, v_settings.trigger_concluida)
      ELSE false END;
  ELSE
    v_enabled := COALESCE((v_settings.automation_preferences #>> ARRAY['billing','events',split_part(p_event_key,'.',2),'enabled'])::boolean, false);
  END IF;

  IF v_enabled IS NOT TRUE THEN RETURN NULL; END IF;

  INSERT INTO public.whatsapp_send_jobs (
    company_id, connection_id, provider, customer_id, event_key,
    source_type, source_id, dedupe_key, next_attempt_at
  ) VALUES (
    p_company_id, v_connection.id, v_connection.provider, p_customer_id, p_event_key,
    p_source_type, p_source_id, p_dedupe_key, COALESCE(p_next_attempt_at, now())
  )
  ON CONFLICT (company_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid,uuid,text,text,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid,uuid,text,text,uuid,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_service_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_event text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_event := CASE NEW.status
    WHEN 'a_caminho' THEN 'os.a_caminho'
    WHEN 'em_andamento' THEN 'os.em_andamento'
    WHEN 'concluida' THEN 'os.concluida'
    ELSE NULL END;
  IF v_event IS NOT NULL THEN
    PERFORM public.whatsapp_enqueue_transactional_job(
      NEW.company_id, NEW.customer_id, v_event, 'service_order', NEW.id,
      format('%s:%s:%s', v_event, NEW.id, NEW.updated_at::text), now()
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enqueue_whatsapp_service_order_status ON public.service_orders;
CREATE TRIGGER enqueue_whatsapp_service_order_status
  AFTER UPDATE OF status ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_service_order_status();

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_charge_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.asaas_payment_id IS NOT NULL
     AND NEW.status IN ('PENDING','OVERDUE')
     AND (TG_OP = 'INSERT' OR OLD.asaas_payment_id IS NULL OR OLD.status = 'PENDING_CREATION') THEN
    PERFORM public.whatsapp_enqueue_transactional_job(
      NEW.company_id, NEW.customer_id, 'billing.created', 'tenant_charge', NEW.id,
      format('billing.created:%s', NEW.id), now()
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enqueue_whatsapp_charge_created ON public.tenant_charges;
CREATE TRIGGER enqueue_whatsapp_charge_created
  AFTER INSERT OR UPDATE OF asaas_payment_id, status ON public.tenant_charges
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_charge_created();

-- Gera lembretes idempotentes. Pode rodar várias vezes no mesmo dia.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_due_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r record;
  v_before integer;
  v_after integer;
  v_event text;
  v_count integer := 0;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT tc.*, s.automation_preferences
      FROM public.tenant_charges tc
      JOIN public.company_whatsapp_settings s ON s.company_id = tc.company_id
     WHERE tc.customer_id IS NOT NULL
       AND tc.due_date IS NOT NULL
       AND tc.status IN ('PENDING','OVERDUE')
       AND s.enabled IS TRUE
       AND s.active_connection_id IS NOT NULL
  LOOP
    v_before := GREATEST(COALESCE((r.automation_preferences #>> '{billing,daysBeforeDue}')::integer, 3), 1);
    v_after := GREATEST(COALESCE((r.automation_preferences #>> '{billing,daysAfterDue}')::integer, 2), 1);
    v_event := CASE
      WHEN r.due_date = current_date + v_before THEN 'billing.before_due'
      WHEN r.due_date = current_date THEN 'billing.due_today'
      WHEN r.due_date = current_date - v_after THEN 'billing.after_due'
      ELSE NULL END;
    IF v_event IS NOT NULL THEN
      v_id := public.whatsapp_enqueue_transactional_job(
        r.company_id, r.customer_id, v_event, 'tenant_charge', r.id,
        format('%s:%s:%s', v_event, r.id, current_date), now()
      );
      IF v_id IS NOT NULL THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_due_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_due_reminders() TO service_role;

-- 5) Claim atômico: um job por empresa por rodada; jobs órfãos voltam para retry.
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

-- O insert acorda o worker sem bloquear a transação. Se a chamada HTTP falhar,
-- o cron abaixo funciona como rede de recuperação a cada minuto.
CREATE OR REPLACE FUNCTION public.notify_whatsapp_send_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
BEGIN
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
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Não foi possível acordar whatsapp-send-worker: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_whatsapp_send_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_whatsapp_send_worker() TO service_role;

DROP TRIGGER IF EXISTS notify_whatsapp_send_worker ON public.whatsapp_send_jobs;
CREATE TRIGGER notify_whatsapp_send_worker
  AFTER INSERT ON public.whatsapp_send_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_whatsapp_send_worker();

-- Lembretes diários às 08:00 de Brasília e recuperação do worker a cada minuto.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-enqueue-due-reminders')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-enqueue-due-reminders');
    PERFORM cron.unschedule('whatsapp-send-worker-every-minute')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-send-worker-every-minute');

    PERFORM cron.schedule(
      'whatsapp-enqueue-due-reminders',
      '0 11 * * *',
      'SELECT public.whatsapp_enqueue_due_reminders();'
    );

    PERFORM cron.schedule(
      'whatsapp-send-worker-every-minute',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/whatsapp-send-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            ''
          )
        ),
        body := jsonb_build_object('reason', 'recovery_cron')
      );
      $job$
    );
  END IF;
END;
$block$;

COMMENT ON TABLE public.whatsapp_connections IS
  'Conexões WhatsApp por tenant/provedor. Tokens ficam no Vault; nunca nesta tabela.';
COMMENT ON TABLE public.whatsapp_send_jobs IS
  'Fila transacional durável de WhatsApp. O provedor é fotografado na criação e nunca troca automaticamente.';
