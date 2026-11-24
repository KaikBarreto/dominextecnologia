-- Contrato estrutural da plataforma de notificacoes.
-- Execute apos aplicar 20261111170000_notification_platform_v1.sql.

DO $test$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'notification_events',
    'company_notification_rules',
    'user_notification_preferences',
    'push_subscriptions',
    'notification_deliveries'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'Tabela ausente: %', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS nao habilitada: %', v_table;
    END IF;
  END LOOP;
END;
$test$;

DO $test$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.companies c
    CROSS JOIN (VALUES
      ('schedule.daily_digest'::text),
      ('billing.charge_paid'::text),
      ('account.trial_expiring'::text),
      ('account.subscription_expiring'::text),
      ('account.payment_required'::text),
      ('portal.ticket_created'::text),
      ('form.submission_received'::text)
    ) expected(event_type)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.company_notification_rules r
      WHERE r.company_id = c.id
        AND r.event_type = expected.event_type
        AND r.enabled
        AND r.in_app_enabled
        AND r.push_enabled
    )
  ) THEN
    RAISE EXCEPTION 'Regras padrao de notificacao incompletas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.companies'::regclass
      AND tgname = 'seed_default_company_notification_rules'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Seed de regras para novas empresas ausente';
  END IF;
END;
$test$;

DO $test$
BEGIN
  IF has_table_privilege('authenticated', 'public.notification_events', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'authenticated acessa notification_events';
  END IF;
  IF has_table_privilege('authenticated', 'public.notification_deliveries', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'authenticated acessa notification_deliveries';
  END IF;
  IF has_table_privilege('authenticated', 'public.user_notifications', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'authenticated ainda altera user_notifications fora das RPCs estreitas';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'authenticated altera push_subscriptions sem edge autenticada';
  END IF;
END;
$test$;

DO $test$
BEGIN
  IF to_regprocedure('public.mark_user_notification_read(uuid)') IS NULL
     OR to_regprocedure('public.mark_all_user_notifications_read(uuid)') IS NULL
     OR to_regprocedure('public.dismiss_user_notification(uuid)') IS NULL
     OR to_regprocedure('public.count_unread_user_notifications(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RPCs estreitas da inbox incompletas';
  END IF;

  IF to_regprocedure('public.claim_notification_deliveries(integer,integer)') IS NULL
     OR to_regprocedure('public.complete_notification_delivery(uuid,boolean,integer,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'RPCs atomicas do worker incompletas';
  END IF;

  IF to_regprocedure('public.localize_notification_content(text,jsonb,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Localizacao por destinatario ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'route_notification_event',
        'claim_notification_deliveries',
        'complete_notification_delivery'
      )
      AND p.prosecdef
    GROUP BY n.nspname
    HAVING count(DISTINCT p.proname) = 3
  ) THEN
    RAISE EXCEPTION 'Funcoes privilegiadas sem SECURITY DEFINER';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_title text;
  v_message text;
BEGIN
  SELECT title, message INTO v_title, v_message
  FROM public.localize_notification_content(
    'billing.charge_paid',
    '{"amount":1234.56,"customer_name":"Empresa Exemplo"}'::jsonb,
    'fallback',
    'fallback',
    'pt-br',
    'BRL'
  );

  IF v_title <> 'Pagamento recebido'
     OR v_message <> 'Pagamento de R$ 1.234,56 recebido de Empresa Exemplo.' THEN
    RAISE EXCEPTION 'Localizacao pt-BR de pagamento invalida: % / %', v_title, v_message;
  END IF;

  SELECT title, message INTO v_title, v_message
  FROM public.localize_notification_content(
    'billing.charge_paid',
    '{"amount":1234.56,"customer_name":"Example Company"}'::jsonb,
    'fallback',
    'fallback',
    'en',
    'BRL'
  );

  IF v_title <> 'Payment received'
     OR v_message <> 'Payment of R$1,234.56 received from Example Company.' THEN
    RAISE EXCEPTION 'Localizacao EN de pagamento invalida: % / %', v_title, v_message;
  END IF;

  SELECT title, message INTO v_title, v_message
  FROM public.localize_notification_content(
    'schedule.daily_digest',
    '{"item_count":2,"scope":"team"}'::jsonb,
    'fallback',
    'fallback',
    'es',
    'BRL'
  );

  IF v_title <> 'Compromisos de hoy'
     OR v_message <> 'Tu equipo tiene 2 compromisos hoy.' THEN
    RAISE EXCEPTION 'Localizacao ES da agenda invalida: % / %', v_title, v_message;
  END IF;

  SELECT title, message INTO v_title, v_message
  FROM public.localize_notification_content(
    'account.trial_expiring',
    '{"days_remaining":1}'::jsonb,
    'fallback',
    'fallback',
    'pt-br',
    'BRL'
  );

  IF v_title <> 'Seu teste termina amanhã'
     OR v_message <> 'Ative seu plano para continuar usando o Dominex sem interrupção.' THEN
    RAISE EXCEPTION 'Localizacao pt-BR do teste invalida: % / %', v_title, v_message;
  END IF;

  SELECT title, message INTO v_title, v_message
  FROM public.localize_notification_content(
    'account.subscription_expiring',
    '{"days_remaining":3}'::jsonb,
    'fallback',
    'fallback',
    'en',
    'BRL'
  );

  IF v_title <> 'Your subscription is due in 3 days'
     OR v_message <> 'Renew your subscription to keep access to Dominex.' THEN
    RAISE EXCEPTION 'Localizacao EN da mensalidade invalida: % / %', v_title, v_message;
  END IF;
END;
$test$;

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.user_notifications'::regclass
      AND tgname = 'user_notification_fill_company_id'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Ponte de tenant para produtores legados ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'user_notification_fill_company_id'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Ponte de tenant nao e SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tenant_charges'::regclass
      AND tgname = 'emit_charge_paid_notification_event'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Produtor billing.charge_paid ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.public_form_submissions'::regclass
      AND tgname = 'emit_form_submission_notification_event'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Produtor form.submission_received ausente';
  END IF;

  IF to_regprocedure('public.enqueue_schedule_daily_digests(timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Produtor schedule.daily_digest ausente';
  END IF;

  IF to_regprocedure('public.enqueue_account_lifecycle_notifications(timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Produtor de lembretes do ciclo da conta ausente';
  END IF;
END;
$test$;
