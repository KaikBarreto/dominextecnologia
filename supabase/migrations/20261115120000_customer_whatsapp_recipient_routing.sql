-- Roteamento de destinatarios do WhatsApp por cliente e categoria.
--
-- Regras:
--   * sem rota explicita: preserva o telefone principal legado;
--   * rota explicita ativa: envia somente aos destinatarios selecionados;
--   * rota explicita inativa: nao envia a categoria;
--   * cargo do contato e apenas informativo, nunca decide o roteamento;
--   * cada telefone normalizado gera no maximo um job por evento.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Configuracao explicita por cliente/categoria e destinatarios selecionados
-- ---------------------------------------------------------------------------
CREATE TABLE public.customer_whatsapp_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  customer_id uuid NOT NULL,
  category    text NOT NULL CHECK (category IN ('service_order', 'billing')),
  enabled     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_whatsapp_routes_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers(id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT customer_whatsapp_routes_customer_category_key
    UNIQUE (customer_id, category)
);

CREATE INDEX customer_whatsapp_routes_company_idx
  ON public.customer_whatsapp_routes(company_id, customer_id);

CREATE TRIGGER set_updated_at_customer_whatsapp_routes
  BEFORE UPDATE ON public.customer_whatsapp_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_whatsapp_route_recipients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id            uuid NOT NULL REFERENCES public.customer_whatsapp_routes(id) ON DELETE CASCADE,
  recipient_kind      text NOT NULL CHECK (recipient_kind IN ('customer_primary', 'customer_contact')),
  customer_contact_id uuid REFERENCES public.customer_contacts(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_whatsapp_route_recipients_kind_check CHECK (
    (recipient_kind = 'customer_primary' AND customer_contact_id IS NULL)
    OR
    (recipient_kind = 'customer_contact' AND customer_contact_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX customer_whatsapp_route_one_primary_idx
  ON public.customer_whatsapp_route_recipients(route_id)
  WHERE recipient_kind = 'customer_primary';

CREATE UNIQUE INDEX customer_whatsapp_route_contact_unique_idx
  ON public.customer_whatsapp_route_recipients(route_id, customer_contact_id)
  WHERE recipient_kind = 'customer_contact';

CREATE INDEX customer_whatsapp_route_recipients_contact_idx
  ON public.customer_whatsapp_route_recipients(customer_contact_id)
  WHERE customer_contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_customer_whatsapp_route_recipient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_customer_id uuid;
BEGIN
  IF NEW.recipient_kind = 'customer_primary' THEN
    RETURN NEW;
  END IF;

  SELECT r.customer_id INTO v_customer_id
    FROM public.customer_whatsapp_routes r
   WHERE r.id = NEW.route_id;

  IF v_customer_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.customer_contacts cc
     WHERE cc.id = NEW.customer_contact_id
       AND cc.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION 'Contato nao pertence ao cliente da rota de WhatsApp'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_customer_whatsapp_route_recipient
  BEFORE INSERT OR UPDATE OF route_id, recipient_kind, customer_contact_id
  ON public.customer_whatsapp_route_recipients
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_whatsapp_route_recipient();

ALTER TABLE public.customer_whatsapp_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_whatsapp_route_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_customer_whatsapp_routes"
  ON public.customer_whatsapp_routes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view whatsapp routes from their company"
  ON public.customer_whatsapp_routes FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND (
        category <> 'billing'
        OR public.is_admin_or_gestor(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:view_customer_financial')
        OR public.user_has_permission(auth.uid(), 'fn:manage_finance')
        OR public.user_has_permission(auth.uid(), 'fn:export_company_data')
      )
    )
  );

CREATE POLICY "service_role_full_access_customer_whatsapp_route_recipients"
  ON public.customer_whatsapp_route_recipients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view whatsapp route recipients from their company"
  ON public.customer_whatsapp_route_recipients FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.customer_whatsapp_routes r
       WHERE r.id = route_id
         AND r.company_id = public.get_user_company_id(auth.uid())
         AND public.tenant_subscription_allows_access(r.company_id)
         AND (
           r.category <> 'billing'
           OR public.is_admin_or_gestor(auth.uid())
           OR public.user_has_permission(auth.uid(), 'fn:view_customer_financial')
           OR public.user_has_permission(auth.uid(), 'fn:manage_finance')
           OR public.user_has_permission(auth.uid(), 'fn:export_company_data')
         )
    )
  );

