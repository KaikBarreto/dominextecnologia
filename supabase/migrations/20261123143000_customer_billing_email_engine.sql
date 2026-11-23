-- Motor central de emails transacionais para cobrancas dos clientes finais.
--
-- Invariantes:
--   * opt-in por empresa (migration nao dispara emails retroativos);
--   * o estado persistido de tenant_charges e a fonte canonica dos eventos;
--   * uma entrega por evento/cobranca, mesmo com webhooks Asaas equivalentes;
--   * fila, retry, auditoria e franquia sao persistentes e multi-tenant;
--   * escrita da fila e uso mensal ficam restritos ao service_role.

BEGIN;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_customer_email_limit integer NOT NULL DEFAULT 0
  CHECK (monthly_customer_email_limit >= 0);

COMMENT ON COLUMN public.subscription_plans.monthly_customer_email_limit IS
  'Franquia mensal de emails transacionais enviados aos clientes finais. Zero desabilita consumo sem override.';

UPDATE public.subscription_plans
   SET monthly_customer_email_limit = CASE
     WHEN code IN ('start', 'retail_start') THEN 100
     WHEN code IN ('avancado', 'retail_avancado', 'personalizado') THEN 500
     WHEN code IN ('master', 'retail_master') THEN 1500
     ELSE monthly_customer_email_limit
   END;

CREATE TABLE public.customer_email_settings (
  company_id                  uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled                     boolean NOT NULL DEFAULT false,
  charge_created_enabled      boolean NOT NULL DEFAULT true,
  due_reminder_enabled        boolean NOT NULL DEFAULT true,
  charge_overdue_enabled      boolean NOT NULL DEFAULT true,
  charge_paid_enabled         boolean NOT NULL DEFAULT true,
  charge_refunded_enabled     boolean NOT NULL DEFAULT true,
  reminder_days_before        integer[] NOT NULL DEFAULT ARRAY[3]::integer[],
  sender_name                 text CHECK (sender_name IS NULL OR char_length(btrim(sender_name)) BETWEEN 1 AND 80),
  reply_to_email              text CHECK (
    reply_to_email IS NULL OR (
      char_length(reply_to_email) <= 254
      AND reply_to_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
    )
  ),
  monthly_limit_override      integer CHECK (monthly_limit_override IS NULL OR monthly_limit_override >= 0),
  updated_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (
    cardinality(reminder_days_before) BETWEEN 1 AND 5
    AND 0 <= ALL(reminder_days_before)
    AND 30 >= ALL(reminder_days_before)
  )
);

CREATE TABLE public.customer_email_deliveries (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id                 uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  charge_id                   uuid NOT NULL REFERENCES public.tenant_charges(id) ON DELETE CASCADE,
  event_type                  text NOT NULL CHECK (event_type IN (
    'charge_created', 'charge_due_reminder', 'charge_overdue', 'charge_paid', 'charge_refunded'
  )),
  recipient_email             text NOT NULL CHECK (char_length(recipient_email) <= 254),
  dedupe_key                  text NOT NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'retry', 'sent', 'failed', 'cancelled', 'skipped_quota'
  )),
  attempts                    integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at             timestamptz NOT NULL DEFAULT now(),
  locked_at                   timestamptz,
  provider_message_id         text,
  provider_status             integer,
  last_error_code             text,
  sent_at                     timestamptz,
  period_month                date,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dedupe_key)
);

CREATE INDEX customer_email_deliveries_pending_idx
  ON public.customer_email_deliveries (next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX customer_email_deliveries_company_idx
  ON public.customer_email_deliveries (company_id, created_at DESC);
CREATE INDEX customer_email_deliveries_charge_idx
  ON public.customer_email_deliveries (charge_id, event_type);

CREATE TABLE public.customer_email_monthly_usage (
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_month                date NOT NULL,
  accepted_count              integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period_month),
  CHECK (period_month = date_trunc('month', period_month)::date)
);

