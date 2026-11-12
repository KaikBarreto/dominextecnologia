-- Smoke test operacional transacional da plataforma de notificacoes em banco populado.
--
-- Exercita os produtores reais e prova o encadeamento:
-- evento de negocio -> feed in-app -> fila push.
-- Toda alteracao e revertida no final; o worker HTTP nao enxerga as entregas
-- criadas dentro desta transacao.

BEGIN;

SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

DO $test$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_entity_id uuid;
  v_form_id uuid;
  v_order_number integer;
  v_timezone text;
  v_schedule_date date := date '2037-01-15';
  v_schedule_now timestamptz;
  v_lifecycle_now timestamptz;
  v_inserted integer;
  v_event_type text;
BEGIN
  -- -----------------------------------------------------------------------
  -- Contrato dos canais: com push ativado, a mesma notificacao permanece no
  -- feed e ganha uma entrega por assinatura ativa.
  -- -----------------------------------------------------------------------
  SELECT p.company_id, p.user_id
    INTO v_company_id, v_user_id
  FROM public.profiles p
  WHERE p.is_active
    AND p.company_id IS NOT NULL
  ORDER BY p.created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'notification_e2e_requires_active_profile';
  END IF;

  INSERT INTO public.push_subscriptions (
    company_id, user_id, endpoint, p256dh, auth, user_agent, device_label
  ) VALUES (
    v_company_id,
    v_user_id,
    'https://web.push.apple.com/dominex-smoke-' || gen_random_uuid()::text,
    repeat('A', 65),
    repeat('B', 32),
    'Dominex notification smoke test',
    'Teste transacional'
  );

  INSERT INTO public.user_notification_preferences (
    company_id, user_id, event_type, in_app_enabled, push_enabled
  ) VALUES (
    v_company_id, v_user_id, 'notification.smoke.both', true, true
  )
  ON CONFLICT (company_id, user_id, event_type) DO UPDATE
    SET in_app_enabled = EXCLUDED.in_app_enabled,
        push_enabled = EXCLUDED.push_enabled;

  INSERT INTO public.notification_events (
    company_id, event_type, source_type, dedupe_key, recipient_user_ids,
    title, message, action_url, icon, category, priority, payload
  ) VALUES (
    v_company_id, 'notification.smoke.both', 'smoke_test',
    'notification.smoke.both:' || gen_random_uuid()::text, ARRAY[v_user_id],
    'Teste dos canais', 'Feed e push devem nascer juntos.', '/configuracoes/notificacoes',
    'bell', 'general', 'normal', '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_notifications n
    WHERE n.event_id = v_event_id
      AND n.user_id = v_user_id
      AND n.company_id = v_company_id
      AND n.in_app_visible
  ) THEN
    RAISE EXCEPTION 'feed_not_created_when_push_enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_deliveries d
    JOIN public.user_notifications n ON n.id = d.notification_id
    JOIN public.push_subscriptions s ON s.id = d.subscription_id
    WHERE n.event_id = v_event_id
      AND s.user_id = v_user_id
      AND d.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'push_not_queued_for_active_subscription';
  END IF;

  INSERT INTO public.user_notification_preferences (
    company_id, user_id, event_type, in_app_enabled, push_enabled
  ) VALUES (
    v_company_id, v_user_id, 'notification.smoke.feed_only', true, false
  )
  ON CONFLICT (company_id, user_id, event_type) DO UPDATE
    SET in_app_enabled = EXCLUDED.in_app_enabled,
        push_enabled = EXCLUDED.push_enabled;

  INSERT INTO public.notification_events (
    company_id, event_type, source_type, dedupe_key, recipient_user_ids,
    title, message, action_url, icon, category, priority, payload
  ) VALUES (
    v_company_id, 'notification.smoke.feed_only', 'smoke_test',
    'notification.smoke.feed_only:' || gen_random_uuid()::text, ARRAY[v_user_id],
    'Teste do feed', 'O feed deve existir mesmo sem push.', '/configuracoes/notificacoes',
    'bell', 'general', 'normal', '{}'::jsonb
  ) RETURNING id INTO v_event_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_notifications n
    WHERE n.event_id = v_event_id AND n.in_app_visible
  ) OR EXISTS (
    SELECT 1
    FROM public.notification_deliveries d
    JOIN public.user_notifications n ON n.id = d.notification_id
    WHERE n.event_id = v_event_id
  ) THEN
    RAISE EXCEPTION 'feed_only_channel_contract_failed';
  END IF;

  -- -----------------------------------------------------------------------
  -- Cobranca paga: o UPDATE canonico de payment_date deve produzir evento,
  -- texto especifico, feed e push.
  -- -----------------------------------------------------------------------
  SELECT tc.id, tc.company_id, tc.created_by
    INTO v_entity_id, v_company_id, v_user_id
  FROM public.tenant_charges tc
  JOIN public.profiles p
    ON p.user_id = tc.created_by
   AND p.company_id = tc.company_id
   AND p.is_active
  WHERE tc.payment_date IS NULL
  ORDER BY tc.created_at DESC
  LIMIT 1
  FOR UPDATE OF tc SKIP LOCKED;

  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'notification_e2e_requires_unpaid_charge';
  END IF;

  PERFORM public.ensure_default_company_notification_rules(v_company_id);
  UPDATE public.company_notification_rules
     SET enabled = true, in_app_enabled = true, push_enabled = true,
         recipient_policy = '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb
   WHERE company_id = v_company_id
     AND event_type = 'billing.charge_paid';

  INSERT INTO public.user_notification_preferences (
    company_id, user_id, event_type, in_app_enabled, push_enabled
  ) VALUES (v_company_id, v_user_id, 'billing.charge_paid', true, true)
  ON CONFLICT (company_id, user_id, event_type) DO UPDATE
    SET in_app_enabled = true, push_enabled = true;

  INSERT INTO public.push_subscriptions (
    company_id, user_id, endpoint, p256dh, auth, user_agent, device_label
  ) VALUES (
    v_company_id, v_user_id,
    'https://web.push.apple.com/dominex-charge-' || gen_random_uuid()::text,
    repeat('A', 65), repeat('B', 32), 'Dominex notification smoke test', 'Teste cobranca'
  );

  UPDATE public.tenant_charges
     SET payment_date = now()
   WHERE id = v_entity_id;

  SELECT e.id INTO v_event_id
  FROM public.notification_events e
  WHERE e.company_id = v_company_id
    AND e.event_type = 'billing.charge_paid'
    AND e.source_id = v_entity_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'charge_paid_event_not_created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_notifications n
    WHERE n.event_id = v_event_id
      AND n.user_id = v_user_id
      AND n.in_app_visible
      AND n.title <> ''
      AND n.message IS NOT NULL
      AND n.metadata ? 'amount'
  ) THEN
    RAISE EXCEPTION 'charge_paid_feed_not_created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_deliveries d
    JOIN public.user_notifications n ON n.id = d.notification_id
    JOIN public.push_subscriptions s ON s.id = d.subscription_id
    WHERE n.event_id = v_event_id
      AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'charge_paid_push_not_queued';
  END IF;

  -- -----------------------------------------------------------------------
  -- Chamado do portal: INSERT real de OS do portal, sem manter a fixture.
  -- -----------------------------------------------------------------------
  SELECT p.company_id, p.user_id
    INTO v_company_id, v_user_id
  FROM public.profiles p
  WHERE p.is_active
    AND public.user_has_permission(p.user_id, 'screen:service_orders')
  ORDER BY p.created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'notification_e2e_requires_service_order_viewer';
  END IF;

  PERFORM public.ensure_default_company_notification_rules(v_company_id);
  UPDATE public.company_notification_rules
     SET enabled = true, in_app_enabled = true, push_enabled = true,
         recipient_policy = '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb
   WHERE company_id = v_company_id
     AND event_type = 'portal.ticket_created';

  INSERT INTO public.user_notification_preferences (
    company_id, user_id, event_type, in_app_enabled, push_enabled
  ) VALUES (v_company_id, v_user_id, 'portal.ticket_created', true, true)
  ON CONFLICT (company_id, user_id, event_type) DO UPDATE
    SET in_app_enabled = true, push_enabled = true;

  INSERT INTO public.push_subscriptions (
    company_id, user_id, endpoint, p256dh, auth, user_agent, device_label
  ) VALUES (
    v_company_id, v_user_id,
    'https://web.push.apple.com/dominex-ticket-' || gen_random_uuid()::text,
    repeat('A', 65), repeat('B', 32), 'Dominex notification smoke test', 'Teste chamado'
  );

  SELECT COALESCE(min(so.order_number), 0) - 1000000
    INTO v_order_number
  FROM public.service_orders so;

  v_entity_id := gen_random_uuid();
  INSERT INTO public.service_orders (
    id, order_number, company_id, origin, description, created_by
  ) VALUES (
    v_entity_id, v_order_number, v_company_id, 'portal',
    'Chamado criado pelo teste transacional de notificacoes', v_user_id
  );

  SELECT e.id INTO v_event_id
  FROM public.notification_events e
  WHERE e.event_type = 'portal.ticket_created'
    AND e.source_id = v_entity_id;

  IF v_event_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_notifications n
    WHERE n.event_id = v_event_id AND n.user_id = v_user_id AND n.in_app_visible
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.notification_deliveries d
    JOIN public.user_notifications n ON n.id = d.notification_id
    JOIN public.push_subscriptions s ON s.id = d.subscription_id
    WHERE n.event_id = v_event_id AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'portal_ticket_flow_incomplete';
  END IF;

  -- -----------------------------------------------------------------------
  -- Formulario: submissao real deve avisar o dono do formulario.
  -- -----------------------------------------------------------------------
  v_form_id := gen_random_uuid();
  INSERT INTO public.lead_capture_forms (id, company_id, title, created_by)
  VALUES (v_form_id, v_company_id, 'Formulario do teste de notificacoes', v_user_id);

  UPDATE public.company_notification_rules
     SET enabled = true, in_app_enabled = true, push_enabled = true,
         recipient_policy = '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb
   WHERE company_id = v_company_id
     AND event_type = 'form.submission_received';

  INSERT INTO public.user_notification_preferences (
    company_id, user_id, event_type, in_app_enabled, push_enabled
  ) VALUES (v_company_id, v_user_id, 'form.submission_received', true, true)
  ON CONFLICT (company_id, user_id, event_type) DO UPDATE
    SET in_app_enabled = true, push_enabled = true;

  v_entity_id := gen_random_uuid();
  INSERT INTO public.public_form_submissions (
    id, company_id, form_id, source, answers, fields
  ) VALUES (
    v_entity_id, v_company_id, v_form_id, 'public_link', '{}'::jsonb,
    '{"company_name":"Empresa Teste"}'::jsonb
  );

  SELECT e.id INTO v_event_id
  FROM public.notification_events e
  WHERE e.event_type = 'form.submission_received'
    AND e.source_id = v_entity_id;

  IF v_event_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_notifications n
    WHERE n.event_id = v_event_id AND n.user_id = v_user_id AND n.in_app_visible
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.notification_deliveries d
    JOIN public.user_notifications n ON n.id = d.notification_id
    JOIN public.push_subscriptions s ON s.id = d.subscription_id
    WHERE n.event_id = v_event_id AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'form_submission_flow_incomplete';
  END IF;

  -- -----------------------------------------------------------------------
  -- Agenda: cria um compromisso atribuido e executa o produtor no minuto
  -- configurado da empresa.
  -- -----------------------------------------------------------------------
  SELECT p.company_id, p.user_id,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM pg_timezone_names z
             WHERE z.name = cs.timezone
           ) THEN cs.timezone
           ELSE 'UTC'
         END
    INTO v_company_id, v_user_id, v_timezone
  FROM public.profiles p
  LEFT JOIN public.company_settings cs ON cs.company_id = p.company_id
  WHERE p.is_active
    AND public.user_has_permission(p.user_id, 'screen:schedule')
  ORDER BY p.created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'notification_e2e_requires_schedule_viewer';
  END IF;

  PERFORM public.ensure_default_company_notification_rules(v_company_id);
  UPDATE public.company_notification_rules
     SET enabled = true, in_app_enabled = true, push_enabled = true,
         schedule_time = time '07:00',
         recipient_policy = '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb
   WHERE company_id = v_company_id
     AND event_type = 'schedule.daily_digest';

  INSERT INTO public.user_notification_preferences (
    company_id, user_id, event_type, in_app_enabled, push_enabled
  ) VALUES (v_company_id, v_user_id, 'schedule.daily_digest', true, true)
  ON CONFLICT (company_id, user_id, event_type) DO UPDATE
    SET in_app_enabled = true, push_enabled = true;

  INSERT INTO public.push_subscriptions (
    company_id, user_id, endpoint, p256dh, auth, user_agent, device_label
  ) VALUES (
    v_company_id, v_user_id,
    'https://web.push.apple.com/dominex-schedule-' || gen_random_uuid()::text,
    repeat('A', 65), repeat('B', 32), 'Dominex notification smoke test', 'Teste agenda'
  );

  SELECT COALESCE(min(so.order_number), 0) - 1000001
    INTO v_order_number
  FROM public.service_orders so;

  v_entity_id := gen_random_uuid();
  INSERT INTO public.service_orders (
    id, order_number, company_id, origin, task_title, technician_id,
    scheduled_date, scheduled_time, show_in_schedule, created_by
  ) VALUES (
    v_entity_id, v_order_number, v_company_id, 'manual',
    'Compromisso do teste de notificacoes', v_user_id,
    v_schedule_date, time '10:00', true, v_user_id
  );

  DELETE FROM public.notification_events
  WHERE company_id = v_company_id
    AND dedupe_key = 'schedule.daily_digest:' || v_user_id::text || ':' || v_schedule_date::text;

  v_schedule_now := (v_schedule_date::timestamp + time '07:01') AT TIME ZONE v_timezone;
  v_inserted := public.enqueue_schedule_daily_digests(v_schedule_now);

  SELECT e.id INTO v_event_id
  FROM public.notification_events e
  WHERE e.company_id = v_company_id
    AND e.dedupe_key = 'schedule.daily_digest:' || v_user_id::text || ':' || v_schedule_date::text;

  IF v_inserted < 1 OR v_event_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_notifications n
    WHERE n.event_id = v_event_id AND n.user_id = v_user_id AND n.in_app_visible
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.notification_deliveries d
    JOIN public.user_notifications n ON n.id = d.notification_id
    JOIN public.push_subscriptions s ON s.id = d.subscription_id
    WHERE n.event_id = v_event_id AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'schedule_daily_digest_flow_incomplete';
  END IF;

  -- -----------------------------------------------------------------------
  -- Ciclo da conta: teste, mensalidade e pagamento pendente.
  -- -----------------------------------------------------------------------
  SELECT p.company_id, p.user_id,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM pg_timezone_names z
             WHERE z.name = cs.timezone
           ) THEN cs.timezone
           ELSE 'UTC'
         END
    INTO v_company_id, v_user_id, v_timezone
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN public.company_settings cs ON cs.company_id = p.company_id
  WHERE p.is_active
    AND ur.role::text IN ('admin', 'gestor')
  ORDER BY p.created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'notification_e2e_requires_account_manager';
  END IF;

  PERFORM public.ensure_default_company_notification_rules(v_company_id);
  UPDATE public.company_notification_rules
     SET enabled = true, in_app_enabled = true, push_enabled = true,
         schedule_time = time '09:00',
         recipient_policy = '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb
   WHERE company_id = v_company_id
     AND event_type IN (
       'account.trial_expiring',
       'account.subscription_expiring',
       'account.payment_required'
     );

  INSERT INTO public.push_subscriptions (
    company_id, user_id, endpoint, p256dh, auth, user_agent, device_label
  ) VALUES (
    v_company_id, v_user_id,
    'https://web.push.apple.com/dominex-account-' || gen_random_uuid()::text,
    repeat('A', 65), repeat('B', 32), 'Dominex notification smoke test', 'Teste conta'
  );

  FOREACH v_event_type IN ARRAY ARRAY[
    'account.trial_expiring',
    'account.subscription_expiring',
    'account.payment_required'
  ]
  LOOP
    INSERT INTO public.user_notification_preferences (
      company_id, user_id, event_type, in_app_enabled, push_enabled
    ) VALUES (v_company_id, v_user_id, v_event_type, true, true)
    ON CONFLICT (company_id, user_id, event_type) DO UPDATE
      SET in_app_enabled = true, push_enabled = true;
  END LOOP;

  v_lifecycle_now := (timestamp '2037-01-20 09:15') AT TIME ZONE v_timezone;

  UPDATE public.companies
     SET subscription_status = 'testing',
         subscription_expires_at = timestamp with time zone '2037-01-23 00:00:00+00',
         payment_lock_bypass = false
   WHERE id = v_company_id;
  PERFORM public.enqueue_account_lifecycle_notifications(v_lifecycle_now);

  UPDATE public.companies
     SET subscription_status = 'active'
   WHERE id = v_company_id;
  PERFORM public.enqueue_account_lifecycle_notifications(v_lifecycle_now);

  UPDATE public.companies
     SET subscription_status = 'pending_payment'
   WHERE id = v_company_id;
  PERFORM public.enqueue_account_lifecycle_notifications(v_lifecycle_now);

  FOREACH v_event_type IN ARRAY ARRAY[
    'account.trial_expiring',
    'account.subscription_expiring',
    'account.payment_required'
  ]
  LOOP
    SELECT e.id INTO v_event_id
    FROM public.notification_events e
    WHERE e.company_id = v_company_id
      AND e.event_type = v_event_type
      AND e.created_at >= transaction_timestamp()
    ORDER BY e.created_at DESC
    LIMIT 1;

    IF v_event_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.event_id = v_event_id AND n.user_id = v_user_id AND n.in_app_visible
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries d
      JOIN public.user_notifications n ON n.id = d.notification_id
      JOIN public.push_subscriptions s ON s.id = d.subscription_id
      WHERE n.event_id = v_event_id AND s.user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'account_lifecycle_flow_incomplete: %', v_event_type;
    END IF;
  END LOOP;
END;
$test$;

SELECT 'notification_platform_e2e_ok' AS result;

ROLLBACK;
