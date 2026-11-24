-- Lembretes automaticos do ciclo de conta (teste, mensalidade e pagamento).
-- A data canonica e companies.subscription_expires_at, a mesma usada pelo gate
-- de assinatura. O cliente nunca informa status, valor ou vencimento no evento.

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
    ('account.trial_expiring'::text, time '09:00'),
    ('account.subscription_expiring'::text, time '09:00'),
    ('account.payment_required'::text, time '09:00'),
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

CREATE OR REPLACE FUNCTION public.enqueue_account_lifecycle_notifications(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  WITH company_clock AS (
    SELECT
      c.id AS company_id,
      c.subscription_status::text AS subscription_status,
      c.subscription_expires_at,
      COALESCE(c.payment_lock_bypass, false) AS payment_lock_bypass,
      CASE
        WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = cs.timezone)
          THEN cs.timezone
        ELSE 'UTC'
      END AS timezone
    FROM public.companies c
    LEFT JOIN public.company_settings cs ON cs.company_id = c.id
    WHERE c.subscription_status::text IN ('testing', 'active', 'pending_payment')
  ), due_companies AS (
    SELECT
      cc.*,
      (cc.subscription_expires_at AT TIME ZONE 'UTC')::date AS expiration_date,
      (cc.subscription_expires_at AT TIME ZONE 'UTC')::date
        - (_now AT TIME ZONE 'UTC')::date AS days_remaining
    FROM company_clock cc
    WHERE (_now AT TIME ZONE cc.timezone)::time >= time '09:00'
      AND (_now AT TIME ZONE cc.timezone)::time < time '10:00'
  ), lifecycle_events AS (
    SELECT
      dc.*,
      CASE
        WHEN dc.subscription_status = 'testing' THEN 'account.trial_expiring'
        WHEN dc.subscription_status = 'active' THEN 'account.subscription_expiring'
        ELSE 'account.payment_required'
      END AS event_type
    FROM due_companies dc
    WHERE (
      dc.subscription_status = 'testing'
      AND dc.subscription_expires_at IS NOT NULL
      AND dc.days_remaining IN (3, 1, 0)
    ) OR (
      dc.subscription_status = 'active'
      AND dc.subscription_expires_at IS NOT NULL
      AND dc.days_remaining IN (3, 0)
    ) OR (
      dc.subscription_status = 'pending_payment'
      AND NOT dc.payment_lock_bypass
    )
  ), prepared AS (
    SELECT
      le.*,
      COALESCE((
        SELECT array_agg(DISTINCT p.user_id)
        FROM public.profiles p
        WHERE p.company_id = le.company_id
          AND p.is_active
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = p.user_id
              AND ur.role::text IN ('admin', 'gestor')
          )
      ), ARRAY[]::uuid[]) AS recipients
    FROM lifecycle_events le
  ), inserted AS (
    INSERT INTO public.notification_events (
      company_id, event_type, source_type, dedupe_key, recipient_user_ids,
      title, message, action_url, icon, category, priority, payload
    )
    SELECT
      p.company_id,
      p.event_type,
      'company_subscription',
      p.event_type || ':' || COALESCE(p.expiration_date::text, 'sem-vencimento')
        || CASE WHEN p.event_type = 'account.payment_required' THEN '' ELSE ':d' || p.days_remaining::text END,
      p.recipients,
      CASE
        WHEN p.event_type = 'account.trial_expiring' AND p.days_remaining = 0 THEN 'Seu teste termina hoje'
        WHEN p.event_type = 'account.trial_expiring' AND p.days_remaining = 1 THEN 'Seu teste termina amanhã'
        WHEN p.event_type = 'account.trial_expiring' THEN 'Seu teste termina em 3 dias'
        WHEN p.event_type = 'account.subscription_expiring' AND p.days_remaining = 0 THEN 'Sua mensalidade vence hoje'
        WHEN p.event_type = 'account.subscription_expiring' THEN 'Sua mensalidade vence em 3 dias'
        ELSE 'Pagamento da mensalidade pendente'
      END,
      CASE
        WHEN p.event_type = 'account.trial_expiring' THEN 'Ative seu plano para continuar usando o Dominex sem interrupção.'
        WHEN p.event_type = 'account.subscription_expiring' THEN 'Renove sua assinatura para manter o acesso ao Dominex.'
        ELSE 'Regularize o pagamento para manter o acesso ao Dominex.'
      END,
      CASE WHEN p.event_type = 'account.trial_expiring' THEN '/assinatura' ELSE '/checkout?mode=renewal' END,
      'badge-alert',
      'account',
      'high',
      jsonb_build_object(
        'days_remaining', p.days_remaining,
        'expiration_date', p.expiration_date,
        'lifecycle_stage', p.subscription_status
      )
    FROM prepared p
    ON CONFLICT (company_id, dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM inserted;

  RETURN COALESCE(v_count, 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_account_lifecycle_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_account_lifecycle_notifications(timestamptz) TO service_role;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('notification-account-lifecycle-reminders')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-account-lifecycle-reminders');
    PERFORM cron.schedule(
      'notification-account-lifecycle-reminders',
      '*/15 * * * *',
      'SELECT public.enqueue_account_lifecycle_notifications();'
    );
  END IF;
END;
$block$;

COMMENT ON FUNCTION public.enqueue_account_lifecycle_notifications(timestamptz) IS
  'Gera lembretes idempotentes de teste, vencimento e pagamento para admins/gestores ativos do tenant.';

-- Mantem a localizacao por destinatario tambem para os novos avisos. A funcao
-- e recriada inteira para preservar o contrato dos quatro eventos anteriores.
CREATE OR REPLACE FUNCTION public.localize_notification_content(
  _event_type text,
  _payload jsonb,
  _fallback_title text,
  _fallback_message text,
  _locale text,
  _currency text DEFAULT 'BRL'
)
RETURNS TABLE (title text, message text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_locale text := CASE WHEN _locale IN ('pt-br', 'en', 'es', 'fr') THEN _locale ELSE 'pt-br' END;
  v_payload jsonb := COALESCE(_payload, '{}'::jsonb);
  v_customer text := NULLIF(btrim(COALESCE(_payload->>'customer_name', '')), '');
  v_summary text := NULLIF(btrim(COALESCE(_payload->>'summary', '')), '');
  v_form_title text := NULLIF(btrim(COALESCE(_payload->>'form_title', '')), '');
  v_scope text := COALESCE(_payload->>'scope', 'own');
  v_order_number text := NULLIF(btrim(COALESCE(_payload->>'order_number', '')), '');
  v_count integer := 0;
  v_days integer;
  v_amount numeric;
  v_amount_us text;
  v_amount_local text;
  v_currency text := upper(COALESCE(NULLIF(btrim(_currency), ''), 'BRL'));
BEGIN
  IF COALESCE(v_payload->>'item_count', '') ~ '^\d+$' THEN
    v_count := (v_payload->>'item_count')::integer;
  END IF;
  IF COALESCE(v_payload->>'days_remaining', '') ~ '^-?\d+$' THEN
    v_days := (v_payload->>'days_remaining')::integer;
  END IF;

  IF COALESCE(v_payload->>'amount', '') ~ '^-?\d+(\.\d+)?$' THEN
    v_amount := (v_payload->>'amount')::numeric;
    v_amount_us := to_char(v_amount, 'FM999,999,999,990.00');
    v_amount_local := CASE
      WHEN v_locale IN ('pt-br', 'es') THEN translate(v_amount_us, ',.', '.,')
      WHEN v_locale = 'fr' THEN replace(replace(v_amount_us, ',', ' '), '.', ',')
      ELSE v_amount_us
    END;
    v_amount_local := CASE
      WHEN v_currency = 'BRL' AND v_locale IN ('pt-br', 'es') THEN 'R$ ' || v_amount_local
      WHEN v_currency = 'BRL' AND v_locale = 'en' THEN 'R$' || v_amount_local
      WHEN v_currency = 'BRL' THEN v_amount_local || ' BRL'
      WHEN v_currency = 'USD' AND v_locale = 'en' THEN '$' || v_amount_local
      WHEN v_currency = 'EUR' AND v_locale = 'fr' THEN v_amount_local || ' €'
      ELSE v_currency || ' ' || v_amount_local
    END;
  END IF;

  IF _event_type = 'account.trial_expiring' THEN
    IF v_locale = 'en' THEN
      title := CASE WHEN v_days = 0 THEN 'Your trial ends today' WHEN v_days = 1 THEN 'Your trial ends tomorrow' ELSE 'Your trial ends in 3 days' END;
      message := 'Choose a plan to keep using Dominex without interruption.';
    ELSIF v_locale = 'es' THEN
      title := CASE WHEN v_days = 0 THEN 'Tu prueba termina hoy' WHEN v_days = 1 THEN 'Tu prueba termina mañana' ELSE 'Tu prueba termina en 3 días' END;
      message := 'Activa tu plan para seguir usando Dominex sin interrupciones.';
    ELSIF v_locale = 'fr' THEN
      title := CASE WHEN v_days = 0 THEN 'Votre essai se termine aujourd’hui' WHEN v_days = 1 THEN 'Votre essai se termine demain' ELSE 'Votre essai se termine dans 3 jours' END;
      message := 'Activez votre forfait pour continuer à utiliser Dominex sans interruption.';
    ELSE
      title := CASE WHEN v_days = 0 THEN 'Seu teste termina hoje' WHEN v_days = 1 THEN 'Seu teste termina amanhã' ELSE 'Seu teste termina em 3 dias' END;
      message := 'Ative seu plano para continuar usando o Dominex sem interrupção.';
    END IF;
  ELSIF _event_type = 'account.subscription_expiring' THEN
    IF v_locale = 'en' THEN
      title := CASE WHEN v_days = 0 THEN 'Your subscription is due today' ELSE 'Your subscription is due in 3 days' END;
      message := 'Renew your subscription to keep access to Dominex.';
    ELSIF v_locale = 'es' THEN
      title := CASE WHEN v_days = 0 THEN 'Tu mensualidad vence hoy' ELSE 'Tu mensualidad vence en 3 días' END;
      message := 'Renueva tu suscripción para mantener el acceso a Dominex.';
    ELSIF v_locale = 'fr' THEN
      title := CASE WHEN v_days = 0 THEN 'Votre abonnement expire aujourd’hui' ELSE 'Votre abonnement expire dans 3 jours' END;
      message := 'Renouvelez votre abonnement pour conserver l’accès à Dominex.';
    ELSE
      title := CASE WHEN v_days = 0 THEN 'Sua mensalidade vence hoje' ELSE 'Sua mensalidade vence em 3 dias' END;
      message := 'Renove sua assinatura para manter o acesso ao Dominex.';
    END IF;
  ELSIF _event_type = 'account.payment_required' THEN
    IF v_locale = 'en' THEN
      title := 'Subscription payment pending';
      message := 'Complete the payment to keep access to Dominex.';
    ELSIF v_locale = 'es' THEN
      title := 'Pago de la mensualidad pendiente';
      message := 'Regulariza el pago para mantener el acceso a Dominex.';
    ELSIF v_locale = 'fr' THEN
      title := 'Paiement de l’abonnement en attente';
      message := 'Régularisez le paiement pour conserver l’accès à Dominex.';
    ELSE
      title := 'Pagamento da mensalidade pendente';
      message := 'Regularize o pagamento para manter o acesso ao Dominex.';
    END IF;
  ELSIF _event_type = 'schedule.daily_digest' THEN
    IF v_locale = 'en' THEN
      title := 'Today''s appointments';
      message := CASE WHEN v_scope = 'team' AND v_count = 1 THEN 'Your team has 1 appointment today.' WHEN v_scope = 'team' THEN 'Your team has ' || v_count::text || ' appointments today.' WHEN v_count = 1 THEN 'You have 1 appointment today.' ELSE 'You have ' || v_count::text || ' appointments today.' END;
    ELSIF v_locale = 'es' THEN
      title := 'Compromisos de hoy';
      message := CASE WHEN v_scope = 'team' AND v_count = 1 THEN 'Tu equipo tiene 1 compromiso hoy.' WHEN v_scope = 'team' THEN 'Tu equipo tiene ' || v_count::text || ' compromisos hoy.' WHEN v_count = 1 THEN 'Tienes 1 compromiso hoy.' ELSE 'Tienes ' || v_count::text || ' compromisos hoy.' END;
    ELSIF v_locale = 'fr' THEN
      title := 'Rendez-vous d’aujourd’hui';
      message := CASE WHEN v_scope = 'team' AND v_count = 1 THEN 'Votre équipe a 1 rendez-vous aujourd’hui.' WHEN v_scope = 'team' THEN 'Votre équipe a ' || v_count::text || ' rendez-vous aujourd’hui.' WHEN v_count = 1 THEN 'Vous avez 1 rendez-vous aujourd’hui.' ELSE 'Vous avez ' || v_count::text || ' rendez-vous aujourd’hui.' END;
    ELSE
      title := 'Compromissos de hoje';
      message := CASE WHEN v_scope = 'team' AND v_count = 1 THEN 'Sua equipe tem 1 compromisso hoje.' WHEN v_scope = 'team' THEN 'Sua equipe tem ' || v_count::text || ' compromissos hoje.' WHEN v_count = 1 THEN 'Você tem 1 compromisso hoje.' ELSE 'Você tem ' || v_count::text || ' compromissos hoje.' END;
    END IF;
  ELSIF _event_type = 'billing.charge_paid' THEN
    IF v_locale = 'en' THEN
      title := 'Payment received';
      message := 'Payment' || CASE WHEN v_amount_local IS NOT NULL THEN ' of ' || v_amount_local ELSE '' END || ' received' || CASE WHEN v_customer IS NOT NULL THEN ' from ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'es' THEN
      title := 'Pago recibido';
      message := 'Pago' || CASE WHEN v_amount_local IS NOT NULL THEN ' de ' || v_amount_local ELSE '' END || ' recibido' || CASE WHEN v_customer IS NOT NULL THEN ' de ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'fr' THEN
      title := 'Paiement reçu';
      message := 'Paiement' || CASE WHEN v_amount_local IS NOT NULL THEN ' de ' || v_amount_local ELSE '' END || ' reçu' || CASE WHEN v_customer IS NOT NULL THEN ' de ' || v_customer ELSE '' END || '.';
    ELSE
      title := 'Pagamento recebido';
      message := 'Pagamento' || CASE WHEN v_amount_local IS NOT NULL THEN ' de ' || v_amount_local ELSE '' END || ' recebido' || CASE WHEN v_customer IS NOT NULL THEN ' de ' || v_customer ELSE '' END || '.';
    END IF;
  ELSIF _event_type = 'portal.ticket_created' THEN
    IF v_locale = 'en' THEN
      title := 'New ticket' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Ticket' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END || ' opened' || CASE WHEN v_customer IS NOT NULL THEN ' by ' || v_customer ELSE ' through the customer portal' END || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END;
    ELSIF v_locale = 'es' THEN
      title := 'Nuevo llamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Llamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END || ' abierto' || CASE WHEN v_customer IS NOT NULL THEN ' por ' || v_customer ELSE ' desde el portal del cliente' END || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END;
    ELSIF v_locale = 'fr' THEN
      title := 'Nouvelle demande' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Demande' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END || ' ouverte' || CASE WHEN v_customer IS NOT NULL THEN ' par ' || v_customer ELSE ' depuis le portail client' END || CASE WHEN v_summary IS NOT NULL THEN ' : ' || v_summary ELSE '.' END;
    ELSE
      title := 'Novo chamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Chamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END || ' aberto' || CASE WHEN v_customer IS NOT NULL THEN ' por ' || v_customer ELSE ' pelo portal do cliente' END || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END;
    END IF;
  ELSIF _event_type = 'form.submission_received' THEN
    IF v_locale = 'en' THEN
      title := 'Form received';
      message := 'New response' || CASE WHEN v_form_title IS NOT NULL THEN ' to “' || v_form_title || '”' ELSE ' to a form' END || CASE WHEN v_customer IS NOT NULL THEN ', sent by ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'es' THEN
      title := 'Formulario recibido';
      message := 'Nueva respuesta' || CASE WHEN v_form_title IS NOT NULL THEN ' en «' || v_form_title || '»' ELSE ' de formulario' END || CASE WHEN v_customer IS NOT NULL THEN ', enviada por ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'fr' THEN
      title := 'Formulaire reçu';
      message := 'Nouvelle réponse' || CASE WHEN v_form_title IS NOT NULL THEN ' au formulaire « ' || v_form_title || ' »' ELSE ' à un formulaire' END || CASE WHEN v_customer IS NOT NULL THEN ', envoyée par ' || v_customer ELSE '' END || '.';
    ELSE
      title := 'Formulário recebido';
      message := 'Nova resposta' || CASE WHEN v_form_title IS NOT NULL THEN ' em “' || v_form_title || '”' ELSE ' de formulário' END || CASE WHEN v_customer IS NOT NULL THEN ', enviada por ' || v_customer ELSE '' END || '.';
    END IF;
  ELSE
    title := COALESCE(NULLIF(btrim(_fallback_title), ''), 'Nova notificação no Dominex');
    message := NULLIF(btrim(COALESCE(_fallback_message, '')), '');
  END IF;

  title := left(title, 180);
  message := left(message, 500);
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.localize_notification_content(text, jsonb, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.localize_notification_content(text, jsonb, text, text, text, text)
  TO service_role;
