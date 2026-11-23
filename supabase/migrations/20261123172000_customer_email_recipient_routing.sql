-- Destinatarios e eventos de cobranca por email, configuraveis por cliente.
--
-- Regras:
--   * sem rota explicita: o email principal recebe todos os eventos globais ativos;
--   * rota explicita ativa: cada destinatario recebe apenas os eventos escolhidos;
--   * rota explicita inativa: o cliente nao recebe emails de cobranca;
--   * o canal e os eventos globais da empresa continuam sendo o limite mestre;
--   * identidade e evento sao revalidados no servidor, sempre no tenant da cobranca.

BEGIN;

CREATE TABLE public.customer_email_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  customer_id uuid NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_email_routes_customer_company_fkey
    FOREIGN KEY (customer_id, company_id)
    REFERENCES public.customers(id, company_id)
    ON DELETE CASCADE,
  CONSTRAINT customer_email_routes_customer_key UNIQUE (customer_id)
);

CREATE INDEX customer_email_routes_company_idx
  ON public.customer_email_routes(company_id, customer_id);

CREATE TRIGGER set_customer_email_routes_updated_at
  BEFORE UPDATE ON public.customer_email_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_email_route_recipients (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id                   uuid NOT NULL REFERENCES public.customer_email_routes(id) ON DELETE CASCADE,
  recipient_kind             text NOT NULL CHECK (recipient_kind IN ('customer_primary', 'customer_contact')),
  customer_contact_id        uuid REFERENCES public.customer_contacts(id) ON DELETE CASCADE,
  charge_created_enabled     boolean NOT NULL DEFAULT true,
  due_reminder_enabled       boolean NOT NULL DEFAULT true,
  charge_overdue_enabled     boolean NOT NULL DEFAULT true,
  charge_paid_enabled        boolean NOT NULL DEFAULT true,
  charge_refunded_enabled    boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_email_route_recipients_kind_check CHECK (
    (recipient_kind = 'customer_primary' AND customer_contact_id IS NULL)
    OR
    (recipient_kind = 'customer_contact' AND customer_contact_id IS NOT NULL)
  ),
  CONSTRAINT customer_email_route_recipients_event_check CHECK (
    charge_created_enabled OR due_reminder_enabled OR charge_overdue_enabled
    OR charge_paid_enabled OR charge_refunded_enabled
  )
);

CREATE UNIQUE INDEX customer_email_route_one_primary_idx
  ON public.customer_email_route_recipients(route_id)
  WHERE recipient_kind = 'customer_primary';
CREATE UNIQUE INDEX customer_email_route_contact_unique_idx
  ON public.customer_email_route_recipients(route_id, customer_contact_id)
  WHERE recipient_kind = 'customer_contact';
CREATE INDEX customer_email_route_recipients_contact_idx
  ON public.customer_email_route_recipients(customer_contact_id)
  WHERE customer_contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_customer_email_route_recipient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_customer_id uuid;
BEGIN
  IF NEW.recipient_kind = 'customer_primary' THEN
    RETURN NEW;
  END IF;

  SELECT r.customer_id INTO v_customer_id
    FROM public.customer_email_routes r
   WHERE r.id = NEW.route_id;

  IF v_customer_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.customer_contacts cc
     WHERE cc.id = NEW.customer_contact_id
       AND cc.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'O contato selecionado não pertence a este cliente.',
      DETAIL = 'code=customer_email_contact_mismatch';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER guard_customer_email_route_recipient
  BEFORE INSERT OR UPDATE OF route_id, recipient_kind, customer_contact_id
  ON public.customer_email_route_recipients
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_email_route_recipient();

ALTER TABLE public.customer_email_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_email_route_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_manages_customer_email_routes
  ON public.customer_email_routes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY users_view_customer_email_routes_from_company
  ON public.customer_email_routes FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND (
        public.is_admin_or_gestor(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:view_customer_financial')
        OR public.user_has_permission(auth.uid(), 'fn:manage_finance')
        OR public.user_has_permission(auth.uid(), 'fn:export_company_data')
      )
    )
  );

