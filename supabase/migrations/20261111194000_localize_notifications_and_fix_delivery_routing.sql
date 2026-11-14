-- Localiza o conteudo persistido por destinatario e corrige o fan-out de push.
--
-- A primeira versao tentava consultar user_notifications na mesma instrucao em
-- que as linhas eram inseridas por uma CTE mutavel. No PostgreSQL, as demais
-- partes da instrucao nao enxergam essas linhas pelo scan da tabela; por isso o
-- sino era criado, mas a entrega push podia nao ser enfileirada. A rota agora
-- persiste a inbox e cria as entregas em duas instrucoes sequenciais.

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
  v_amount numeric;
  v_amount_us text;
  v_amount_local text;
  v_currency text := upper(COALESCE(NULLIF(btrim(_currency), ''), 'BRL'));
BEGIN
  IF COALESCE(v_payload->>'item_count', '') ~ '^\d+$' THEN
    v_count := (v_payload->>'item_count')::integer;
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

  IF _event_type = 'schedule.daily_digest' THEN
    IF v_locale = 'en' THEN
      title := 'Today''s appointments';
      message := CASE
        WHEN v_scope = 'team' AND v_count = 1 THEN 'Your team has 1 appointment today.'
        WHEN v_scope = 'team' THEN 'Your team has ' || v_count::text || ' appointments today.'
        WHEN v_count = 1 THEN 'You have 1 appointment today.'
        ELSE 'You have ' || v_count::text || ' appointments today.'
      END;
    ELSIF v_locale = 'es' THEN
      title := 'Compromisos de hoy';
      message := CASE
        WHEN v_scope = 'team' AND v_count = 1 THEN 'Tu equipo tiene 1 compromiso hoy.'
        WHEN v_scope = 'team' THEN 'Tu equipo tiene ' || v_count::text || ' compromisos hoy.'
        WHEN v_count = 1 THEN 'Tienes 1 compromiso hoy.'
        ELSE 'Tienes ' || v_count::text || ' compromisos hoy.'
      END;
    ELSIF v_locale = 'fr' THEN
      title := 'Rendez-vous d’aujourd’hui';
      message := CASE
        WHEN v_scope = 'team' AND v_count = 1 THEN 'Votre équipe a 1 rendez-vous aujourd’hui.'
        WHEN v_scope = 'team' THEN 'Votre équipe a ' || v_count::text || ' rendez-vous aujourd’hui.'
        WHEN v_count = 1 THEN 'Vous avez 1 rendez-vous aujourd’hui.'
        ELSE 'Vous avez ' || v_count::text || ' rendez-vous aujourd’hui.'
      END;
    ELSE
      title := 'Compromissos de hoje';
      message := CASE
        WHEN v_scope = 'team' AND v_count = 1 THEN 'Sua equipe tem 1 compromisso hoje.'
        WHEN v_scope = 'team' THEN 'Sua equipe tem ' || v_count::text || ' compromissos hoje.'
        WHEN v_count = 1 THEN 'Você tem 1 compromisso hoje.'
        ELSE 'Você tem ' || v_count::text || ' compromissos hoje.'
      END;
    END IF;
  ELSIF _event_type = 'billing.charge_paid' THEN
    IF v_locale = 'en' THEN
      title := 'Payment received';
      message := 'Payment' || CASE WHEN v_amount_local IS NOT NULL THEN ' of ' || v_amount_local ELSE '' END
        || ' received' || CASE WHEN v_customer IS NOT NULL THEN ' from ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'es' THEN
      title := 'Pago recibido';
      message := 'Pago' || CASE WHEN v_amount_local IS NOT NULL THEN ' de ' || v_amount_local ELSE '' END
        || ' recibido' || CASE WHEN v_customer IS NOT NULL THEN ' de ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'fr' THEN
      title := 'Paiement reçu';
      message := 'Paiement' || CASE WHEN v_amount_local IS NOT NULL THEN ' de ' || v_amount_local ELSE '' END
        || ' reçu' || CASE WHEN v_customer IS NOT NULL THEN ' de ' || v_customer ELSE '' END || '.';
    ELSE
      title := 'Pagamento recebido';
      message := 'Pagamento' || CASE WHEN v_amount_local IS NOT NULL THEN ' de ' || v_amount_local ELSE '' END
        || ' recebido' || CASE WHEN v_customer IS NOT NULL THEN ' de ' || v_customer ELSE '' END || '.';
    END IF;
  ELSIF _event_type = 'portal.ticket_created' THEN
    IF v_locale = 'en' THEN
      title := 'New ticket' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Ticket' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END
        || ' opened' || CASE WHEN v_customer IS NOT NULL THEN ' by ' || v_customer ELSE ' through the customer portal' END
        || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END;
    ELSIF v_locale = 'es' THEN
      title := 'Nuevo llamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Llamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END
        || ' abierto' || CASE WHEN v_customer IS NOT NULL THEN ' por ' || v_customer ELSE ' desde el portal del cliente' END
        || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END;
    ELSIF v_locale = 'fr' THEN
      title := 'Nouvelle demande' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Demande' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END
        || ' ouverte' || CASE WHEN v_customer IS NOT NULL THEN ' par ' || v_customer ELSE ' depuis le portail client' END
        || CASE WHEN v_summary IS NOT NULL THEN ' : ' || v_summary ELSE '.' END;
    ELSE
      title := 'Novo chamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END;
      message := 'Chamado' || CASE WHEN v_order_number IS NOT NULL THEN ' #' || v_order_number ELSE '' END
        || ' aberto' || CASE WHEN v_customer IS NOT NULL THEN ' por ' || v_customer ELSE ' pelo portal do cliente' END
        || CASE WHEN v_summary IS NOT NULL THEN ': ' || v_summary ELSE '.' END;
    END IF;
  ELSIF _event_type = 'form.submission_received' THEN
    IF v_locale = 'en' THEN
      title := 'Form received';
      message := 'New response' || CASE WHEN v_form_title IS NOT NULL THEN ' to “' || v_form_title || '”' ELSE ' to a form' END
        || CASE WHEN v_customer IS NOT NULL THEN ', sent by ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'es' THEN
      title := 'Formulario recibido';
      message := 'Nueva respuesta' || CASE WHEN v_form_title IS NOT NULL THEN ' en «' || v_form_title || '»' ELSE ' de formulario' END
        || CASE WHEN v_customer IS NOT NULL THEN ', enviada por ' || v_customer ELSE '' END || '.';
    ELSIF v_locale = 'fr' THEN
      title := 'Formulaire reçu';
      message := 'Nouvelle réponse' || CASE WHEN v_form_title IS NOT NULL THEN ' au formulaire « ' || v_form_title || ' »' ELSE ' à un formulaire' END
        || CASE WHEN v_customer IS NOT NULL THEN ', envoyée par ' || v_customer ELSE '' END || '.';
    ELSE
      title := 'Formulário recebido';
      message := 'Nova resposta' || CASE WHEN v_form_title IS NOT NULL THEN ' em “' || v_form_title || '”' ELSE ' de formulário' END
        || CASE WHEN v_customer IS NOT NULL THEN ', enviada por ' || v_customer ELSE '' END || '.';
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

  IF v_event.event_type = 'schedule.daily_digest' THEN
    v_policy := '{"include_defaults":true,"user_ids":[],"permission_keys":[]}'::jsonb;
  END IF;

  -- Primeira instrucao: persiste uma copia ja localizada para cada usuario.
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
      COALESCE(pref.push_enabled, v_push) AS wants_push,
      CASE
        WHEN up.language IN ('pt-br', 'en', 'es', 'fr') THEN up.language
        WHEN cs.language IN ('pt-br', 'en', 'es', 'fr') THEN cs.language
        ELSE 'pt-br'
      END AS locale,
      COALESCE(NULLIF(cs.currency, ''), 'BRL') AS currency
    FROM candidate_ids c
    JOIN public.profiles p
      ON p.user_id = c.user_id
     AND p.company_id = v_event.company_id
     AND p.is_active
    LEFT JOIN public.user_preferences up ON up.user_id = p.user_id
    LEFT JOIN public.company_settings cs ON cs.company_id = v_event.company_id
    LEFT JOIN LATERAL (
      SELECT unp.in_app_enabled, unp.push_enabled
      FROM public.user_notification_preferences unp
      WHERE unp.company_id = v_event.company_id
        AND unp.user_id = p.user_id
        AND unp.event_type IN (v_event.event_type, '*')
      ORDER BY (unp.event_type = v_event.event_type) DESC
      LIMIT 1
    ) pref ON true
  )
  INSERT INTO public.user_notifications (
    user_id, company_id, event_id, dedupe_key, type, title, message,
    action_url, icon, category, priority, entity_type, entity_id,
    metadata, in_app_visible, expires_at
  )
  SELECT
    r.user_id, v_event.company_id, v_event.id, v_event.dedupe_key,
    v_event.event_type, localized.title, localized.message, v_event.action_url,
    v_event.icon, v_event.category, v_event.priority, v_event.source_type,
    v_event.source_id, v_event.payload, r.wants_in_app,
    now() + interval '90 days'
  FROM recipients r
  CROSS JOIN LATERAL public.localize_notification_content(
    v_event.event_type,
    v_event.payload,
    v_event.title,
    v_event.message,
    r.locale,
    r.currency
  ) localized
  WHERE r.wants_in_app OR r.wants_push
  ON CONFLICT (event_id, user_id) WHERE event_id IS NOT NULL DO NOTHING;

  -- Segunda instrucao: agora o scan enxerga inclusive as linhas recem-criadas.
  -- Isso tambem torna o retry idempotente quando a inbox existia, mas a entrega
  -- ainda nao havia sido enfileirada.
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
  ), push_recipients AS (
    SELECT DISTINCT p.user_id
    FROM candidate_ids c
    JOIN public.profiles p
      ON p.user_id = c.user_id
     AND p.company_id = v_event.company_id
     AND p.is_active
    LEFT JOIN LATERAL (
      SELECT unp.push_enabled
      FROM public.user_notification_preferences unp
      WHERE unp.company_id = v_event.company_id
        AND unp.user_id = p.user_id
        AND unp.event_type IN (v_event.event_type, '*')
      ORDER BY (unp.event_type = v_event.event_type) DESC
      LIMIT 1
    ) pref ON true
    WHERE COALESCE(pref.push_enabled, v_push)
  )
  INSERT INTO public.notification_deliveries (
    notification_id, subscription_id, next_attempt_at
  )
  SELECT n.id, s.id,
         public.notification_next_allowed_at(v_event.company_id, n.user_id, v_event.event_type, now())
  FROM public.user_notifications n
  JOIN push_recipients r ON r.user_id = n.user_id
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

COMMENT ON FUNCTION public.localize_notification_content(text, jsonb, text, text, text, text) IS
  'Monta titulo e mensagem por destinatario para pt-BR, ingles, espanhol ou frances; preserva fallback de eventos desconhecidos.';

COMMENT ON FUNCTION public.route_notification_event(uuid) IS
  'Aplica regras e preferencias por tenant, localiza a inbox por usuario e enfileira Web Push em instrucao posterior e idempotente.';
