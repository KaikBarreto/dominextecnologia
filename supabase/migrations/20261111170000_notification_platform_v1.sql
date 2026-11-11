-- Plataforma canonica de notificacoes internas (in-app + Web Push).
--
-- Invariantes:
--   * o evento de dominio e persistido antes de qualquer tentativa de entrega;
--   * todo destinatario e revalidado no tenant e precisa estar ativo;
--   * inbox e deduplicada por evento + usuario;
--   * push e derivado da inbox e nunca bloqueia a transacao principal;
--   * push usa titulo e resumo gerados no servidor, com tamanho limitado;
--   * a exibicao da previa na tela bloqueada e controlada pelo aparelho.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Evento canonico / outbox
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type         text NOT NULL,
  source_type        text NOT NULL,
  source_id          uuid,
  dedupe_key         text NOT NULL,
  recipient_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  message            text CHECK (message IS NULL OR char_length(message) <= 500),
  action_url         text CHECK (action_url IS NULL OR (action_url LIKE '/%' AND action_url NOT LIKE '//%')),
  icon               text NOT NULL DEFAULT 'bell' CHECK (char_length(icon) BETWEEN 1 AND 50),
  category           text NOT NULL DEFAULT 'general' CHECK (char_length(category) BETWEEN 1 AND 50),
  priority           text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  routed_at          timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dedupe_key)
);

CREATE INDEX notification_events_pending_idx
  ON public.notification_events (created_at)
  WHERE routed_at IS NULL;
CREATE INDEX notification_events_company_type_idx
  ON public.notification_events (company_id, event_type, occurred_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_events TO service_role;

CREATE POLICY "service role manages notification events"
  ON public.notification_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Regras corporativas e preferencias pessoais
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_notification_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type        text NOT NULL,
  enabled           boolean NOT NULL DEFAULT true,
  in_app_enabled    boolean NOT NULL DEFAULT true,
  push_enabled      boolean NOT NULL DEFAULT true,
  recipient_policy  jsonb NOT NULL DEFAULT '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb,
  schedule_time     time,
  reminder_minutes  integer CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 10080),
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_type),
  CHECK (
    jsonb_typeof(recipient_policy) = 'object'
    AND jsonb_typeof(COALESCE(recipient_policy->'include_defaults', 'true'::jsonb)) = 'boolean'
    AND jsonb_typeof(COALESCE(recipient_policy->'user_ids', '[]'::jsonb)) = 'array'
    AND jsonb_typeof(COALESCE(recipient_policy->'permission_keys', '[]'::jsonb)) = 'array'
  )
);

CREATE INDEX company_notification_rules_company_idx
  ON public.company_notification_rules (company_id, event_type);

ALTER TABLE public.company_notification_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_notification_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_notification_rules TO authenticated;
GRANT ALL ON public.company_notification_rules TO service_role;

CREATE POLICY "tenant users read notification rules"
  ON public.company_notification_rules FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));

CREATE POLICY "tenant managers create notification rules"
  ON public.company_notification_rules FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND public.can_manage_system((SELECT auth.uid()))
    AND (updated_by IS NULL OR updated_by = (SELECT auth.uid()))
  );

CREATE POLICY "tenant managers update notification rules"
  ON public.company_notification_rules FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND public.can_manage_system((SELECT auth.uid()))
  )
  WITH CHECK (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND public.can_manage_system((SELECT auth.uid()))
    AND (updated_by IS NULL OR updated_by = (SELECT auth.uid()))
  );

CREATE POLICY "tenant managers delete notification rules"
  ON public.company_notification_rules FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND public.can_manage_system((SELECT auth.uid()))
  );

CREATE POLICY "service role manages notification rules"
  ON public.company_notification_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER set_company_notification_rules_updated_at
  BEFORE UPDATE ON public.company_notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- As quatro regras iniciais ficam persistidas, e nao apenas implícitas no
