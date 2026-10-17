-- ============================================================================
-- API Publica Dominex v1: fundacao de dados, seguranca e agenda
-- ============================================================================
-- A API nunca recebe company_id: o tenant vem da integracao autenticada.
-- Chaves sao persistidas somente como SHA-256 hexadecimal; o segredo em claro
-- existe apenas no retorno unico da RPC de criacao/rotacao.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public.app_feature_flags
  ADD COLUMN IF NOT EXISTS company_allowlist uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.app_feature_flags.company_allowlist IS
  'Piloto por empresa. Para public_api_v1, acesso = enabled OU company_id presente nesta lista.';

INSERT INTO public.app_feature_flags (key, enabled, contract_allowlist, company_allowlist)
VALUES ('public_api_v1', false, '{}', '{}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.public_api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  scopes text[] NOT NULL DEFAULT ARRAY['catalogs:read', 'availability:read', 'customers:resolve', 'service_orders:create', 'service_orders:read']::text[],
  distribution_mode text NOT NULL DEFAULT 'unassigned',
  ip_allowlist inet[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  CONSTRAINT public_api_integrations_name_check CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT public_api_integrations_scopes_check CHECK (
    scopes <@ ARRAY['catalogs:read', 'availability:read', 'customers:resolve', 'service_orders:create', 'service_orders:read']::text[]
    AND cardinality(scopes) > 0
  ),
  CONSTRAINT public_api_integrations_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT public_api_integrations_distribution_check CHECK (distribution_mode IN ('agent_selects', 'round_robin', 'unassigned')),
  CONSTRAINT public_api_integrations_disabled_check CHECK (
    (status = 'active' AND disabled_at IS NULL) OR (status = 'inactive')
  ),
  UNIQUE (id, company_id)
);

CREATE INDEX public_api_integrations_company_idx
  ON public.public_api_integrations (company_id, status, created_at DESC);

CREATE TABLE public.public_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.public_api_integrations(id) ON DELETE CASCADE,
  public_id text NOT NULL,
  secret_hash text NOT NULL,
  secret_last_four text NOT NULL,
  name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rotated_from_key_id uuid REFERENCES public.public_api_keys(id) ON DELETE SET NULL,
  CONSTRAINT public_api_keys_public_id_check CHECK (public_id ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT public_api_keys_hash_check CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_api_keys_last_four_check CHECK (secret_last_four ~ '^[A-Za-z0-9_-]{4}$'),
  CONSTRAINT public_api_keys_name_check CHECK (name IS NULL OR length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT public_api_keys_lifetime_check CHECK (
    valid_from >= created_at - interval '5 minutes'
    AND expires_at > valid_from
    AND expires_at <= valid_from + interval '180 days'
  ),
  CONSTRAINT public_api_keys_revoke_check CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  UNIQUE (public_id),
  UNIQUE (secret_hash)
);

CREATE INDEX public_api_keys_integration_active_idx
  ON public.public_api_keys (integration_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE public.public_api_external_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.public_api_integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  external_id text NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_api_external_refs_integration_company_fk
    FOREIGN KEY (integration_id, company_id)
    REFERENCES public.public_api_integrations(id, company_id) ON DELETE CASCADE,
  CONSTRAINT public_api_external_refs_type_check CHECK (resource_type IN ('customer', 'service_order')),
  CONSTRAINT public_api_external_refs_external_id_check CHECK (length(btrim(external_id)) BETWEEN 1 AND 200),
  UNIQUE (integration_id, resource_type, external_id),
  UNIQUE (integration_id, resource_type, resource_id)
);

CREATE INDEX public_api_external_refs_company_resource_idx
  ON public.public_api_external_refs (company_id, resource_type, resource_id);

CREATE TABLE public.public_api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.public_api_integrations(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.public_api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL DEFAULT 'processing',
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT public_api_idempotency_key_check CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  CONSTRAINT public_api_idempotency_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_api_idempotency_state_check CHECK (state IN ('processing', 'completed', 'failed')),
  CONSTRAINT public_api_idempotency_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '7 days'
  ),
  CONSTRAINT public_api_idempotency_completion_check CHECK (
    (state = 'processing' AND completed_at IS NULL)
    OR (state IN ('completed', 'failed') AND completed_at IS NOT NULL)
  ),
  UNIQUE (integration_id, endpoint, idempotency_key)
);

CREATE INDEX public_api_idempotency_expiry_idx
  ON public.public_api_idempotency (expires_at);

CREATE TABLE public.public_api_rate_limit_buckets (
  key_id uuid NOT NULL REFERENCES public.public_api_keys(id) ON DELETE CASCADE,
  route text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_api_rate_limit_route_check CHECK (route IN ('general', 'availability', 'mutation')),
  CONSTRAINT public_api_rate_limit_count_check CHECK (request_count > 0),
  CONSTRAINT public_api_rate_limit_expiry_check CHECK (expires_at <= window_started_at + interval '48 hours 1 minute'),
  PRIMARY KEY (key_id, route, window_started_at)
);

CREATE INDEX public_api_rate_limit_expiry_idx
  ON public.public_api_rate_limit_buckets (expires_at);

CREATE TABLE public.api_key_manager_rate_limit_buckets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  route text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_key_manager_rate_limit_ip_check CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT api_key_manager_rate_limit_route_check CHECK (route IN ('general', 'mutation', 'key_issue')),
  CONSTRAINT api_key_manager_rate_limit_count_check CHECK (request_count > 0),
  CONSTRAINT api_key_manager_rate_limit_expiry_check CHECK (expires_at <= window_started_at + interval '48 hours 1 minute'),
  PRIMARY KEY (user_id, ip_hash, route, window_started_at)
);