CREATE POLICY service_role_manages_customer_email_route_recipients
  ON public.customer_email_route_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY users_view_customer_email_route_recipients_from_company
  ON public.customer_email_route_recipients FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.customer_email_routes r
       WHERE r.id = route_id
         AND r.company_id = public.get_user_company_id(auth.uid())
         AND public.tenant_subscription_allows_access(r.company_id)
         AND (
           public.is_admin_or_gestor(auth.uid())
           OR public.user_has_permission(auth.uid(), 'fn:view_customer_financial')
           OR public.user_has_permission(auth.uid(), 'fn:manage_finance')
           OR public.user_has_permission(auth.uid(), 'fn:export_company_data')
         )
    )
  );

REVOKE ALL ON public.customer_email_routes, public.customer_email_route_recipients
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_email_routes, public.customer_email_route_recipients
  TO authenticated;

COMMENT ON TABLE public.customer_email_routes IS
  'Opt-out e personalizacao de emails de cobranca por cliente. Ausencia de linha preserva o email principal legado.';
COMMENT ON TABLE public.customer_email_route_recipients IS
  'Destinatarios escolhidos e eventos financeiros autorizados individualmente.';

ALTER TABLE public.customer_email_deliveries
  ADD COLUMN recipient_kind text NOT NULL DEFAULT 'customer_primary'
    CHECK (recipient_kind IN ('customer_primary', 'customer_contact')),
  ADD COLUMN customer_contact_id uuid REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  ADD COLUMN recipient_route_id uuid REFERENCES public.customer_email_routes(id) ON DELETE SET NULL;