-- roteador/UI. Isso torna a configuracao auditavel e garante o mesmo padrão em
-- empresas atuais e em tenants criados depois desta migration.
CREATE OR REPLACE FUNCTION public.ensure_default_company_notification_rules(_company_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  INSERT INTO public.company_notification_rules (
    company_id, event_type, enabled, in_app_enabled, push_enabled,
    recipient_policy, schedule_time
  )
  SELECT
    _company_id,
    defaults.event_type,
    true,
    true,
    true,
    '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb,
    defaults.schedule_time
  FROM (VALUES
    ('schedule.daily_digest'::text, time '07:00'),
    ('billing.charge_paid'::text, NULL::time),
    ('portal.ticket_created'::text, NULL::time),
    ('form.submission_received'::text, NULL::time)
  ) AS defaults(event_type, schedule_time)
  ON CONFLICT (company_id, event_type) DO NOTHING;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_default_company_notification_rules(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_company_notification_rules(uuid) TO service_role;

SELECT public.ensure_default_company_notification_rules(id)
FROM public.companies;

CREATE OR REPLACE FUNCTION public.seed_default_company_notification_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM public.ensure_default_company_notification_rules(NEW.id);
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.seed_default_company_notification_rules()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_company_notification_rules() TO service_role;

CREATE TRIGGER seed_default_company_notification_rules
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_company_notification_rules();

CREATE TABLE public.user_notification_preferences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  in_app_enabled boolean,
  push_enabled   boolean,
  quiet_start    time,
  quiet_end      time,
  timezone       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, event_type),
  CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
);

CREATE INDEX user_notification_preferences_user_idx
  ON public.user_notification_preferences (user_id, company_id);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_notification_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_preferences TO authenticated;
GRANT ALL ON public.user_notification_preferences TO service_role;

CREATE POLICY "users read own notification preferences"
  ON public.user_notification_preferences FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "users create own notification preferences"
  ON public.user_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "users update own notification preferences"
  ON public.user_notification_preferences FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "users delete own notification preferences"
  ON public.user_notification_preferences FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "service role manages notification preferences"
  ON public.user_notification_preferences FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER set_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Dispositivos e fila de push
-- ---------------------------------------------------------------------------
CREATE TABLE public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE CHECK (endpoint ~ '^https://'),
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  device_label    text CHECK (device_label IS NULL OR char_length(device_label) <= 100),
  active          boolean NOT NULL DEFAULT true,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count   integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_idx
  ON public.push_subscriptions (user_id, company_id, active);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

CREATE POLICY "users read own push devices"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "service role manages push devices"
  ON public.push_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Evolucao compatível da inbox existente
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_notifications
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  ADD COLUMN dedupe_key text,
  ADD COLUMN category text NOT NULL DEFAULT 'general',
  ADD COLUMN priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN entity_type text,
  ADD COLUMN entity_id uuid,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN in_app_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN dismissed_at timestamptz;

-- Recupera o tenant das notificacoes antigas pelo perfil canonico. Linhas
-- globais sem perfil (se existirem) permanecem NULL e seguem own-row.
UPDATE public.user_notifications n
   SET company_id = p.company_id
  FROM public.profiles p
 WHERE p.user_id = n.user_id
   AND p.company_id IS NOT NULL
   AND n.company_id IS NULL;

-- Ponte de compatibilidade para produtores legados (termos, estoque baixo,
-- resposta de orcamento etc.) que ainda inserem apenas user_id. O tenant e
-- sempre derivado do perfil canonico; nunca aceitamos company_id vindo de uma
-- inferencia client-side. Usuario global sem perfil permanece NULL e continua
-- isolado por user_id na policy legada.
CREATE OR REPLACE FUNCTION public.user_notification_fill_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_profile_company uuid;
BEGIN
  SELECT p.company_id
    INTO v_profile_company
    FROM public.profiles p
   WHERE p.user_id = NEW.user_id
   LIMIT 1;

  IF v_profile_company IS NOT NULL THEN
    IF NEW.company_id IS NULL THEN
      NEW.company_id := v_profile_company;
    ELSIF NEW.company_id IS DISTINCT FROM v_profile_company THEN
      RAISE EXCEPTION 'notification_company_mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.company_id IS NOT NULL THEN
    RAISE EXCEPTION 'notification_user_without_company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.user_notification_fill_company_id()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_notification_fill_company_id ON public.user_notifications;
CREATE TRIGGER user_notification_fill_company_id
  BEFORE INSERT ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.user_notification_fill_company_id();

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  ADD CONSTRAINT user_notifications_action_url_safe_check
    CHECK (action_url IS NULL OR (action_url LIKE '/%' AND action_url NOT LIKE '//%')),
  ADD CONSTRAINT user_notifications_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object');

CREATE UNIQUE INDEX user_notifications_event_user_key
  ON public.user_notifications (event_id, user_id)
  WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX user_notifications_tenant_dedupe_key
  ON public.user_notifications (company_id, user_id, dedupe_key)
  WHERE company_id IS NOT NULL AND dedupe_key IS NOT NULL;
CREATE INDEX user_notifications_user_visible_unread_idx
  ON public.user_notifications (user_id, company_id, created_at DESC)
  WHERE in_app_visible AND dismissed_at IS NULL AND read_at IS NULL;