CREATE INDEX api_key_manager_rate_limit_expiry_idx
  ON public.api_key_manager_rate_limit_buckets (expires_at);

CREATE TABLE public.public_api_request_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  integration_id uuid REFERENCES public.public_api_integrations(id) ON DELETE SET NULL,
  key_id uuid REFERENCES public.public_api_keys(id) ON DELETE SET NULL,
  method text NOT NULL,
  endpoint text NOT NULL,
  route text NOT NULL,
  status_code integer,
  outcome text NOT NULL DEFAULT 'received',
  error_code text,
  resource_type text,
  resource_id uuid,
  idempotency_key_hash text,
  ip_hash text,
  user_agent_hash text,
  request_bytes integer,
  response_bytes integer,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  CONSTRAINT public_api_request_audit_method_check CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  CONSTRAINT public_api_request_audit_route_check CHECK (route IN ('general', 'availability', 'mutation')),
  CONSTRAINT public_api_request_audit_outcome_check CHECK (outcome IN ('received', 'success', 'denied', 'failed')),
  CONSTRAINT public_api_request_audit_status_check CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
  CONSTRAINT public_api_request_audit_hashes_check CHECK (
    (idempotency_key_hash IS NULL OR idempotency_key_hash ~ '^[0-9a-f]{64}$')
    AND (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$')
    AND (user_agent_hash IS NULL OR user_agent_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT public_api_request_audit_expiry_check CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '180 days'
  ),
  UNIQUE (request_id)
);

CREATE INDEX public_api_request_audit_company_created_idx
  ON public.public_api_request_audit (company_id, created_at DESC);
CREATE INDEX public_api_request_audit_expiry_idx
  ON public.public_api_request_audit (expires_at);

CREATE TABLE public.schedule_booking_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_enabled boolean NOT NULL DEFAULT true,
  slot_interval_minutes integer NOT NULL DEFAULT 30,
  default_duration_minutes integer NOT NULL DEFAULT 120,
  minimum_notice_minutes integer NOT NULL DEFAULT 120,
  booking_horizon_days integer NOT NULL DEFAULT 60,
  weekly_hours jsonb NOT NULL DEFAULT '{"0":[],"1":[["08:00","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],"4":[["08:00","18:00"]],"5":[["08:00","18:00"]],"6":[]}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_booking_settings_slot_check CHECK (slot_interval_minutes BETWEEN 5 AND 240),
  CONSTRAINT schedule_booking_settings_duration_check CHECK (default_duration_minutes BETWEEN 15 AND 480),
  CONSTRAINT schedule_booking_settings_notice_check CHECK (minimum_notice_minutes BETWEEN 0 AND 43200),
  CONSTRAINT schedule_booking_settings_horizon_check CHECK (booking_horizon_days BETWEEN 1 AND 365),
  CONSTRAINT schedule_booking_settings_weekly_hours_check CHECK (jsonb_typeof(weekly_hours) = 'object')
);