-- Super admin consegue operar a ficha de qualquer tenant, mas a policy antiga
-- dos opt-outs escondia todas as linhas dele. A UI filtra explicitamente pelo
-- company_id do cliente; a policy apenas concede a leitura administrativa.
DROP POLICY IF EXISTS "Users can view whatsapp opt-outs from their company"
  ON public.whatsapp_opt_outs;
CREATE POLICY "Users can view whatsapp opt-outs from their company"
  ON public.whatsapp_opt_outs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.customer_whatsapp_routes, public.customer_whatsapp_route_recipients
  FROM authenticated, anon;
GRANT SELECT ON public.customer_whatsapp_routes, public.customer_whatsapp_route_recipients
  TO authenticated;

COMMENT ON TABLE public.customer_whatsapp_routes IS
  'Configuracao explicita de destinatarios de WhatsApp por cliente e categoria. Ausencia de linha preserva o telefone principal legado.';
COMMENT ON TABLE public.customer_whatsapp_route_recipients IS
  'Destinatarios escolhidos explicitamente. O cargo do contato nao participa do roteamento.';

-- ---------------------------------------------------------------------------
-- 2) Escrita atomica e autorizada. Componentes nao escrevem nas tabelas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_customer_whatsapp_route(
  p_customer_id uuid,
  p_category text,
  p_enabled boolean,
  p_include_primary boolean,
  p_contact_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_company_id uuid;
  v_company_id uuid;
  v_route_id uuid;
  v_contact_ids uuid[];
  v_contact_count integer;
  v_allowed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;
  IF p_category NOT IN ('service_order', 'billing') THEN
    RAISE EXCEPTION 'Categoria de mensagem invalida' USING ERRCODE = '22023';
  END IF;

  v_user_company_id := public.get_user_company_id(v_user_id);
  IF public.is_super_admin(v_user_id) THEN
    SELECT c.company_id INTO v_company_id
      FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.is_deleted IS FALSE;
  ELSE
    SELECT c.company_id INTO v_company_id
      FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = v_user_company_id
       AND c.is_deleted IS FALSE;
  END IF;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF public.is_super_admin(v_user_id) IS NOT TRUE THEN
    IF public.tenant_subscription_allows_access(v_company_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Sem acesso ao cliente' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_allowed := public.is_super_admin(v_user_id)
    OR public.is_admin_or_gestor(v_user_id)
    OR CASE p_category
         WHEN 'billing' THEN public.user_has_permission(v_user_id, 'fn:manage_finance')
         ELSE public.user_has_permission(v_user_id, 'fn:edit_customer')
       END;
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'Sem permissao para alterar destinatarios' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT contact_id ORDER BY contact_id), ARRAY[]::uuid[])
    INTO v_contact_ids
    FROM unnest(COALESCE(p_contact_ids, ARRAY[]::uuid[])) AS contact_id
   WHERE contact_id IS NOT NULL;

  SELECT count(*) INTO v_contact_count
    FROM public.customer_contacts cc
   WHERE cc.customer_id = p_customer_id
     AND cc.id = ANY(v_contact_ids);
  IF v_contact_count <> cardinality(v_contact_ids) THEN
    RAISE EXCEPTION 'Um ou mais contatos nao pertencem ao cliente' USING ERRCODE = '23514';
  END IF;

  IF COALESCE(p_enabled, false)
     AND COALESCE(p_include_primary, false) IS NOT TRUE
     AND cardinality(v_contact_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um destinatario para ativar a categoria'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.customer_whatsapp_routes (
    company_id, customer_id, category, enabled, created_by
  ) VALUES (
    v_company_id, p_customer_id, p_category, COALESCE(p_enabled, false), v_user_id
  )
  ON CONFLICT (customer_id, category) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        updated_at = now()
  RETURNING id INTO v_route_id;

  DELETE FROM public.customer_whatsapp_route_recipients rr
   WHERE rr.route_id = v_route_id;

  IF COALESCE(p_enabled, false) THEN
    IF COALESCE(p_include_primary, false) THEN
      INSERT INTO public.customer_whatsapp_route_recipients (
        route_id, recipient_kind, customer_contact_id
      ) VALUES (v_route_id, 'customer_primary', NULL);
    END IF;

    INSERT INTO public.customer_whatsapp_route_recipients (
      route_id, recipient_kind, customer_contact_id
    )
    SELECT v_route_id, 'customer_contact', contact_id
      FROM unnest(v_contact_ids) AS contact_id;
  END IF;

  RETURN v_route_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_customer_whatsapp_route(uuid,text,boolean,boolean,uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_whatsapp_route(uuid,text,boolean,boolean,uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.set_customer_whatsapp_route(uuid,text,boolean,boolean,uuid[]) IS
  'Configura atomicamente destinatarios por cliente/categoria, valida tenant, assinatura, contatos e permissao funcional.';

-- ---------------------------------------------------------------------------
-- 3) Identidade do destinatario na fila e na auditoria
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_send_jobs
  ADD COLUMN recipient_kind text NOT NULL DEFAULT 'customer_primary',
  ADD COLUMN customer_contact_id uuid,
  ADD COLUMN recipient_route_id uuid,
  ADD CONSTRAINT whatsapp_send_jobs_recipient_kind_check
    CHECK (recipient_kind IN ('customer_primary', 'customer_contact')),
  ADD CONSTRAINT whatsapp_send_jobs_customer_contact_id_fkey
    FOREIGN KEY (customer_contact_id) REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  ADD CONSTRAINT whatsapp_send_jobs_recipient_route_id_fkey
    FOREIGN KEY (recipient_route_id) REFERENCES public.customer_whatsapp_routes(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_events
  ADD COLUMN recipient_kind text NOT NULL DEFAULT 'customer_primary',
  ADD COLUMN customer_contact_id uuid,
  ADD COLUMN recipient_route_id uuid,
  ADD CONSTRAINT whatsapp_events_recipient_kind_check
    CHECK (recipient_kind IN ('customer_primary', 'customer_contact')),
  ADD CONSTRAINT whatsapp_events_customer_contact_id_fkey
    FOREIGN KEY (customer_contact_id) REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  ADD CONSTRAINT whatsapp_events_recipient_route_id_fkey
    FOREIGN KEY (recipient_route_id) REFERENCES public.customer_whatsapp_routes(id) ON DELETE SET NULL;

CREATE INDEX whatsapp_send_jobs_customer_contact_idx
  ON public.whatsapp_send_jobs(customer_contact_id)
  WHERE customer_contact_id IS NOT NULL;
CREATE INDEX whatsapp_events_customer_contact_idx
  ON public.whatsapp_events(customer_contact_id)
  WHERE customer_contact_id IS NOT NULL;

-- Nao exigimos customer_contact_id NOT NULL nos historicos: a FK usa
-- ON DELETE SET NULL para que excluir um contato nao apague nem bloqueie jobs
-- e eventos ja registrados. recipient_kind preserva a origem do destinatario.

-- ---------------------------------------------------------------------------
-- 4) Fonte canonica server-side dos destinatarios atuais
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_resolve_recipients(
  p_company_id uuid,
  p_customer_id uuid,
  p_event_key text
)
RETURNS TABLE (
  recipient_kind text,
  customer_contact_id uuid,
  recipient_route_id uuid,
  recipient_name text,
  raw_phone text,
  normalized_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH input AS (
    SELECT CASE
      WHEN p_event_key LIKE 'os.%' THEN 'service_order'
      WHEN p_event_key LIKE 'billing.%' THEN 'billing'
      ELSE NULL
    END AS category
  ), customer_row AS (
    SELECT c.id, c.name, c.phone, c.celular
      FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = p_company_id
       AND c.is_deleted IS FALSE
       AND c.whatsapp_notifications_enabled IS TRUE
       AND public.tenant_subscription_allows_access(p_company_id)
  ), route_row AS (
    SELECT r.id, r.enabled
      FROM public.customer_whatsapp_routes r
      JOIN input i ON i.category = r.category
     WHERE r.company_id = p_company_id
       AND r.customer_id = p_customer_id
  ), candidates AS (
    -- Compatibilidade: somente a ausencia de rota usa o principal legado.
    SELECT 'customer_primary'::text AS recipient_kind,
           NULL::uuid AS customer_contact_id,
           NULL::uuid AS recipient_route_id,
           c.name AS recipient_name,
           COALESCE(NULLIF(btrim(c.celular), ''), c.phone) AS raw_phone,
           0 AS priority
      FROM customer_row c
     WHERE NOT EXISTS (SELECT 1 FROM route_row)

    UNION ALL

    SELECT rr.recipient_kind,
           rr.customer_contact_id,
           r.id AS recipient_route_id,
           CASE rr.recipient_kind
             WHEN 'customer_primary' THEN c.name
             ELSE cc.name
           END AS recipient_name,
           CASE rr.recipient_kind
             WHEN 'customer_primary' THEN COALESCE(NULLIF(btrim(c.celular), ''), c.phone)
             ELSE cc.phone
           END AS raw_phone,
           CASE rr.recipient_kind WHEN 'customer_primary' THEN 0 ELSE 1 END AS priority
      FROM route_row r
      JOIN customer_row c ON true
      JOIN public.customer_whatsapp_route_recipients rr ON rr.route_id = r.id
      LEFT JOIN public.customer_contacts cc
        ON cc.id = rr.customer_contact_id
       AND cc.customer_id = p_customer_id
     WHERE r.enabled IS TRUE
       AND (
         rr.recipient_kind = 'customer_primary'
         OR (rr.recipient_kind = 'customer_contact' AND cc.id IS NOT NULL)
       )
  ), normalized AS (
    SELECT c.*,
           public.whatsapp_normalize_phone(p_company_id, c.raw_phone) AS normalized_phone
      FROM candidates c
  ), eligible AS (
    SELECT n.*
      FROM normalized n
     WHERE n.normalized_phone IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.whatsapp_opt_outs o
          WHERE o.company_id = p_company_id
            AND o.phone = n.normalized_phone
       )
  )
  SELECT DISTINCT ON (e.normalized_phone)
         e.recipient_kind,
         e.customer_contact_id,
         e.recipient_route_id,
         e.recipient_name,
         e.raw_phone,
         e.normalized_phone
    FROM eligible e
   ORDER BY e.normalized_phone, e.priority, e.customer_contact_id NULLS FIRST;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_resolve_recipients(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_resolve_recipients(uuid,uuid,text)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_resolve_recipients(uuid,uuid,text) IS
  'Resolve destinatarios no servidor: legado apenas sem rota, rota explicita sem fallback, opt-out por telefone e deduplicacao por numero normalizado.';

-- ---------------------------------------------------------------------------
-- 5) Enfileiramento transacional com fan-out por telefone
-- ---------------------------------------------------------------------------
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
AS $function$
DECLARE
  v_connection public.whatsapp_connections%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_recipient record;
  v_inserted_id uuid;
  v_first_job_id uuid;
  v_enabled boolean := false;
  v_recipient_dedupe text;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  IF public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings
   WHERE company_id = p_company_id;
  IF v_settings.id IS NULL OR v_settings.enabled IS NOT TRUE
     OR v_settings.active_connection_id IS NULL THEN
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
       AND c.is_deleted IS FALSE
       AND c.whatsapp_notifications_enabled IS TRUE
  ) THEN RETURN NULL; END IF;

  IF p_event_key LIKE 'os.%' THEN
    v_enabled := CASE p_event_key
      WHEN 'os.a_caminho' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,a_caminho,enabled}')::boolean, v_settings.trigger_a_caminho)
      WHEN 'os.em_andamento' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,em_andamento,enabled}')::boolean, v_settings.trigger_em_andamento)
      WHEN 'os.concluida' THEN COALESCE((v_settings.automation_preferences #>> '{os,events,concluida,enabled}')::boolean, v_settings.trigger_concluida)
      ELSE false END;
  ELSIF p_event_key LIKE 'billing.%' THEN
    v_enabled := COALESCE(
      (v_settings.automation_preferences #>> ARRAY['billing','events',split_part(p_event_key,'.',2),'enabled'])::boolean,
      false
    );
  ELSE
    RETURN NULL;
  END IF;
  IF v_enabled IS NOT TRUE THEN RETURN NULL; END IF;

  FOR v_recipient IN
    SELECT *
      FROM public.whatsapp_resolve_recipients(p_company_id, p_customer_id, p_event_key)
  LOOP
    v_recipient_dedupe := format(
      '%s:recipient:%s',
      p_dedupe_key,
      md5(v_recipient.normalized_phone)
    );
    v_inserted_id := NULL;

    INSERT INTO public.whatsapp_send_jobs (
      company_id, connection_id, provider, customer_id, event_key,
      source_type, source_id, dedupe_key, next_attempt_at,
      recipient_kind, customer_contact_id, recipient_route_id
    ) VALUES (
      p_company_id, v_connection.id, v_connection.provider, p_customer_id, p_event_key,
      p_source_type, p_source_id, v_recipient_dedupe, COALESCE(p_next_attempt_at, now()),
      v_recipient.recipient_kind, v_recipient.customer_contact_id, v_recipient.recipient_route_id
    )
    ON CONFLICT (company_id, dedupe_key) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_first_job_id IS NULL AND v_inserted_id IS NOT NULL THEN
      v_first_job_id := v_inserted_id;
    END IF;
  END LOOP;

  RETURN v_first_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid,uuid,text,text,uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid,uuid,text,text,uuid,text,timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_enqueue_transactional_job(uuid,uuid,text,text,uuid,text,timestamptz) IS
  'Enfileira um job por telefone destinatario, com dedupe independente e roteamento resolvido exclusivamente no servidor.';

-- ---------------------------------------------------------------------------
-- 6) Lembrete agendado: fan-out preservando snapshot e idempotencia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(
  p_company_id uuid,
  p_customer_id uuid,
  p_source_id uuid,
  p_dedupe_key text,
  p_scheduled_at timestamptz,
  p_timing text,
  p_next_attempt_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_connection public.whatsapp_connections%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_recipient record;
  v_timezone text;
  v_scheduled_date date;
  v_scheduled_time time;
  v_expected_scheduled_at timestamptz;
  v_expected_dedupe_key text;
  v_recipient_dedupe text;
  v_inserted_id uuid;
  v_first_job_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_id IS NULL
     OR p_scheduled_at IS NULL OR p_timing NOT IN ('day_before', 'same_day') THEN
    RETURN NULL;
  END IF;
  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN RETURN NULL; END IF;
  IF public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings
   WHERE company_id = p_company_id
   FOR SHARE;
  IF v_settings.id IS NULL
     OR v_settings.enabled IS NOT TRUE
     OR v_settings.active_connection_id IS NULL
     OR COALESCE(v_settings.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false') <> 'true'
     OR (CASE
           WHEN v_settings.automation_preferences #>> '{os,events,scheduled_reminder,timing}' = 'same_day'
             THEN 'same_day'
           ELSE 'day_before'
         END) IS DISTINCT FROM p_timing THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_connection
    FROM public.whatsapp_connections
   WHERE id = v_settings.active_connection_id
     AND company_id = p_company_id
     AND status = 'connected'
     AND provider = 'evolution_qr';
  IF v_connection.id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = p_company_id
       AND c.is_deleted IS FALSE
       AND c.whatsapp_notifications_enabled IS TRUE
  ) THEN RETURN NULL; END IF;

  SELECT * INTO v_order
    FROM public.service_orders so
   WHERE so.id = p_source_id
     AND so.company_id = p_company_id
     AND so.customer_id = p_customer_id
     AND so.entry_type = 'os'
     AND so.status::text IN ('agendada', 'pendente')
   FOR SHARE;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;

  IF jsonb_array_length(v_order.schedule_plan) > 0 THEN
    v_scheduled_date := (v_order.schedule_plan->0->>'date')::date;
    v_scheduled_time := (v_order.schedule_plan->0->>'time')::time;
  ELSE
    v_scheduled_date := v_order.scheduled_date;
    v_scheduled_time := v_order.scheduled_time;
  END IF;
  IF v_scheduled_date IS NULL OR v_scheduled_time IS NULL THEN RETURN NULL; END IF;

  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN NULL; END IF;
  v_expected_scheduled_at := (v_scheduled_date + v_scheduled_time) AT TIME ZONE v_timezone;
  v_expected_dedupe_key := format(
    'os.scheduled_reminder:%s:at=%s:timing=%s',
    v_order.id,
    floor(EXTRACT(EPOCH FROM v_expected_scheduled_at))::bigint,
    p_timing
  );
  IF p_scheduled_at IS DISTINCT FROM v_expected_scheduled_at
     OR p_dedupe_key IS DISTINCT FROM v_expected_dedupe_key THEN
    RETURN NULL;
  END IF;

  FOR v_recipient IN
    SELECT *
      FROM public.whatsapp_resolve_recipients(
        p_company_id, p_customer_id, 'os.scheduled_reminder'
      )
  LOOP
    v_recipient_dedupe := format(
      '%s:recipient:%s',
      p_dedupe_key,
      md5(v_recipient.normalized_phone)
    );
    v_inserted_id := NULL;

    INSERT INTO public.whatsapp_send_jobs (
      company_id, connection_id, provider, customer_id, event_key,
      source_type, source_id, dedupe_key, next_attempt_at,
      schedule_snapshot_at, schedule_snapshot_timing,
      recipient_kind, customer_contact_id, recipient_route_id
    ) VALUES (
      p_company_id, v_connection.id, v_connection.provider, p_customer_id,
      'os.scheduled_reminder', 'service_order', p_source_id, v_recipient_dedupe,
      COALESCE(p_next_attempt_at, now()), p_scheduled_at, p_timing,
      v_recipient.recipient_kind, v_recipient.customer_contact_id, v_recipient.recipient_route_id
    )
    ON CONFLICT (company_id, dedupe_key) DO UPDATE
      SET connection_id = EXCLUDED.connection_id,
          provider = EXCLUDED.provider,
          customer_id = EXCLUDED.customer_id,
          recipient_kind = EXCLUDED.recipient_kind,
          customer_contact_id = EXCLUDED.customer_contact_id,
          recipient_route_id = EXCLUDED.recipient_route_id,
          status = 'pending',
          attempts = 0,
          defers = 0,
          next_attempt_at = EXCLUDED.next_attempt_at,
          locked_at = NULL,
          dispatch_started_at = NULL,
          last_error_code = NULL,
          last_error = NULL,
          schedule_snapshot_at = EXCLUDED.schedule_snapshot_at,
          schedule_snapshot_timing = EXCLUDED.schedule_snapshot_timing
    WHERE whatsapp_send_jobs.status = 'cancelled'
      AND whatsapp_send_jobs.sent_at IS NULL
      AND whatsapp_send_jobs.provider_message_id IS NULL
      AND whatsapp_send_jobs.attempts = 0
    RETURNING id INTO v_inserted_id;

    IF v_first_job_id IS NULL AND v_inserted_id IS NOT NULL THEN
      v_first_job_id := v_inserted_id;
    END IF;
  END LOOP;

  RETURN v_first_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(uuid,uuid,uuid,text,timestamptz,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(uuid,uuid,uuid,text,timestamptz,text,timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job(uuid,uuid,uuid,text,timestamptz,text,timestamptz) IS
  'Enfileira um lembrete agendado por telefone selecionado, preservando snapshot, janela e idempotencia.';

-- ---------------------------------------------------------------------------
-- 7) Revalidacao final do lembrete contra a rota e o telefone atuais
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_validate_scheduled_os_reminder(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_settings public.company_whatsapp_settings%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_connection public.whatsapp_connections%ROWTYPE;
  v_recipient record;
  v_timezone text;
  v_local_now timestamp;
  v_timing text;
  v_offset integer;
  v_scheduled_at timestamptz;
  v_expected_dedupe_base text;
  v_expected_dedupe_recipient text;
  v_phone text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.event_key = 'os.scheduled_reminder'
     AND j.source_type = 'service_order'
     AND j.status = 'processing';
  IF v_job.id IS NULL THEN RETURN 'job_unavailable'; END IF;

  SELECT * INTO v_order
    FROM public.service_orders so
   WHERE so.id = v_job.source_id
     AND so.company_id = p_company_id
     AND so.entry_type = 'os';
  IF v_order.id IS NULL THEN RETURN 'source_unavailable'; END IF;
  IF v_job.customer_id IS DISTINCT FROM v_order.customer_id THEN RETURN 'customer_changed'; END IF;

  IF public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE THEN
    RETURN 'module_inactive';
  END IF;
  IF public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE THEN
    RETURN 'subscription_inactive';
  END IF;

  SELECT * INTO v_settings
    FROM public.company_whatsapp_settings s
   WHERE s.company_id = p_company_id
     AND s.enabled IS TRUE;
  IF v_settings.id IS NULL THEN RETURN 'automation_disabled'; END IF;
  IF v_settings.active_connection_id IS DISTINCT FROM v_job.connection_id THEN
    RETURN 'connection_changed';
  END IF;
  IF COALESCE(v_settings.automation_preferences #>> '{os,events,scheduled_reminder,enabled}', 'false') <> 'true' THEN
    RETURN 'automation_disabled';
  END IF;

  SELECT * INTO v_connection
    FROM public.whatsapp_connections c
   WHERE c.id = v_job.connection_id
     AND c.company_id = p_company_id
     AND c.provider = v_job.provider
     AND c.status = 'connected';
  IF v_connection.id IS NULL THEN RETURN 'connection_unavailable'; END IF;

  SELECT * INTO v_customer
    FROM public.customers c
   WHERE c.id = v_order.customer_id
     AND c.company_id = p_company_id
     AND c.is_deleted IS FALSE;
  IF v_customer.id IS NULL OR v_customer.whatsapp_notifications_enabled IS NOT TRUE THEN
    RETURN 'customer_opt_out';
  END IF;

  SELECT * INTO v_recipient
    FROM public.whatsapp_resolve_recipients(
      p_company_id, v_order.customer_id, 'os.scheduled_reminder'
    ) r
   WHERE r.recipient_kind = v_job.recipient_kind
     AND r.customer_contact_id IS NOT DISTINCT FROM v_job.customer_contact_id
   LIMIT 1;
  IF v_recipient.normalized_phone IS NULL THEN RETURN 'recipient_unavailable'; END IF;

  v_phone := v_recipient.normalized_phone;
  IF v_phone IS DISTINCT FROM regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') THEN
    RETURN 'recipient_phone_changed';
  END IF;

  IF v_order.status::text NOT IN ('agendada', 'pendente') THEN RETURN 'status_changed'; END IF;
  IF jsonb_array_length(v_order.schedule_plan) > 0 THEN
    v_order.scheduled_date := (v_order.schedule_plan->0->>'date')::date;
    v_order.scheduled_time := (v_order.schedule_plan->0->>'time')::time;
  END IF;
  IF v_order.scheduled_date IS NULL OR v_order.scheduled_time IS NULL THEN
    RETURN 'schedule_unavailable';
  END IF;

  v_timing := CASE
    WHEN v_settings.automation_preferences #>> '{os,events,scheduled_reminder,timing}' = 'same_day'
      THEN 'same_day'
    ELSE 'day_before'
  END;
  v_offset := CASE WHEN v_timing = 'same_day' THEN 0 ELSE 1 END;
  v_timezone := public.whatsapp_company_timezone(p_company_id);
  IF v_timezone IS NULL THEN RETURN 'timezone_unavailable'; END IF;
  v_scheduled_at := (v_order.scheduled_date + v_order.scheduled_time) AT TIME ZONE v_timezone;
  v_expected_dedupe_base := format(
    'os.scheduled_reminder:%s:at=%s:timing=%s',
    v_order.id,
    floor(EXTRACT(EPOCH FROM v_scheduled_at))::bigint,
    v_timing
  );
  v_expected_dedupe_recipient := format(
    '%s:recipient:%s',
    v_expected_dedupe_base,
    md5(v_phone)
  );

  -- Jobs criados antes desta migration possuem apenas a chave base e, por
  -- compatibilidade, continuam validos se o principal ainda estiver roteado.
  IF v_job.dedupe_key IS DISTINCT FROM v_expected_dedupe_base
     AND v_job.dedupe_key IS DISTINCT FROM v_expected_dedupe_recipient THEN
    RETURN 'schedule_changed';
  END IF;
  IF v_job.schedule_snapshot_at IS DISTINCT FROM v_scheduled_at
     OR v_job.schedule_snapshot_timing IS DISTINCT FROM v_timing THEN
    RETURN 'schedule_changed';
  END IF;

  v_local_now := now() AT TIME ZONE v_timezone;
  IF v_order.scheduled_date IS DISTINCT FROM (v_local_now::date + v_offset) THEN
    RETURN 'reminder_day_passed';
  END IF;
  IF v_offset = 0 AND now() >= v_scheduled_at THEN
    RETURN 'appointment_passed';
  END IF;

  RETURN 'valid';
END;
$function$;

COMMENT ON FUNCTION public.whatsapp_validate_scheduled_os_reminder(uuid,uuid,text) IS
  'Revalida tenant, rota, destinatario, opt-out, telefone, status e agenda imediatamente antes do envio.';

REVOKE ALL ON FUNCTION public.whatsapp_validate_scheduled_os_reminder(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_validate_scheduled_os_reminder(uuid,uuid,text)
  TO service_role;

-- O marco de despacho vale para QUALQUER evento. Depois deste commit a chamada
-- externa pode ter sido aceita; a recuperacao de orfaos deve falhar como
-- delivery_unknown, nunca reenfileirar automaticamente. O lembrete agendado
-- preserva sua revalidacao especializada dentro da mesma transacao.
CREATE OR REPLACE FUNCTION public.whatsapp_begin_send_job_dispatch(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
  v_validation text;
BEGIN
  SELECT * INTO v_job
    FROM public.whatsapp_send_jobs j
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.status = 'processing'
   FOR UPDATE;
  IF v_job.id IS NULL OR v_job.dispatch_started_at IS NOT NULL THEN
    RETURN 'job_unavailable';
  END IF;

  IF v_job.event_key = 'os.scheduled_reminder' THEN
    v_validation := public.whatsapp_validate_scheduled_os_reminder(
      p_job_id, p_company_id, p_phone
    );
    IF v_validation IS DISTINCT FROM 'valid' THEN RETURN v_validation; END IF;
  END IF;

  UPDATE public.whatsapp_send_jobs j
     SET dispatch_started_at = now(),
         locked_at = now()
   WHERE j.id = v_job.id
     AND j.company_id = v_job.company_id
     AND j.status = 'processing'
     AND j.dispatch_started_at IS NULL;
  IF NOT FOUND THEN RETURN 'job_unavailable'; END IF;
  RETURN 'ready';
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid,uuid,text)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_begin_send_job_dispatch(uuid,uuid,text) IS
  'Marca de forma duravel o inicio de qualquer envio externo; lembretes agendados sao revalidados antes do marco.';

-- Compatibilidade com o worker anterior durante rollout: a assinatura antiga
-- delega ao contrato generico e mantem a mesma resposta textual.
CREATE OR REPLACE FUNCTION public.whatsapp_begin_scheduled_os_dispatch(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.whatsapp_begin_send_job_dispatch(p_job_id, p_company_id, p_phone);
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_begin_scheduled_os_dispatch(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_begin_scheduled_os_dispatch(uuid,uuid,text)
  TO service_role;

-- Job, auditoria e cadencia sao finalizados em uma unica transacao para todos
-- os eventos. Se qualquer escrita falhar, o marker permanece em processing e
-- a recuperacao o classifica como delivery_unknown, impedindo duplicidade.
CREATE OR REPLACE FUNCTION public.whatsapp_finalize_send_job(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text,
  p_provider_message_id text,
  p_sent_at timestamptz,
  p_next_send_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job public.whatsapp_send_jobs%ROWTYPE;
BEGIN
  UPDATE public.whatsapp_send_jobs j
     SET status = 'sent',
         locked_at = NULL,
         sent_at = p_sent_at,
         provider_message_id = p_provider_message_id,
         last_error = NULL,
         last_error_code = NULL
   WHERE j.id = p_job_id
     AND j.company_id = p_company_id
     AND j.status = 'processing'
     AND j.dispatch_started_at IS NOT NULL
  RETURNING j.* INTO v_job;
  IF v_job.id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.whatsapp_events (
    company_id, job_id, connection_id, provider, trigger, os_id,
    phone, status, error, sent_at, provider_message_id,
    recipient_kind, customer_contact_id, recipient_route_id
  ) VALUES (
    v_job.company_id, v_job.id, v_job.connection_id, v_job.provider,
    v_job.event_key,
    CASE WHEN v_job.source_type = 'service_order' THEN v_job.source_id ELSE NULL END,
    p_phone, 'enviado', NULL,
    p_sent_at, p_provider_message_id,
    v_job.recipient_kind, v_job.customer_contact_id, v_job.recipient_route_id
  )
  ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO UPDATE
    SET phone = EXCLUDED.phone,
        status = 'enviado',
        error = NULL,
        sent_at = EXCLUDED.sent_at,
        provider_message_id = EXCLUDED.provider_message_id,
        recipient_kind = EXCLUDED.recipient_kind,
        customer_contact_id = EXCLUDED.customer_contact_id,
        recipient_route_id = EXCLUDED.recipient_route_id;

  UPDATE public.whatsapp_connections c
     SET next_send_at = p_next_send_at,
         consecutive_failures = 0,
         last_error = NULL,
         last_seen_at = p_sent_at
   WHERE c.id = v_job.connection_id
     AND c.company_id = v_job.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conexao do job de WhatsApp nao encontrada na finalizacao';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_finalize_send_job(uuid,uuid,text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_finalize_send_job(uuid,uuid,text,text,timestamptz,timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_finalize_send_job(uuid,uuid,text,text,timestamptz,timestamptz) IS
  'Finaliza job, evento, destinatario e cadencia em uma unica transacao para qualquer evento.';

-- Compatibilidade com o worker anterior durante rollout.
CREATE OR REPLACE FUNCTION public.whatsapp_finalize_scheduled_os_reminder(
  p_job_id uuid,
  p_company_id uuid,
  p_phone text,
  p_provider_message_id text,
  p_sent_at timestamptz,
  p_next_send_at timestamptz
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.whatsapp_finalize_send_job(
    p_job_id,
    p_company_id,
    p_phone,
    p_provider_message_id,
    p_sent_at,
    p_next_send_at
  );
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_finalize_scheduled_os_reminder(uuid,uuid,text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_finalize_scheduled_os_reminder(uuid,uuid,text,text,timestamptz,timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.whatsapp_finalize_scheduled_os_reminder(uuid,uuid,text,text,timestamptz,timestamptz) IS
  'Wrapper retrocompativel da finalizacao transacional generica.';

COMMIT;