-- Troca UPDATE amplo por RPCs estreitas. Linhas legadas sem company_id continuam
-- visiveis ao proprio user_id, mas nenhum usuario ganha acesso a linha alheia.
DROP POLICY IF EXISTS "users_select_own_notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "users_update_own_notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "users_delete_own_notifications" ON public.user_notifications;

CREATE POLICY "users select own tenant notifications"
  ON public.user_notifications FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      company_id IS NULL
      OR company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.user_notifications FROM anon, authenticated;
GRANT SELECT ON public.user_notifications TO authenticated;

CREATE TABLE public.notification_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'push' CHECK (channel = 'push'),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'sent', 'retry', 'failed', 'cancelled')),
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  provider_status integer,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, subscription_id, channel)
);

CREATE INDEX notification_deliveries_due_idx
  ON public.notification_deliveries (next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

CREATE POLICY "service role manages notification deliveries"
  ON public.notification_deliveries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER set_notification_deliveries_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.cancel_deliveries_for_inactive_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF OLD.active AND NOT NEW.active THEN
    UPDATE public.notification_deliveries
       SET status = 'cancelled', claimed_at = NULL,
           last_error = COALESCE(last_error, 'subscription_inactive')
     WHERE subscription_id = NEW.id
       AND status IN ('pending', 'retry', 'processing');
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_deliveries_for_inactive_subscription()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cancel_deliveries_for_inactive_subscription
  AFTER UPDATE OF active ON public.push_subscriptions
  FOR EACH ROW
  WHEN (OLD.active AND NOT NEW.active)
  EXECUTE FUNCTION public.cancel_deliveries_for_inactive_subscription();

-- ---------------------------------------------------------------------------
-- 5. RPCs estreitas da inbox
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_user_notification_read(_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.user_notifications n
     SET read_at = COALESCE(n.read_at, now())
   WHERE n.id = _notification_id
     AND n.user_id = auth.uid()
     AND n.dismissed_at IS NULL
     AND (n.company_id IS NULL OR n.company_id = public.get_user_company_id(auth.uid()));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mark_all_user_notifications_read(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF _company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
    RAISE EXCEPTION 'notification_company_forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND company_id = _company_id
     AND read_at IS NULL
     AND dismissed_at IS NULL
     AND in_app_visible;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dismiss_user_notification(_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.user_notifications n
     SET dismissed_at = COALESCE(n.dismissed_at, now()),
         read_at = COALESCE(n.read_at, now())
   WHERE n.id = _notification_id
     AND n.user_id = auth.uid()
     AND (n.company_id IS NULL OR n.company_id = public.get_user_company_id(auth.uid()));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.count_unread_user_notifications(_company_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE
    WHEN _company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN 0::bigint
    ELSE (
      SELECT count(*)
      FROM public.user_notifications n
      WHERE n.user_id = auth.uid()
        AND n.company_id = _company_id
        AND n.read_at IS NULL
        AND n.dismissed_at IS NULL
        AND n.in_app_visible
    )
  END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_user_notification_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_user_notifications_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_user_notification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_unread_user_notifications(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_user_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_user_notifications_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_user_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_unread_user_notifications(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Horario silencioso e roteamento server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_next_allowed_at(
  _company_id uuid,
  _user_id uuid,
  _event_type text,
  _now timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_start time;
  v_end time;
  v_timezone text;
  v_local timestamp;
  v_target timestamp;
BEGIN
  SELECT p.quiet_start, p.quiet_end,
         CASE
           WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = p.timezone) THEN p.timezone
           WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = cs.timezone) THEN cs.timezone
           ELSE 'UTC'
         END
    INTO v_start, v_end, v_timezone
    FROM public.user_notification_preferences p
    LEFT JOIN public.company_settings cs ON cs.company_id = p.company_id
   WHERE p.company_id = _company_id
     AND p.user_id = _user_id
     AND p.event_type IN (_event_type, '*')
   ORDER BY (p.event_type = _event_type) DESC
   LIMIT 1;

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN _now;
  END IF;

  v_local := _now AT TIME ZONE v_timezone;
  IF v_start < v_end AND v_local::time >= v_start AND v_local::time < v_end THEN
    v_target := v_local::date + v_end;
  ELSIF v_start > v_end AND (v_local::time >= v_start OR v_local::time < v_end) THEN
    v_target := CASE
      WHEN v_local::time >= v_start THEN (v_local::date + 1) + v_end
      ELSE v_local::date + v_end
    END;
  ELSE
    RETURN _now;
  END IF;
  RETURN v_target AT TIME ZONE v_timezone;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notification_next_allowed_at(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_next_allowed_at(uuid, uuid, text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.route_notification_event(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_event public.notification_events%ROWTYPE;
  v_rule public.company_notification_rules%ROWTYPE;
  v_has_rule boolean := false;
  v_policy jsonb := '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb;
  v_in_app boolean := true;
  v_push boolean := true;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_event
  FROM public.notification_events
  WHERE id = _event_id
  FOR UPDATE;

  IF NOT FOUND OR v_event.routed_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_rule
  FROM public.company_notification_rules
  WHERE company_id = v_event.company_id
    AND event_type = v_event.event_type;
  v_has_rule := FOUND;

  IF v_has_rule AND NOT v_rule.enabled THEN
    UPDATE public.notification_events SET routed_at = now(), last_error = NULL WHERE id = _event_id;
    RETURN 0;
  END IF;

  IF v_has_rule THEN
    v_policy := v_rule.recipient_policy;
    v_in_app := v_rule.in_app_enabled;
    v_push := v_rule.push_enabled;
  END IF;

  -- O digest ja chega com UM destinatario resolvido e uma fotografia propria
  -- (ou da equipe) por usuario. Reaplicar user_ids/permissoes aqui copiaria o
  -- digest de cada tecnico para todos os gestores, gerando N duplicatas.
  IF v_event.event_type = 'schedule.daily_digest' THEN
    v_policy := '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb;
  END IF;

  WITH candidate_ids AS (
    SELECT unnest(v_event.recipient_user_ids) AS user_id
    WHERE COALESCE((v_policy->>'include_defaults')::boolean, true)
    UNION
    SELECT value::uuid
    FROM jsonb_array_elements_text(COALESCE(v_policy->'user_ids', '[]'::jsonb)) AS selected(value)
    WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    UNION
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.company_id = v_event.company_id
      AND p.is_active
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(v_policy->'permission_keys', '[]'::jsonb)) AS permission(value)
        WHERE public.user_has_permission(p.user_id, permission.value)
      )
  ), recipients AS (
    SELECT DISTINCT p.user_id,
      COALESCE(pref.in_app_enabled, v_in_app) AS wants_in_app,
      COALESCE(pref.push_enabled, v_push) AS wants_push
    FROM candidate_ids c
    JOIN public.profiles p
      ON p.user_id = c.user_id
     AND p.company_id = v_event.company_id
     AND p.is_active
    LEFT JOIN LATERAL (
      SELECT up.in_app_enabled, up.push_enabled
      FROM public.user_notification_preferences up
      WHERE up.company_id = v_event.company_id
        AND up.user_id = p.user_id
        AND up.event_type IN (v_event.event_type, '*')
      ORDER BY (up.event_type = v_event.event_type) DESC
      LIMIT 1
    ) pref ON true
  ), inserted AS (
    INSERT INTO public.user_notifications (
      user_id, company_id, event_id, dedupe_key, type, title, message,
      action_url, icon, category, priority, entity_type, entity_id,
      metadata, in_app_visible, expires_at
    )
    SELECT
      r.user_id, v_event.company_id, v_event.id, v_event.dedupe_key,
      v_event.event_type, v_event.title, v_event.message, v_event.action_url,
      v_event.icon, v_event.category, v_event.priority, v_event.source_type,
      v_event.source_id, v_event.payload, r.wants_in_app,
      now() + interval '90 days'
    FROM recipients r
    WHERE r.wants_in_app OR r.wants_push
    ON CONFLICT (event_id, user_id) WHERE event_id IS NOT NULL DO NOTHING
    RETURNING id, user_id
  )
  INSERT INTO public.notification_deliveries (
    notification_id, subscription_id, next_attempt_at
  )
  SELECT n.id, s.id,
         public.notification_next_allowed_at(v_event.company_id, n.user_id, v_event.event_type, now())
  FROM public.user_notifications n
  JOIN recipients r ON r.user_id = n.user_id AND r.wants_push
  JOIN public.push_subscriptions s
    ON s.user_id = n.user_id
   AND s.company_id = v_event.company_id
   AND s.active
  WHERE n.event_id = v_event.id
  ON CONFLICT (notification_id, subscription_id, channel) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.notification_events SET routed_at = now(), last_error = NULL WHERE id = _event_id;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.route_notification_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_notification_event(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.route_notification_event_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  BEGIN
    PERFORM public.route_notification_event(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.notification_events
       SET last_error = left(SQLERRM, 1000)
     WHERE id = NEW.id;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.route_notification_event_after_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_notification_event_after_insert() TO service_role;

CREATE TRIGGER route_notification_event_after_insert
  AFTER INSERT ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.route_notification_event_after_insert();

-- ---------------------------------------------------------------------------
-- 7. Claim/ack atomico do worker Web Push
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(
  p_limit integer DEFAULT 50,
  p_orphan_minutes integer DEFAULT 10
)
RETURNS TABLE (
  delivery_id uuid,
  subscription_id uuid,
  notification_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  notification_type text,
  title text,
  message text,
  action_url text,
  category text,
  priority text,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  UPDATE public.notification_deliveries d
     SET status = 'retry', claimed_at = NULL,
         next_attempt_at = now(), last_error = 'processing_timeout'
   WHERE d.status = 'processing'
     AND d.claimed_at < now() - make_interval(mins => greatest(p_orphan_minutes, 1));

  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM public.notification_deliveries d
    JOIN public.push_subscriptions s ON s.id = d.subscription_id AND s.active
    WHERE d.status IN ('pending', 'retry')
      AND d.next_attempt_at <= now()
      AND d.attempts < 5
    ORDER BY d.next_attempt_at, d.created_at
    LIMIT least(greatest(p_limit, 1), 200)
    FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.notification_deliveries d
       SET status = 'processing', claimed_at = now(), attempts = d.attempts + 1
      FROM candidates c
     WHERE d.id = c.id
    RETURNING d.id, d.subscription_id, d.notification_id, d.attempts
  )
  SELECT c.id, c.subscription_id, c.notification_id,
         s.endpoint, s.p256dh, s.auth,
         n.type, n.title, n.message, n.action_url, n.category, n.priority,
         c.attempts
  FROM claimed c
  JOIN public.push_subscriptions s ON s.id = c.subscription_id
  JOIN public.user_notifications n ON n.id = c.notification_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_notification_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_provider_status integer DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_delivery public.notification_deliveries%ROWTYPE;
  v_terminal boolean;
BEGIN
  SELECT * INTO v_delivery
  FROM public.notification_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND OR v_delivery.status <> 'processing' THEN
    RETURN false;
  END IF;

  v_terminal := p_provider_status IN (400, 401, 403, 404, 410)
                OR p_retry_after_seconds <= 0
                OR v_delivery.attempts >= 5;

  IF p_success THEN
    UPDATE public.notification_deliveries
       SET status = 'sent', sent_at = now(), claimed_at = NULL,
           provider_status = p_provider_status, last_error = NULL
     WHERE id = p_delivery_id;
    UPDATE public.push_subscriptions
       SET last_success_at = now(), failure_count = 0, active = true
     WHERE id = v_delivery.subscription_id;
  ELSE
    UPDATE public.notification_deliveries
       SET status = CASE WHEN v_terminal THEN 'failed' ELSE 'retry' END,
           claimed_at = NULL,
           provider_status = p_provider_status,
           last_error = left(COALESCE(p_error, 'push_delivery_failed'), 1000),
           next_attempt_at = CASE WHEN v_terminal THEN next_attempt_at
                                  ELSE now() + make_interval(secs => greatest(p_retry_after_seconds, 10)) END
     WHERE id = p_delivery_id;
    UPDATE public.push_subscriptions
       SET last_failure_at = now(), failure_count = failure_count + 1,
           active = CASE WHEN p_provider_status IN (404, 410) THEN false ELSE active END
     WHERE id = v_delivery.subscription_id;
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_notification_delivery(uuid, boolean, integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_notification_delivery(uuid, boolean, integer, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Produtores iniciais de eventos
-- ---------------------------------------------------------------------------

-- Chamado do portal: substitui o fan-out direto antigo por um unico evento.
CREATE OR REPLACE FUNCTION public.notify_portal_ticket_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_customer_name text;
  v_summary text;
BEGIN
  IF COALESCE(NEW.origin, '') <> 'portal' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(c.name), '')
    INTO v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id
    AND c.company_id = NEW.company_id;

  v_summary := NULLIF(btrim(COALESCE(NEW.task_title, NEW.description, '')), '');

  INSERT INTO public.notification_events (
    company_id, event_type, source_type, source_id, dedupe_key,
    recipient_user_ids, title, message, action_url, icon, category, priority,
    payload
  )
  SELECT
    NEW.company_id, 'portal.ticket_created', 'service_order', NEW.id,
    'portal.ticket_created:' || NEW.id::text,
    COALESCE(array_agg(p.user_id) FILTER (WHERE p.user_id IS NOT NULL), ARRAY[]::uuid[]),
    'Novo chamado #' || NEW.order_number::text,
    left(
      'Chamado #' || NEW.order_number::text || ' aberto'
      || CASE WHEN v_customer_name IS NOT NULL THEN ' por ' || v_customer_name ELSE ' pelo portal do cliente' END
      || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END,
      500
    ),
    '/ordens-servico?aba=chamados&os=' || NEW.id::text,
    'wrench', 'service_orders', 'high',
    jsonb_build_object(
      'order_number', NEW.order_number,
      'customer_name', v_customer_name,
      'summary', v_summary
    )
  FROM public.profiles p
  WHERE p.company_id = NEW.company_id
    AND p.is_active
    AND public.user_has_permission(p.user_id, 'screen:service_orders')
  ON CONFLICT (company_id, dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$fn$;

-- Pagamento: somente depois da fonte canonica persistir payment_date.
CREATE OR REPLACE FUNCTION public.emit_charge_paid_notification_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_recipients uuid[];
  v_customer_name text;
  v_amount_label text;
BEGIN
  IF OLD.payment_date IS NOT NULL OR NEW.payment_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(c.name), '')
    INTO v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id
    AND c.company_id = NEW.company_id;

  v_amount_label := 'R$ ' || translate(
    to_char(NEW.value, 'FM999,999,999,990.00'),
    ',.',
    '.,'
  );

  SELECT COALESCE(array_agg(DISTINCT recipient), ARRAY[]::uuid[])
    INTO v_recipients
  FROM (
    SELECT NEW.created_by AS recipient
    WHERE NEW.created_by IS NOT NULL
    UNION
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.company_id = NEW.company_id
      AND p.is_active
      AND (
        public.user_has_permission(p.user_id, 'fn:manage_finance')
        OR public.user_has_permission(p.user_id, 'screen:finance')
      )
  ) recipients;

  INSERT INTO public.notification_events (
    company_id, event_type, source_type, source_id, dedupe_key,
    recipient_user_ids, title, message, action_url, icon, category, priority,
    payload
  ) VALUES (
    NEW.company_id, 'billing.charge_paid', 'tenant_charge', NEW.id,
    'billing.charge_paid:' || NEW.id::text,
    v_recipients,
    'Pagamento recebido',
    left(
      'Pagamento de ' || v_amount_label || ' recebido'
      || CASE WHEN v_customer_name IS NOT NULL THEN ' de ' || v_customer_name ELSE '' END
      || '.',
      500
    ),
    '/financeiro/cobrancas?charge=' || NEW.id::text,
    'circle-dollar-sign', 'finance', 'high',
    jsonb_build_object(
      'amount', NEW.value,
      'customer_name', v_customer_name
    )
  )
  ON CONFLICT (company_id, dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS emit_charge_paid_notification_event ON public.tenant_charges;
CREATE TRIGGER emit_charge_paid_notification_event
  AFTER UPDATE OF payment_date ON public.tenant_charges
  FOR EACH ROW
  WHEN (OLD.payment_date IS NULL AND NEW.payment_date IS NOT NULL)
  EXECUTE FUNCTION public.emit_charge_paid_notification_event();

-- Formulario: link publico e portal convergem na mesma tabela.
CREATE OR REPLACE FUNCTION public.emit_form_submission_notification_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_owner uuid;
  v_form_title text;
  v_customer_name text;
BEGIN
  SELECT f.created_by, NULLIF(btrim(f.title), '')
    INTO v_owner, v_form_title
  FROM public.lead_capture_forms f
  WHERE f.id = NEW.form_id
    AND f.company_id = NEW.company_id;

  SELECT NULLIF(btrim(c.name), '')
    INTO v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id
    AND c.company_id = NEW.company_id;

  v_customer_name := COALESCE(
    v_customer_name,
    NULLIF(btrim(NEW.fields->>'company_name'), ''),
    NULLIF(btrim(NEW.fields->>'nome_fantasia'), ''),
    NULLIF(btrim(NEW.fields->>'name'), '')
  );

  INSERT INTO public.notification_events (
    company_id, event_type, source_type, source_id, dedupe_key,
    recipient_user_ids, title, message, action_url, icon, category, priority,
    payload
  ) VALUES (
    NEW.company_id, 'form.submission_received', 'public_form_submission', NEW.id,
    'form.submission_received:' || NEW.id::text,
    CASE WHEN v_owner IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[v_owner] END,
    'Formulário recebido',
    left(
      'Nova resposta'
      || CASE WHEN v_form_title IS NOT NULL THEN ' em "' || v_form_title || '"' ELSE ' de formulário' END
      || CASE WHEN v_customer_name IS NOT NULL THEN ', enviada por ' || v_customer_name ELSE '' END
      || '.',
      500
    ),
    '/clientes?leadForms=1&form=' || NEW.form_id::text || '&submission=' || NEW.id::text,
    'clipboard-check', 'forms', 'normal',
    jsonb_build_object(
      'form_id', NEW.form_id,
      'form_title', v_form_title,
      'customer_name', v_customer_name,
      'source', NEW.source
    )
  )
  ON CONFLICT (company_id, dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS emit_form_submission_notification_event ON public.public_form_submissions;
CREATE TRIGGER emit_form_submission_notification_event
  AFTER INSERT ON public.public_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.emit_form_submission_notification_event();

-- Resumo da agenda: fotografia perto do horario configurado, no dia civil do
-- tenant. Jornadas multi-dia usam schedule_plan; legado usa scheduled_date.
CREATE OR REPLACE FUNCTION public.enqueue_schedule_daily_digests(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  WITH company_clock AS (
    SELECT c.id AS company_id,
           CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = cs.timezone)
                THEN cs.timezone ELSE 'UTC' END AS timezone,
           COALESCE(r.schedule_time, time '07:00') AS digest_time,
           COALESCE(
             r.recipient_policy,
             '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb
           ) AS recipient_policy
    FROM public.companies c
    LEFT JOIN public.company_settings cs ON cs.company_id = c.id
    LEFT JOIN public.company_notification_rules r
      ON r.company_id = c.id AND r.event_type = 'schedule.daily_digest'
    WHERE COALESCE(r.enabled, true)
  ), due_companies AS (
    SELECT cc.*, (_now AT TIME ZONE cc.timezone)::date AS local_date
    FROM company_clock cc
    WHERE (_now AT TIME ZONE cc.timezone) >=
            date_trunc('day', _now AT TIME ZONE cc.timezone) + cc.digest_time
      AND (_now AT TIME ZONE cc.timezone) <
            date_trunc('day', _now AT TIME ZONE cc.timezone) + cc.digest_time + interval '5 minutes'
  ), agenda_items AS (
    SELECT so.id, so.company_id, so.technician_id, so.team_id
    FROM public.service_orders so
    JOIN due_companies dc ON dc.company_id = so.company_id
    WHERE COALESCE(so.show_in_schedule, true)
      AND so.status::text NOT IN ('cancelada', 'cancelled')
      AND (
        so.scheduled_date = dc.local_date
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(so.schedule_plan, '[]'::jsonb)) slot
          WHERE slot->>'date' = dc.local_date::text
        )
      )
  ), assignments AS (
    SELECT ai.id, ai.company_id, ai.technician_id AS user_id FROM agenda_items ai
    WHERE ai.technician_id IS NOT NULL
    UNION
    SELECT ai.id, ai.company_id, soa.user_id
    FROM agenda_items ai
    JOIN public.service_order_assignees soa ON soa.service_order_id = ai.id
    UNION
    SELECT ai.id, ai.company_id, tm.user_id
    FROM agenda_items ai
    JOIN public.team_members tm ON tm.team_id = ai.team_id
    WHERE ai.team_id IS NOT NULL
  ), per_user AS (
    SELECT a.company_id, a.user_id, count(DISTINCT a.id)::integer AS item_count,
           dc.local_date, false AS team_scope
    FROM assignments a
    JOIN due_companies dc ON dc.company_id = a.company_id
    JOIN public.profiles p
      ON p.user_id = a.user_id AND p.company_id = a.company_id AND p.is_active
    WHERE COALESCE((dc.recipient_policy->>'include_defaults')::boolean, true)
      AND public.user_has_permission(a.user_id, 'screen:schedule')
    GROUP BY a.company_id, a.user_id, dc.local_date
  ), team_viewers AS (
    SELECT dc.company_id, p.user_id, count(DISTINCT ai.id)::integer AS item_count,
           dc.local_date, true AS team_scope
    FROM due_companies dc
    JOIN public.profiles p ON p.company_id = dc.company_id AND p.is_active
    JOIN agenda_items ai ON ai.company_id = dc.company_id
    WHERE (
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(dc.recipient_policy->'user_ids', '[]'::jsonb)) selected(value)
        WHERE selected.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND selected.value::uuid = p.user_id
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(dc.recipient_policy->'permission_keys', '[]'::jsonb)) permission(value)
        WHERE public.user_has_permission(p.user_id, permission.value)
      )
    )
    GROUP BY dc.company_id, p.user_id, dc.local_date
  ), recipients AS (
    SELECT r.company_id, r.user_id, r.local_date,
           max(r.item_count)::integer AS item_count,
           bool_or(r.team_scope) AS team_scope
    FROM (
      SELECT * FROM per_user
      UNION ALL
      SELECT * FROM team_viewers
    ) r
    GROUP BY r.company_id, r.user_id, r.local_date
  ), inserted AS (
    INSERT INTO public.notification_events (
      company_id, event_type, source_type, dedupe_key, recipient_user_ids,
      title, message, action_url, icon, category, priority, payload
    )
    SELECT pu.company_id, 'schedule.daily_digest', 'schedule',
           'schedule.daily_digest:' || pu.user_id::text || ':' || pu.local_date::text,
           ARRAY[pu.user_id],
           'Compromissos de hoje',
           CASE
             WHEN pu.team_scope AND pu.item_count = 1 THEN 'Sua equipe tem 1 compromisso hoje.'
             WHEN pu.team_scope THEN 'Sua equipe tem ' || pu.item_count::text || ' compromissos hoje.'
             WHEN pu.item_count = 1 THEN 'Você tem 1 compromisso hoje.'
             ELSE 'Você tem ' || pu.item_count::text || ' compromissos hoje.'
           END,
           '/agenda?date=' || pu.local_date::text,
           'calendar-days', 'schedule', 'normal',
           jsonb_build_object(
             'local_date', pu.local_date,
             'item_count', pu.item_count,
             'scope', CASE WHEN pu.team_scope THEN 'team' ELSE 'own' END
           )
    FROM recipients pu
    ON CONFLICT (company_id, dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM inserted;
  RETURN COALESCE(v_count, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_schedule_daily_digests(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_schedule_daily_digests(timestamptz) TO service_role;

-- Permissoes dos triggers: nunca executaveis por clientes.
REVOKE ALL ON FUNCTION public.notify_portal_ticket_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_charge_paid_notification_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_form_submission_notification_event() FROM PUBLIC, anon, authenticated;

-- Reprocessamento seguro de eventos cujo roteamento falhou transitoriamente.
CREATE OR REPLACE FUNCTION public.retry_pending_notification_events(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.notification_events
    WHERE routed_at IS NULL
    ORDER BY created_at
    LIMIT least(greatest(p_limit, 1), 500)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.route_notification_event(v_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.notification_events SET last_error = left(SQLERRM, 1000) WHERE id = v_id;
    END;
  END LOOP;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.retry_pending_notification_events(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_pending_notification_events(integer) TO service_role;

-- Crons internos: agenda e recuperacao do roteador. O worker HTTP de push e
-- agendado logo abaixo com URL e credencial lidas do Vault.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('notification-schedule-daily-digests')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-schedule-daily-digests');
    PERFORM cron.unschedule('notification-retry-pending-events')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-retry-pending-events');

    PERFORM cron.schedule(
      'notification-schedule-daily-digests',
      '*/5 * * * *',
      'SELECT public.enqueue_schedule_daily_digests();'
    );
    PERFORM cron.schedule(
      'notification-retry-pending-events',
      '* * * * *',
      'SELECT public.retry_pending_notification_events(100);'
    );
  END IF;
END;
$block$;

-- Desperta o worker de Web Push. A URL-base e o token ficam no Vault; se o
-- ambiente ainda nao estiver configurado, a migration segue e registra NOTICE.
DO $block$
DECLARE
  v_base_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.unschedule('notification-push-worker-every-minute')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-push-worker-every-minute');

  SELECT rtrim(decrypted_secret, '/')
    INTO v_base_url
    FROM vault.decrypted_secrets
   WHERE name = 'SUPABASE_FUNCTIONS_BASE_URL'
   LIMIT 1;

  IF COALESCE(v_base_url, '') = '' THEN
    RAISE NOTICE 'Worker de push nao agendado: SUPABASE_FUNCTIONS_BASE_URL ausente no Vault.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'notification-push-worker-every-minute',
    '* * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret
               FROM vault.decrypted_secrets
              WHERE name = 'CRON_SECRET'
              LIMIT 1),
            ''
          )
        ),
        body := '{"reason":"recovery_cron"}'::jsonb
      );
      $cron$,
      v_base_url || '/functions/v1/process-notification-deliveries'
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Nao foi possivel agendar o worker de push: %', SQLERRM;
END;
$block$;

COMMENT ON TABLE public.notification_events IS
  'Outbox canonico de notificacoes internas. Escrita server-side, deduplicada por tenant.';
COMMENT ON TABLE public.company_notification_rules IS
  'Regras corporativas por evento: canais, horario e politica de destinatarios.';
COMMENT ON TABLE public.user_notification_preferences IS
  'Preferencias pessoais por tenant/evento; nunca ampliam acesso nem destinatarios.';
COMMENT ON TABLE public.push_subscriptions IS
  'Assinaturas Web Push por usuario/dispositivo. Chaves VAPID privadas nunca ficam aqui.';
COMMENT ON TABLE public.notification_deliveries IS
  'Fila idempotente de entrega Web Push, com claim SKIP LOCKED, retry e auditoria.';

COMMIT;
