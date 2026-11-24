-- Conteudo editavel e seguro por evento nos e-mails de cobranca.
-- O tenant personaliza somente textos; estrutura, CTAs e dados financeiros
-- continuam controlados pelo motor Dominex.

BEGIN;

CREATE OR REPLACE FUNCTION public.customer_email_content_overrides_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_event record;
  v_field record;
  v_text text;
  v_limit integer;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' THEN
    RETURN false;
  END IF;

  FOR v_event IN SELECT key, value FROM jsonb_each(p_value)
  LOOP
    IF v_event.key NOT IN (
      'charge_created',
      'charge_due_reminder',
      'charge_overdue',
      'charge_paid',
      'charge_refunded'
    ) OR jsonb_typeof(v_event.value) <> 'object' THEN
      RETURN false;
    END IF;

    FOR v_field IN SELECT key, value FROM jsonb_each(v_event.value)
    LOOP
      IF v_field.key NOT IN ('subject', 'eyebrow', 'title', 'intro')
         OR jsonb_typeof(v_field.value) <> 'string' THEN
        RETURN false;
      END IF;

      v_text := btrim(v_field.value #>> '{}');
      v_limit := CASE v_field.key
        WHEN 'subject' THEN 150
        WHEN 'eyebrow' THEN 80
        WHEN 'title' THEN 120
        WHEN 'intro' THEN 400
      END;

      IF v_text = '' OR char_length(v_text) > v_limit
         OR regexp_replace(
           v_text,
           '\{\{(cliente|empresa|valor|vencimento)\}\}',
           '',
           'g'
         ) ~ '\{\{|\}\}' THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.customer_email_content_overrides_valid(jsonb)
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.customer_email_settings
  ADD COLUMN IF NOT EXISTS content_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.customer_email_settings
  DROP CONSTRAINT IF EXISTS customer_email_settings_content_overrides_check;

ALTER TABLE public.customer_email_settings
  ADD CONSTRAINT customer_email_settings_content_overrides_check
  CHECK (public.customer_email_content_overrides_valid(content_overrides));

COMMENT ON COLUMN public.customer_email_settings.content_overrides IS
  'Textos personalizados por evento. Aceita somente subject, eyebrow, title e intro com variaveis seguras.';

DROP FUNCTION IF EXISTS public.update_customer_email_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer[], text, text, text
);

CREATE FUNCTION public.update_customer_email_settings(
  p_enabled boolean,
  p_charge_created_enabled boolean,
  p_due_reminder_enabled boolean,
  p_charge_overdue_enabled boolean,
  p_charge_paid_enabled boolean,
  p_charge_refunded_enabled boolean,
  p_reminder_days_before integer[],
  p_sender_name text,
  p_reply_to_email text,
  p_template_style text,
  p_content_overrides jsonb
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

  IF p_template_style NOT IN (
    'classic_light',
    'brand_light',
    'premium_dark',
    'bento_gray'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Escolha um modelo de e-mail válido.',
      DETAIL = 'code=customer_email_template_invalid';
  END IF;

  IF public.customer_email_content_overrides_valid(
    COALESCE(p_content_overrides, '{}'::jsonb)
  ) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Revise o conteúdo personalizado dos e-mails.',
      DETAIL = 'code=customer_email_content_invalid';
  END IF;

  INSERT INTO public.customer_email_settings (company_id, sender_name, reply_to_email)
  SELECT c.id,
         left(NULLIF(btrim(c.name), ''), 80),
         CASE
           WHEN COALESCE(NULLIF(btrim(c.billing_email), ''), NULLIF(btrim(c.email), ''))
             ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
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
         template_style = p_template_style,
         content_overrides = COALESCE(p_content_overrides, '{}'::jsonb),
         updated_by = v_user_id
   WHERE company_id = v_company_id;

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
  boolean, boolean, boolean, boolean, boolean, boolean,
  integer[], text, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_customer_email_settings(
  boolean, boolean, boolean, boolean, boolean, boolean,
  integer[], text, text, text, jsonb
) TO authenticated;

DROP FUNCTION IF EXISTS public.get_customer_email_settings_summary();

CREATE FUNCTION public.get_customer_email_settings_summary()
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
  template_style text,
  content_overrides jsonb,
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
         s.template_style, s.content_overrides,
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

DROP FUNCTION IF EXISTS public.claim_customer_email_deliveries(integer, integer);

CREATE FUNCTION public.claim_customer_email_deliveries(
  p_limit integer DEFAULT 25,
  p_orphan_minutes integer DEFAULT 10
)
RETURNS TABLE (
  delivery_id uuid,
  event_type text,
  recipient_email text,
  sender_name text,
  reply_to_email text,
  template_style text,
  content_overrides jsonb,
  company_name text,
  company_header_name text,
  company_logo_url text,
  company_document text,
  company_phone text,
  company_email text,
  company_address text,
  company_address_number text,
  company_neighborhood text,
  company_complement text,
  company_city text,
  company_state text,
  company_zip_code text,
  company_primary_color text,
  white_label_enabled boolean,
  customer_name text,
  charge_value numeric,
  billing_type text,
  charge_description text,
  due_date date,
  payment_date timestamptz,
  public_short_code text,
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
           s.template_style, s.content_overrides,
           COALESCE(NULLIF(btrim(cs.name), ''), c.name),
           CASE WHEN COALESCE(cs.show_name_in_documents, true)
             THEN COALESCE(NULLIF(btrim(cs.name), ''), c.name)
           END,
           CASE WHEN wl.enabled
             THEN COALESCE(NULLIF(btrim(cs.white_label_logo_url), ''), NULLIF(btrim(cs.logo_url), ''), c.logo_url)
             ELSE COALESCE(NULLIF(btrim(cs.logo_url), ''), c.logo_url)
           END,
           CASE WHEN COALESCE(cs.show_cnpj_in_documents, true) THEN cs.document END,
           CASE WHEN COALESCE(cs.show_phone_in_documents, true) THEN cs.phone END,
           CASE WHEN COALESCE(cs.show_email_in_documents, true) THEN cs.email END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.address END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.address_number END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.neighborhood END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.complement END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.city END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.state END,
           CASE WHEN COALESCE(cs.show_address_in_documents, true) THEN cs.zip_code END,
           CASE WHEN wl.enabled THEN cs.white_label_primary_color END,
           wl.enabled,
           customer.name, tc.value, tc.billing_type, tc.description, tc.due_date,
           tc.payment_date, tc.public_short_code, tc.invoice_url, tc.boleto_url,
           tc.pix_copy_paste, v_delivery.attempts
      FROM public.customer_email_settings s
      JOIN public.companies c ON c.id = s.company_id
      JOIN public.tenant_charges tc
        ON tc.id = v_delivery.charge_id AND tc.company_id = s.company_id
      LEFT JOIN public.company_settings cs ON cs.company_id = s.company_id
      CROSS JOIN LATERAL (
        SELECT (
          public.company_has_module(s.company_id, 'white_label') IS TRUE
          AND COALESCE(cs.white_label_enabled, false)
        ) AS enabled
      ) wl
      LEFT JOIN public.customers customer
        ON customer.id = v_delivery.customer_id AND customer.company_id = s.company_id
     WHERE s.company_id = v_delivery.company_id;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_customer_email_deliveries(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_email_deliveries(integer, integer) TO service_role;

COMMIT;