CREATE INDEX customer_email_deliveries_contact_idx
  ON public.customer_email_deliveries(customer_contact_id)
  WHERE customer_contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.email_resolve_recipients(
  p_company_id uuid,
  p_customer_id uuid,
  p_event_type text
)
RETURNS TABLE (
  recipient_kind text,
  customer_contact_id uuid,
  recipient_route_id uuid,
  recipient_name text,
  recipient_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  WITH customer_row AS (
    SELECT c.id, c.name, c.email
      FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = p_company_id
       AND c.is_deleted IS FALSE
  ), route_row AS (
    SELECT r.id, r.enabled
      FROM public.customer_email_routes r
     WHERE r.company_id = p_company_id
       AND r.customer_id = p_customer_id
  ), candidates AS (
    SELECT 'customer_primary'::text AS recipient_kind,
           NULL::uuid AS customer_contact_id,
           NULL::uuid AS recipient_route_id,
           c.name AS recipient_name,
           c.email AS raw_email,
           true AS charge_created_enabled,
           true AS due_reminder_enabled,
           true AS charge_overdue_enabled,
           true AS charge_paid_enabled,
           true AS charge_refunded_enabled,
           0 AS priority
      FROM customer_row c
     WHERE NOT EXISTS (SELECT 1 FROM route_row)
    UNION ALL
    SELECT rr.recipient_kind,
           rr.customer_contact_id,
           r.id,
           CASE WHEN rr.recipient_kind = 'customer_primary' THEN c.name ELSE cc.name END,
           CASE WHEN rr.recipient_kind = 'customer_primary' THEN c.email ELSE cc.email END,
           rr.charge_created_enabled,
           rr.due_reminder_enabled,
           rr.charge_overdue_enabled,
           rr.charge_paid_enabled,
           rr.charge_refunded_enabled,
           CASE WHEN rr.recipient_kind = 'customer_primary' THEN 0 ELSE 1 END
      FROM route_row r
      JOIN customer_row c ON true
      JOIN public.customer_email_route_recipients rr ON rr.route_id = r.id
      LEFT JOIN public.customer_contacts cc
        ON cc.id = rr.customer_contact_id AND cc.customer_id = c.id
     WHERE r.enabled
  ), valid AS (
    SELECT *, lower(btrim(raw_email)) AS normalized_email
      FROM candidates
     WHERE NULLIF(btrim(raw_email), '') IS NOT NULL
       AND char_length(btrim(raw_email)) <= 254
       AND btrim(raw_email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       AND CASE p_event_type
         WHEN 'charge_created' THEN charge_created_enabled
         WHEN 'charge_due_reminder' THEN due_reminder_enabled
         WHEN 'charge_overdue' THEN charge_overdue_enabled
         WHEN 'charge_paid' THEN charge_paid_enabled
         WHEN 'charge_refunded' THEN charge_refunded_enabled
         ELSE false
       END
  )
  SELECT DISTINCT ON (normalized_email)
         recipient_kind, customer_contact_id, recipient_route_id,
         recipient_name, normalized_email
    FROM valid
   ORDER BY normalized_email, priority, customer_contact_id NULLS FIRST;
$fn$;

REVOKE ALL ON FUNCTION public.email_resolve_recipients(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_resolve_recipients(uuid, uuid, text) TO service_role;

-- Configuracoes alteradas tambem valem para entregas que ainda nao sairam.
-- Assim, desligar somente um evento nao deixa mensagens antigas escaparem da fila.
CREATE OR REPLACE FUNCTION public.cancel_disallowed_customer_email_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  UPDATE public.customer_email_deliveries d
     SET status = 'cancelled', locked_at = NULL,
         last_error_code = CASE
           WHEN NEW.enabled IS NOT TRUE THEN 'customer_email_engine_disabled'
           ELSE 'customer_email_event_disabled'
         END
   WHERE d.company_id = NEW.company_id
     AND d.status IN ('pending', 'retry')
     AND (
       NEW.enabled IS NOT TRUE
       OR CASE d.event_type
         WHEN 'charge_created' THEN NEW.charge_created_enabled IS NOT TRUE
         WHEN 'charge_due_reminder' THEN NEW.due_reminder_enabled IS NOT TRUE
         WHEN 'charge_overdue' THEN NEW.charge_overdue_enabled IS NOT TRUE
         WHEN 'charge_paid' THEN NEW.charge_paid_enabled IS NOT TRUE
         WHEN 'charge_refunded' THEN NEW.charge_refunded_enabled IS NOT TRUE
         ELSE true
       END
     );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_disallowed_customer_email_deliveries()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cancel_disallowed_customer_email_deliveries
  AFTER UPDATE OF enabled, charge_created_enabled, due_reminder_enabled,
    charge_overdue_enabled, charge_paid_enabled, charge_refunded_enabled
  ON public.customer_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.cancel_disallowed_customer_email_deliveries();

-- O endereco persistido na fila e um snapshot auditavel. Se o cadastro mudar
-- antes do envio, a entrega antiga e cancelada em vez de seguir ao endereco
-- anterior; o novo endereco passa a valer somente para os proximos eventos.
CREATE OR REPLACE FUNCTION public.cancel_pending_customer_emails_on_primary_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  UPDATE public.customer_email_deliveries d
     SET status = 'cancelled', locked_at = NULL,
         last_error_code = 'customer_email_recipient_changed'
   WHERE d.company_id = NEW.company_id
     AND d.customer_id = NEW.id
     AND d.recipient_kind = 'customer_primary'
     AND d.status IN ('pending', 'retry')
     AND d.recipient_email IS DISTINCT FROM lower(btrim(NEW.email));
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_pending_customer_emails_on_primary_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cancel_pending_customer_emails_on_primary_change
  AFTER UPDATE OF email ON public.customers
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.cancel_pending_customer_emails_on_primary_change();

CREATE OR REPLACE FUNCTION public.cancel_pending_customer_emails_on_contact_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.customer_email_deliveries d
       SET status = 'cancelled', locked_at = NULL,
           last_error_code = 'customer_email_recipient_changed'
     WHERE d.customer_contact_id = OLD.id
       AND d.status IN ('pending', 'retry');
    RETURN OLD;
  END IF;

  UPDATE public.customer_email_deliveries d
     SET status = 'cancelled', locked_at = NULL,
         last_error_code = 'customer_email_recipient_changed'
   WHERE d.customer_contact_id = OLD.id
     AND d.status IN ('pending', 'retry')
     AND (
       d.customer_id IS DISTINCT FROM NEW.customer_id
       OR d.recipient_email IS DISTINCT FROM lower(btrim(NEW.email))
     );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_pending_customer_emails_on_contact_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cancel_pending_customer_emails_on_contact_update
  BEFORE UPDATE OF email, customer_id ON public.customer_contacts
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email OR OLD.customer_id IS DISTINCT FROM NEW.customer_id)
  EXECUTE FUNCTION public.cancel_pending_customer_emails_on_contact_change();

CREATE TRIGGER cancel_pending_customer_emails_on_contact_delete
  BEFORE DELETE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.cancel_pending_customer_emails_on_contact_change();

CREATE OR REPLACE FUNCTION public.set_customer_email_route(
  p_customer_id uuid,
  p_enabled boolean,
  p_recipients jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_company_id uuid;
  v_company_id uuid;
  v_route_id uuid;
  v_recipient_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autenticação obrigatória.';
  END IF;
  IF jsonb_typeof(COALESCE(p_recipients, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_recipients, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'Revise os destinatários selecionados.',
      DETAIL = 'code=customer_email_recipients_invalid';
  END IF;

  v_user_company_id := public.get_user_company_id(v_user_id);
  IF public.is_super_admin(v_user_id) THEN
    SELECT c.company_id INTO v_company_id
      FROM public.customers c
     WHERE c.id = p_customer_id AND c.is_deleted IS FALSE;
  ELSE
    SELECT c.company_id INTO v_company_id
      FROM public.customers c
     WHERE c.id = p_customer_id
       AND c.company_id = v_user_company_id
       AND c.is_deleted IS FALSE;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Cliente não encontrado.';
  END IF;
  IF public.is_super_admin(v_user_id) IS NOT TRUE
     AND public.tenant_subscription_allows_access(v_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sem acesso ao cliente.';
  END IF;
  IF public.company_has_module(v_company_id, 'cobrancas') IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514', MESSAGE = 'O módulo Cobranças é necessário para configurar estes avisos.',
      DETAIL = 'code=customer_email_billing_module_required';
  END IF;
  IF NOT (
    public.is_super_admin(v_user_id)
    OR public.is_admin_or_gestor(v_user_id)
    OR public.user_has_permission(v_user_id, 'fn:manage_finance')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sem permissão para alterar destinatários.';
  END IF;

  SELECT count(*) INTO v_recipient_count
    FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS item
   WHERE jsonb_typeof(item) = 'object'
     AND jsonb_typeof(item->'events') = 'array';
  IF v_recipient_count <> jsonb_array_length(COALESCE(p_recipients, '[]'::jsonb))
     OR (COALESCE(p_enabled, false) AND v_recipient_count = 0)
     OR EXISTS (
       SELECT 1
         FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS item
        WHERE item->>'kind' NOT IN ('customer_primary', 'customer_contact')
           OR (item->>'kind' = 'customer_primary' AND NULLIF(item->>'contact_id', '') IS NOT NULL)
           OR (item->>'kind' = 'customer_contact' AND NULLIF(item->>'contact_id', '') IS NULL)
           OR jsonb_array_length(item->'events') = 0
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(item->'events') event
              WHERE event NOT IN (
                'charge_created', 'charge_due_reminder', 'charge_overdue',
                'charge_paid', 'charge_refunded'
              )
           )
     )
     OR EXISTS (
       SELECT item->>'kind', NULLIF(item->>'contact_id', '')
         FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS item
        GROUP BY item->>'kind', NULLIF(item->>'contact_id', '')
       HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514', MESSAGE = 'Selecione ao menos um evento para cada destinatário.',
      DETAIL = 'code=customer_email_recipients_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS item
      LEFT JOIN public.customer_contacts cc
        ON cc.id = NULLIF(item->>'contact_id', '')::uuid AND cc.customer_id = p_customer_id
     WHERE item->>'kind' = 'customer_contact'
       AND (
         cc.id IS NULL OR NULLIF(btrim(cc.email), '') IS NULL
         OR char_length(btrim(cc.email)) > 254
         OR btrim(cc.email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       )
  ) OR EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS item
      JOIN public.customers c ON c.id = p_customer_id AND c.company_id = v_company_id
     WHERE item->>'kind' = 'customer_primary'
       AND (
         NULLIF(btrim(c.email), '') IS NULL OR char_length(btrim(c.email)) > 254
         OR btrim(c.email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514', MESSAGE = 'Um dos destinatários não possui e-mail válido.',
      DETAIL = 'code=customer_email_recipient_email_invalid';
  END IF;

  INSERT INTO public.customer_email_routes (
    company_id, customer_id, enabled, created_by
  ) VALUES (
    v_company_id, p_customer_id, COALESCE(p_enabled, false), v_user_id
  )
  ON CONFLICT (customer_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, updated_at = now()
  RETURNING id INTO v_route_id;

  DELETE FROM public.customer_email_route_recipients rr WHERE rr.route_id = v_route_id;

  IF COALESCE(p_enabled, false) THEN
    INSERT INTO public.customer_email_route_recipients (
      route_id, recipient_kind, customer_contact_id,
      charge_created_enabled, due_reminder_enabled, charge_overdue_enabled,
      charge_paid_enabled, charge_refunded_enabled
    )
    SELECT v_route_id,
           item->>'kind',
           NULLIF(item->>'contact_id', '')::uuid,
           (item->'events') ? 'charge_created',
           (item->'events') ? 'charge_due_reminder',
           (item->'events') ? 'charge_overdue',
           (item->'events') ? 'charge_paid',
           (item->'events') ? 'charge_refunded'
      FROM jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb)) AS item;
  END IF;

  -- Uma alteracao de destinatario tambem vale para entregas ainda nao enviadas.
  UPDATE public.customer_email_deliveries d
     SET status = 'cancelled', locked_at = NULL,
         last_error_code = 'customer_email_route_changed'
   WHERE d.company_id = v_company_id
     AND d.customer_id = p_customer_id
     AND d.status IN ('pending', 'retry')
     AND NOT EXISTS (
       SELECT 1
         FROM public.email_resolve_recipients(d.company_id, d.customer_id, d.event_type) r
        WHERE r.recipient_kind = d.recipient_kind
          AND r.customer_contact_id IS NOT DISTINCT FROM d.customer_contact_id
          AND r.recipient_email = d.recipient_email
     );

  RETURN v_route_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_customer_email_route(uuid, boolean, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_email_route(uuid, boolean, jsonb)
  TO authenticated;

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

  WITH inserted AS (
    INSERT INTO public.customer_email_deliveries (
      company_id, customer_id, charge_id, event_type, recipient_email, dedupe_key,
      recipient_kind, customer_contact_id, recipient_route_id
    )
    SELECT tc.company_id, tc.customer_id, tc.id, p_event_type,
           r.recipient_email,
           p_dedupe_key || ':' || r.recipient_kind || ':' || COALESCE(r.customer_contact_id::text, 'primary'),
           r.recipient_kind, r.customer_contact_id, r.recipient_route_id
      FROM public.tenant_charges tc
      JOIN public.customer_email_settings s ON s.company_id = tc.company_id
      CROSS JOIN LATERAL public.email_resolve_recipients(
        tc.company_id, tc.customer_id, p_event_type
      ) r
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
    ON CONFLICT (company_id, dedupe_key) DO NOTHING
    RETURNING id
  )
  SELECT id INTO v_id FROM inserted LIMIT 1;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_customer_billing_email(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_billing_email(uuid, text, text) TO service_role;

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
       AND EXISTS (
         SELECT 1 FROM public.email_resolve_recipients(
           tc.company_id, tc.customer_id, 'charge_due_reminder'
         )
       )
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

COMMIT;