CREATE TABLE public.schedule_booking_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_booking_exceptions_interval_check CHECK (starts_at < ends_at)
);

CREATE INDEX schedule_booking_exceptions_lookup_idx
  ON public.schedule_booking_exceptions (company_id, starts_at, ends_at);

CREATE TABLE public.public_api_integration_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.public_api_integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_api_resources_integration_company_fk
    FOREIGN KEY (integration_id, company_id)
    REFERENCES public.public_api_integrations(id, company_id) ON DELETE CASCADE,
  CONSTRAINT public_api_resources_type_check CHECK (resource_type IN ('user', 'team')),
  UNIQUE (integration_id, resource_type, resource_id)
);

CREATE INDEX public_api_resources_company_idx
  ON public.public_api_integration_resources (company_id, resource_type, resource_id)
  WHERE is_active;

CREATE TABLE public.schedule_conflict_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  requested_slot tstzrange NOT NULL,
  justification text NOT NULL,
  authorized_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CONSTRAINT schedule_conflict_overrides_type_check CHECK (resource_type IN ('user', 'team')),
  CONSTRAINT schedule_conflict_overrides_slot_check CHECK (
    NOT isempty(requested_slot)
    AND lower_inc(requested_slot)
    AND NOT upper_inc(requested_slot)
    AND lower(requested_slot) IS NOT NULL
    AND upper(requested_slot) IS NOT NULL
    AND lower(requested_slot) < upper(requested_slot)
  ),
  CONSTRAINT schedule_conflict_overrides_justification_check CHECK (length(btrim(justification)) BETWEEN 10 AND 1000)
);

CREATE INDEX schedule_conflict_overrides_company_created_idx
  ON public.schedule_conflict_overrides (company_id, created_at DESC);

CREATE TABLE public.booking_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.public_api_integrations(id) ON DELETE SET NULL,
  key_id uuid REFERENCES public.public_api_keys(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  slot tstzrange NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'internal',
  conflict_enforced boolean NOT NULL DEFAULT true,
  override_id uuid REFERENCES public.schedule_conflict_overrides(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT booking_reservations_type_check CHECK (resource_type IN ('user', 'team')),
  CONSTRAINT booking_reservations_status_check CHECK (status IN ('active', 'cancelled')),
  CONSTRAINT booking_reservations_source_check CHECK (source IN ('internal', 'public_api', 'legacy_backfill')),
  CONSTRAINT booking_reservations_slot_check CHECK (
    NOT isempty(slot)
    AND lower_inc(slot)
    AND NOT upper_inc(slot)
    AND lower(slot) IS NOT NULL
    AND upper(slot) IS NOT NULL
    AND lower(slot) < upper(slot)
  ),
  CONSTRAINT booking_reservations_override_check CHECK (
    (conflict_enforced AND override_id IS NULL)
    OR (NOT conflict_enforced)
  ),
  CONSTRAINT booking_reservations_cancel_check CHECK (
    (status = 'active' AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL)
  ),
  UNIQUE (service_order_id, resource_type, resource_id)
);

ALTER TABLE public.booking_reservations
  ADD CONSTRAINT booking_reservations_no_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    resource_type WITH =,
    resource_id WITH =,
    slot WITH &&
  )
  WHERE (status = 'active' AND conflict_enforced)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX booking_reservations_company_slot_idx
  ON public.booking_reservations USING gist (company_id, slot)
  WHERE status = 'active';
CREATE INDEX booking_reservations_service_order_idx
  ON public.booking_reservations (service_order_id, status);

-- Toda tabela nova e sensivel. Clientes nao acessam linhas diretamente; a
-- superficie suportada sao RPCs SECURITY DEFINER com allowlist de retorno.
ALTER TABLE public.public_api_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_external_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_manager_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_request_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_booking_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_api_integration_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_conflict_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.public_api_integrations,
  public.public_api_keys,
  public.public_api_external_refs,
  public.public_api_idempotency,
  public.public_api_rate_limit_buckets,
  public.api_key_manager_rate_limit_buckets,
  public.public_api_request_audit,
  public.schedule_booking_settings,
  public.schedule_booking_exceptions,
  public.public_api_integration_resources,
  public.booking_reservations,
  public.schedule_conflict_overrides
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.public_api_integrations,
  public.public_api_keys,
  public.public_api_external_refs,
  public.public_api_idempotency,
  public.public_api_rate_limit_buckets,
  public.api_key_manager_rate_limit_buckets,
  public.public_api_request_audit,
  public.schedule_booking_settings,
  public.schedule_booking_exceptions,
  public.public_api_integration_resources,
  public.booking_reservations,
  public.schedule_conflict_overrides
