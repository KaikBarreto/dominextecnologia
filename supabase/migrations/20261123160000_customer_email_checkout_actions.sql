-- Entrega ao worker o codigo publico da cobranca para que o CTA principal
-- use o checkout Dominex. O link direto do boleto continua separado.

BEGIN;

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
           s.template_style,
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
