-- Adiciona o layout Bento grafite aos e-mails transacionais de cobranca.

BEGIN;

ALTER TABLE public.customer_email_settings
  DROP CONSTRAINT IF EXISTS customer_email_settings_template_style_check;

ALTER TABLE public.customer_email_settings
  ADD CONSTRAINT customer_email_settings_template_style_check
  CHECK (template_style IN ('classic_light', 'brand_light', 'premium_dark', 'bento_gray'));

COMMENT ON COLUMN public.customer_email_settings.template_style IS
  'Layout global dos e-mails de cobranca: classic_light, brand_light, premium_dark ou bento_gray.';

CREATE OR REPLACE FUNCTION public.update_customer_email_settings(
  p_enabled boolean,
  p_charge_created_enabled boolean,
  p_due_reminder_enabled boolean,
  p_charge_overdue_enabled boolean,
  p_charge_paid_enabled boolean,
  p_charge_refunded_enabled boolean,
  p_reminder_days_before integer[],
  p_sender_name text,
  p_reply_to_email text,
  p_template_style text
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

  IF p_template_style NOT IN ('classic_light', 'brand_light', 'premium_dark', 'bento_gray') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Escolha um modelo de e-mail válido.',
      DETAIL = 'code=customer_email_template_invalid';
  END IF;

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
         template_style = p_template_style,
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
  boolean, boolean, boolean, boolean, boolean, boolean, integer[], text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_customer_email_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer[], text, text, text
) TO authenticated;

COMMIT;