CREATE TRIGGER set_customer_email_settings_updated_at
  BEFORE UPDATE ON public.customer_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_customer_email_deliveries_updated_at
  BEFORE UPDATE ON public.customer_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_customer_email_monthly_usage_updated_at
  BEFORE UPDATE ON public.customer_email_monthly_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_email_monthly_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_email_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_email_deliveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_email_monthly_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_email_settings, public.customer_email_deliveries,
  public.customer_email_monthly_usage TO service_role;
CREATE POLICY service_role_manages_customer_email_settings
  ON public.customer_email_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_manages_customer_email_deliveries
  ON public.customer_email_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_manages_customer_email_usage
  ON public.customer_email_monthly_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.customer_email_settings (company_id, sender_name, reply_to_email)
SELECT c.id, left(NULLIF(btrim(c.name), ''), 80),
       CASE
         WHEN COALESCE(NULLIF(btrim(c.billing_email), ''), NULLIF(btrim(c.email), '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
           THEN lower(COALESCE(NULLIF(btrim(c.billing_email), ''), NULLIF(btrim(c.email), '')))
         ELSE NULL
       END
  FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_customer_email_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  INSERT INTO public.customer_email_settings (company_id, sender_name, reply_to_email)
  VALUES (
    NEW.id,
    left(NULLIF(btrim(NEW.name), ''), 80),
    CASE
      WHEN COALESCE(NULLIF(btrim(NEW.billing_email), ''), NULLIF(btrim(NEW.email), '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN lower(COALESCE(NULLIF(btrim(NEW.billing_email), ''), NULLIF(btrim(NEW.email), '')))
      ELSE NULL
    END
  ) ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.seed_customer_email_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_customer_email_settings() TO service_role;
CREATE TRIGGER seed_customer_email_settings_after_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_customer_email_settings();

CREATE OR REPLACE FUNCTION public.customer_email_effective_monthly_limit(p_company_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT greatest(COALESCE(s.monthly_limit_override, p.monthly_customer_email_limit, 0), 0)
    FROM public.customer_email_settings s
    JOIN public.companies c ON c.id = s.company_id
    LEFT JOIN public.subscription_plans p ON p.code = COALESCE(NULLIF(c.subscription_plan, ''), 'start')
   WHERE s.company_id = p_company_id;
$fn$;

REVOKE ALL ON FUNCTION public.customer_email_effective_monthly_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_email_effective_monthly_limit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.update_customer_email_settings(
  p_enabled boolean,
  p_charge_created_enabled boolean,
  p_due_reminder_enabled boolean,
  p_charge_overdue_enabled boolean,
  p_charge_paid_enabled boolean,
  p_charge_refunded_enabled boolean,
  p_reminder_days_before integer[],
  p_sender_name text,
  p_reply_to_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_monthly_limit integer;
BEGIN
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_user_id IS NULL
     OR v_company_id IS NULL
     OR public.can_manage_system(v_user_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Você não tem permissão para alterar as notificações de cobrança.',
      DETAIL = 'code=customer_email_settings_permission_denied';
  END IF;

  IF p_enabled
     AND public.company_has_module(v_company_id, 'cobrancas') IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'O módulo Cobranças é necessário para ativar estes avisos.',
      DETAIL = 'code=customer_email_billing_module_required';
  END IF;

  -- Garante a linha sem expor INSERT/UPDATE da tabela ao cliente. O override
  -- de franquia continua sendo uma capacidade exclusiva do service_role.
  INSERT INTO public.customer_email_settings (company_id, sender_name, reply_to_email)
  SELECT c.id,
         left(NULLIF(btrim(c.name), ''), 80),
         CASE
           WHEN COALESCE(NULLIF(btrim(c.billing_email), ''), NULLIF(btrim(c.email), ''))
             ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
             THEN lower(COALESCE(NULLIF(btrim(c.billing_email), ''), NULLIF(btrim(c.email), '')))
           ELSE NULL
         END
    FROM public.companies c
   WHERE c.id = v_company_id
  ON CONFLICT (company_id) DO NOTHING;

  v_monthly_limit := public.customer_email_effective_monthly_limit(v_company_id);
  IF p_enabled AND COALESCE(v_monthly_limit, 0) <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Seu plano não possui franquia de e-mails disponível.',
      DETAIL = 'code=customer_email_monthly_quota_unavailable';
  END IF;

  UPDATE public.customer_email_settings
     SET enabled = p_enabled,
         charge_created_enabled = p_charge_created_enabled,
         due_reminder_enabled = p_due_reminder_enabled,
         charge_overdue_enabled = p_charge_overdue_enabled,
         charge_paid_enabled = p_charge_paid_enabled,
         charge_refunded_enabled = p_charge_refunded_enabled,
         reminder_days_before = p_reminder_days_before,
         sender_name = left(NULLIF(btrim(p_sender_name), ''), 80),
         reply_to_email = lower(NULLIF(btrim(p_reply_to_email), '')),
         updated_by = v_user_id
   WHERE company_id = v_company_id;

  -- Desligar e religar o motor nao pode ressuscitar avisos antigos. Entregas ja
  -- aceitas pelo provedor permanecem auditaveis; somente a fila ainda nao enviada
  -- e cancelada. O Asaas nao e reativado automaticamente por esta operacao.
  IF NOT p_enabled THEN
    UPDATE public.customer_email_deliveries
       SET status = 'cancelled', locked_at = NULL,
           last_error_code = 'customer_email_engine_disabled'
     WHERE company_id = v_company_id
       AND status IN ('pending', 'retry');
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_customer_email_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer[], text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_customer_email_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer[], text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_email_settings_summary()
RETURNS TABLE (
  company_id uuid,
  enabled boolean,
  charge_created_enabled boolean,
  due_reminder_enabled boolean,
  charge_overdue_enabled boolean,
  charge_paid_enabled boolean,
  charge_refunded_enabled boolean,
  reminder_days_before integer[],
  sender_name text,
  reply_to_email text,
  monthly_limit integer,
  monthly_used integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.get_user_company_id((SELECT auth.uid()));
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.company_id, s.enabled, s.charge_created_enabled,
         s.due_reminder_enabled, s.charge_overdue_enabled,
         s.charge_paid_enabled, s.charge_refunded_enabled,
         s.reminder_days_before, s.sender_name, s.reply_to_email,
         public.customer_email_effective_monthly_limit(s.company_id),
         COALESCE(u.accepted_count, 0)
    FROM public.customer_email_settings s
    LEFT JOIN public.customer_email_monthly_usage u
      ON u.company_id = s.company_id
     AND u.period_month = date_trunc('month', public.company_today(s.company_id))::date
   WHERE s.company_id = v_company_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_customer_email_settings_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_email_settings_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_customer_billing_email(
  p_charge_id uuid,
  p_event_type text,
  p_dedupe_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_event_type NOT IN (
    'charge_created', 'charge_due_reminder', 'charge_overdue', 'charge_paid', 'charge_refunded'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.customer_email_deliveries (
    company_id, customer_id, charge_id, event_type, recipient_email, dedupe_key
  )
  SELECT tc.company_id, tc.customer_id, tc.id, p_event_type,
         lower(btrim(c.email)), p_dedupe_key
    FROM public.tenant_charges tc
    JOIN public.customers c
      ON c.id = tc.customer_id AND c.company_id = tc.company_id
    JOIN public.customer_email_settings s ON s.company_id = tc.company_id
   WHERE tc.id = p_charge_id
     AND public.company_has_module(tc.company_id, 'cobrancas') IS TRUE
     AND s.enabled
     AND CASE p_event_type
       WHEN 'charge_created' THEN s.charge_created_enabled
       WHEN 'charge_due_reminder' THEN s.due_reminder_enabled
       WHEN 'charge_overdue' THEN s.charge_overdue_enabled
       WHEN 'charge_paid' THEN s.charge_paid_enabled
       WHEN 'charge_refunded' THEN s.charge_refunded_enabled
       ELSE false
     END
     AND NULLIF(btrim(c.email), '') IS NOT NULL
     AND char_length(btrim(c.email)) <= 254
     AND btrim(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ON CONFLICT (company_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_customer_billing_email(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_billing_email(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.emit_customer_billing_email_from_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_old_status text;
  v_old_payment_id text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_old_payment_id := OLD.asaas_payment_id;
  END IF;

  IF NEW.asaas_payment_id IS NOT NULL
     AND NEW.status <> 'PENDING_CREATION'
     AND (TG_OP = 'INSERT' OR v_old_payment_id IS NULL) THEN
    PERFORM public.enqueue_customer_billing_email(
      NEW.id, 'charge_created', 'charge_created:' || NEW.id::text
    );
  END IF;

  -- payment_date e a fonte canonica da baixa; o status pode chegar antes,
  -- permanecer igual em reentregas ou variar conforme o meio de pagamento.
  IF NEW.payment_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.payment_date IS NULL) THEN
    PERFORM public.enqueue_customer_billing_email(
      NEW.id, 'charge_paid', 'charge_paid:' || NEW.id::text
    );
  END IF;

  IF NEW.status = 'OVERDUE' AND COALESCE(v_old_status, '') <> 'OVERDUE' THEN
    PERFORM public.enqueue_customer_billing_email(
      NEW.id, 'charge_overdue', 'charge_overdue:' || NEW.id::text
    );
  END IF;

  IF NEW.status IN (
    'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK',
    'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'
  ) AND COALESCE(v_old_status, '') NOT IN (
    'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK',
    'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'
  ) THEN
    PERFORM public.enqueue_customer_billing_email(
      NEW.id, 'charge_refunded', 'charge_refunded:' || NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.emit_customer_billing_email_from_charge()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_customer_billing_email_from_charge() TO service_role;
CREATE TRIGGER emit_customer_billing_email_from_charge
  AFTER INSERT OR UPDATE OF asaas_payment_id, status, payment_date ON public.tenant_charges
  FOR EACH ROW EXECUTE FUNCTION public.emit_customer_billing_email_from_charge();

CREATE OR REPLACE FUNCTION public.enqueue_customer_billing_due_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer := 0;
  v_charge record;
  v_day integer;
BEGIN
  FOR v_charge IN
    SELECT tc.id, tc.company_id, tc.due_date, s.reminder_days_before
      FROM public.tenant_charges tc
      JOIN public.customer_email_settings s ON s.company_id = tc.company_id
      JOIN public.customers c ON c.id = tc.customer_id AND c.company_id = tc.company_id
     WHERE s.enabled AND s.due_reminder_enabled
       AND public.company_has_module(tc.company_id, 'cobrancas') IS TRUE
       AND tc.status IN ('PENDING', 'AWAITING_RISK_ANALYSIS')
       AND tc.due_date IS NOT NULL
       AND NULLIF(btrim(c.email), '') IS NOT NULL
       AND char_length(btrim(c.email)) <= 254
       AND btrim(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  LOOP
    FOREACH v_day IN ARRAY v_charge.reminder_days_before LOOP
      IF v_charge.due_date = public.company_today(v_charge.company_id) + v_day THEN
        IF public.enqueue_customer_billing_email(
          v_charge.id,
          'charge_due_reminder',
          'charge_due_reminder:' || v_charge.id::text || ':' || v_charge.due_date::text || ':' || v_day::text
        ) IS NOT NULL THEN
          v_count := v_count + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_customer_billing_due_reminders()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_billing_due_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_customer_email_deliveries(
  p_limit integer DEFAULT 25,
  p_orphan_minutes integer DEFAULT 10
)
RETURNS TABLE (
  delivery_id uuid,
  event_type text,
  recipient_email text,
  sender_name text,
  reply_to_email text,
  company_name text,
  company_logo_url text,
  customer_name text,
  charge_value numeric,
  billing_type text,
  charge_description text,
  due_date date,
  payment_date timestamptz,
  invoice_url text,
  boleto_url text,
  pix_copy_paste text,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_company record;
  v_delivery public.customer_email_deliveries%ROWTYPE;
  v_period date;
  v_limit integer;
  v_used integer;
BEGIN
  UPDATE public.customer_email_deliveries d
     SET status = 'retry', locked_at = NULL, next_attempt_at = now(),
         last_error_code = 'processing_timeout'
   WHERE d.status = 'processing'
     AND d.locked_at < now() - make_interval(mins => greatest(p_orphan_minutes, 1));

  -- A remoção do módulo interrompe a fila antes de qualquer nova chamada ao
  -- provedor. Os registros permanecem auditáveis e não são ressuscitados caso
  -- o módulo seja contratado novamente.
  UPDATE public.customer_email_deliveries d
     SET status = 'cancelled', locked_at = NULL,
         last_error_code = 'billing_module_inactive'
   WHERE d.status IN ('pending', 'retry')
     AND public.company_has_module(d.company_id, 'cobrancas') IS NOT TRUE;

  FOR v_company IN
    SELECT s.company_id
      FROM public.customer_email_settings s
     WHERE s.enabled
       AND public.company_has_module(s.company_id, 'cobrancas') IS TRUE
       AND EXISTS (
         SELECT 1 FROM public.customer_email_deliveries d
          WHERE d.company_id = s.company_id
            AND d.status IN ('pending', 'retry')
            AND d.next_attempt_at <= now()
            AND d.attempts < 5
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.customer_email_deliveries p
          WHERE p.company_id = s.company_id AND p.status = 'processing'
       )
     ORDER BY s.company_id
     LIMIT least(greatest(p_limit, 1), 100)
     FOR UPDATE OF s SKIP LOCKED
  LOOP
    SELECT d.* INTO v_delivery
      FROM public.customer_email_deliveries d
     WHERE d.company_id = v_company.company_id
       AND d.status IN ('pending', 'retry')
       AND d.next_attempt_at <= now()
       AND d.attempts < 5
     ORDER BY d.next_attempt_at, d.created_at
     LIMIT 1
     FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_period := date_trunc('month', public.company_today(v_company.company_id))::date;
    v_limit := public.customer_email_effective_monthly_limit(v_company.company_id);
    SELECT COALESCE(u.accepted_count, 0) INTO v_used
      FROM public.customer_email_monthly_usage u
     WHERE u.company_id = v_company.company_id AND u.period_month = v_period;
    v_used := COALESCE(v_used, 0);

    IF v_limit <= v_used THEN
      UPDATE public.customer_email_deliveries
         SET status = 'skipped_quota', period_month = v_period,
             locked_at = NULL, last_error_code = 'monthly_quota_reached'
       WHERE id = v_delivery.id;
      CONTINUE;
    END IF;

    UPDATE public.customer_email_deliveries
       SET status = 'processing', locked_at = now(), attempts = attempts + 1,
           period_month = v_period, last_error_code = NULL
     WHERE id = v_delivery.id
     RETURNING * INTO v_delivery;

    RETURN QUERY
    SELECT v_delivery.id, v_delivery.event_type, v_delivery.recipient_email,
           COALESCE(NULLIF(btrim(s.sender_name), ''), c.name), s.reply_to_email,
           c.name, c.logo_url, customer.name, tc.value, tc.billing_type,
           tc.description, tc.due_date, tc.payment_date, tc.invoice_url,
           tc.boleto_url, tc.pix_copy_paste, v_delivery.attempts
      FROM public.customer_email_settings s
      JOIN public.companies c ON c.id = s.company_id
      JOIN public.tenant_charges tc
        ON tc.id = v_delivery.charge_id AND tc.company_id = s.company_id
      LEFT JOIN public.customers customer
        ON customer.id = v_delivery.customer_id AND customer.company_id = s.company_id
     WHERE s.company_id = v_delivery.company_id;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_customer_email_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_provider_message_id text DEFAULT NULL,
  p_provider_status integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_retryable boolean DEFAULT false,
  p_retry_after_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_delivery public.customer_email_deliveries%ROWTYPE;
  v_retry boolean;
BEGIN
  SELECT * INTO v_delivery
    FROM public.customer_email_deliveries
   WHERE id = p_delivery_id
   FOR UPDATE;
  IF NOT FOUND OR v_delivery.status <> 'processing' THEN
    RETURN false;
  END IF;

  v_retry := NOT p_success AND p_retryable AND v_delivery.attempts < 5;

  IF p_success THEN
    UPDATE public.customer_email_deliveries
       SET status = 'sent', sent_at = now(), locked_at = NULL,
           provider_message_id = left(p_provider_message_id, 255),
           provider_status = p_provider_status, last_error_code = NULL
     WHERE id = p_delivery_id;

    INSERT INTO public.customer_email_monthly_usage (company_id, period_month, accepted_count)
    VALUES (v_delivery.company_id, v_delivery.period_month, 1)
    ON CONFLICT (company_id, period_month) DO UPDATE
      SET accepted_count = public.customer_email_monthly_usage.accepted_count + 1,
          updated_at = now();
  ELSE
    UPDATE public.customer_email_deliveries
       SET status = CASE WHEN v_retry THEN 'retry' ELSE 'failed' END,
           locked_at = NULL, provider_status = p_provider_status,
           last_error_code = left(COALESCE(NULLIF(p_error_code, ''), 'email_delivery_failed'), 120),
           next_attempt_at = CASE WHEN v_retry
             THEN now() + make_interval(secs => greatest(p_retry_after_seconds, 10))
             ELSE next_attempt_at
           END
     WHERE id = p_delivery_id;
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_customer_email_deliveries(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_customer_email_delivery(
  uuid, boolean, text, integer, text, boolean, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_email_deliveries(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_customer_email_delivery(
  uuid, boolean, text, integer, text, boolean, integer
) TO service_role;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('customer-billing-email-due-reminders')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'customer-billing-email-due-reminders');
    PERFORM cron.schedule(
      'customer-billing-email-due-reminders',
      '0 11 * * *',
      'SELECT public.enqueue_customer_billing_due_reminders();'
    );
  END IF;
END;
$block$;

DO $block$
DECLARE
  v_base_url text;
  v_cron_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'Worker de email de cobranca nao agendado: extensao pg_net ausente.';
    RETURN;
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Worker de email de cobranca nao agendado: Vault indisponivel.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('customer-billing-email-worker-every-minute')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'customer-billing-email-worker-every-minute');

  SELECT rtrim(decrypted_secret, '/') INTO v_base_url
    FROM vault.decrypted_secrets
   WHERE name = 'SUPABASE_FUNCTIONS_BASE_URL'
   LIMIT 1;

  SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
   WHERE name = 'CRON_SECRET'
   LIMIT 1;

  IF COALESCE(v_base_url, '') = '' THEN
    RAISE NOTICE 'Worker de email de cobranca nao agendado: SUPABASE_FUNCTIONS_BASE_URL ausente no Vault.';
    RETURN;
  END IF;

  IF COALESCE(v_cron_secret, '') = '' THEN
    RAISE NOTICE 'Worker de email de cobranca nao agendado: CRON_SECRET ausente no Vault.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'customer-billing-email-worker-every-minute',
    '* * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            ''
          )
        ),
        body := '{"reason":"recovery_cron"}'::jsonb
      );
      $cron$,
      v_base_url || '/functions/v1/process-customer-email-deliveries'
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Nao foi possivel agendar o worker de email de cobranca: %', SQLERRM;
END;
$block$;

COMMENT ON TABLE public.customer_email_settings IS
  'Configuracao opt-in dos emails transacionais de cobranca enviados pela Dominex em nome do tenant.';
COMMENT ON TABLE public.customer_email_deliveries IS
  'Fila persistente e idempotente de emails aos clientes finais, com retry, auditoria e snapshot do destinatario.';
COMMENT ON TABLE public.customer_email_monthly_usage IS
  'Uso mensal aceito pelo provedor para aplicacao da franquia de emails por empresa.';

COMMIT;