TO service_role;

COMMENT ON TABLE public.public_api_keys IS
  'Credenciais da API publica. secret_hash e SHA-256 hexadecimal somente do segredo; nunca persiste segredo/token em texto puro.';
COMMENT ON TABLE public.public_api_idempotency IS
  'Resultados de mutacoes por 7 dias. Mesmo idempotency_key com request_hash diferente e conflito.';
COMMENT ON TABLE public.booking_reservations IS
  'Reserva [start,end). Linhas legacy_backfill/override nao entram na exclusion, mas bloqueiam novos horarios pela checagem transacional sob advisory lock.';

-- Limites que precisam valer mesmo contra escrita privilegiada acidental.
CREATE OR REPLACE FUNCTION public.public_api_enforce_integration_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public-api-integrations:' || NEW.company_id::text, 0));

  SELECT count(*)
    INTO v_total
    FROM public.public_api_integrations
   WHERE company_id = NEW.company_id
     AND id IS DISTINCT FROM NEW.id;

  IF TG_OP = 'INSERT' AND v_total >= 5 THEN
    RAISE EXCEPTION 'public_api_integration_limit' USING ERRCODE = 'P0001';
  END IF;
  NEW.disabled_at := CASE WHEN NEW.status = 'active' THEN NULL ELSE COALESCE(NEW.disabled_at, now()) END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER public_api_integrations_limits
BEFORE INSERT OR UPDATE OF company_id, status
ON public.public_api_integrations
FOR EACH ROW EXECUTE FUNCTION public.public_api_enforce_integration_limits();

CREATE OR REPLACE FUNCTION public.public_api_enforce_key_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_active integer;
  v_rotated_key public.public_api_keys%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public-api-keys:' || NEW.integration_id::text, 0));
  IF TG_OP = 'INSERT' AND NEW.rotated_from_key_id IS NOT NULL THEN
    SELECT * INTO v_rotated_key
      FROM public.public_api_keys
     WHERE id = NEW.rotated_from_key_id
       AND integration_id = NEW.integration_id
       AND revoked_at IS NULL
       AND expires_at > now()
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'public_api_rotation_source_invalid' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.public_api_keys
       SET expires_at = least(expires_at, now() + interval '7 days')
     WHERE id = NEW.rotated_from_key_id;
  END IF;
  IF NEW.revoked_at IS NULL AND NEW.expires_at > now() THEN
    SELECT count(*) INTO v_active
      FROM public.public_api_keys
     WHERE integration_id = NEW.integration_id
       AND id IS DISTINCT FROM NEW.id
       AND revoked_at IS NULL
       AND expires_at > now();
    IF v_active >= 2 THEN
      RAISE EXCEPTION 'public_api_active_key_limit' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER public_api_keys_limits
BEFORE INSERT OR UPDATE OF integration_id, revoked_at, expires_at
ON public.public_api_keys
FOR EACH ROW EXECUTE FUNCTION public.public_api_enforce_key_limits();

CREATE OR REPLACE FUNCTION public.public_api_validate_resource()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  SELECT i.company_id INTO NEW.company_id
    FROM public.public_api_integrations i
   WHERE i.id = NEW.integration_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'public_api_integration_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.resource_type = 'user' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = NEW.resource_id
         AND p.company_id = NEW.company_id
         AND p.is_active
    ) THEN
      RAISE EXCEPTION 'public_api_resource_not_in_tenant' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.resource_type = 'team' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.teams t
       WHERE t.id = NEW.resource_id
         AND t.company_id = NEW.company_id
         AND COALESCE(t.is_active, true)
    ) THEN
      RAISE EXCEPTION 'public_api_resource_not_in_tenant' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER public_api_resources_validate
BEFORE INSERT OR UPDATE OF company_id, resource_type, resource_id
ON public.public_api_integration_resources
FOR EACH ROW EXECUTE FUNCTION public.public_api_validate_resource();

REVOKE ALL ON FUNCTION public.public_api_enforce_integration_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_api_enforce_key_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_api_validate_resource() FROM PUBLIC, anon, authenticated;
