-- Segmentos multiplos por empresa, mantendo `segment` como espelho legado.
--
-- Fonte canonica nova: `segments text[]` em companies e company_settings.
-- Compatibilidade: `segment` sempre recebe o primeiro item. Escritas antigas que
-- alteram somente `segment` continuam funcionando e promovem o novo valor para
-- a primeira posicao sem apagar os demais segmentos ja contratados.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS segments text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS segments text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE OR REPLACE FUNCTION public.normalize_company_segments(
  p_segments text[],
  p_fallback_segment text DEFAULT NULL
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result text[] := ARRAY[]::text[];
  v_item text;
  v_normalized text;
BEGIN
  FOREACH v_item IN ARRAY COALESCE(p_segments, ARRAY[]::text[])
  LOOP
    v_normalized := NULLIF(btrim(v_item), '');
    IF v_normalized IS NOT NULL AND NOT (v_normalized = ANY(v_result)) THEN
      v_result := array_append(v_result, v_normalized);
    END IF;
  END LOOP;

  v_normalized := NULLIF(btrim(p_fallback_segment), '');
  IF cardinality(v_result) = 0 AND v_normalized IS NOT NULL THEN
    v_result := ARRAY[v_normalized];
  END IF;

  RETURN v_result;
END;
$$;

-- Backfill sem perda: o singular existente vira o primeiro item.
UPDATE public.companies
SET segments = public.normalize_company_segments(segments, segment);

UPDATE public.company_settings cs
SET segments = public.normalize_company_segments(
  CASE
    WHEN cardinality(c.segments) > 0 THEN c.segments
    ELSE cs.segments
  END,
  COALESCE(c.segment, cs.segment)
)
FROM public.companies c
WHERE c.id = cs.company_id;

UPDATE public.companies
SET segment = segments[1]
WHERE segment IS DISTINCT FROM segments[1];

UPDATE public.company_settings
SET segment = segments[1]
WHERE segment IS DISTINCT FROM segments[1];

CREATE OR REPLACE FUNCTION public.canonicalize_company_segments_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_segments text[];
BEGIN
  -- Compatibilidade com clientes antigos: se somente o singular mudou, ele
  -- vira o primario e os secundarios permanecem. NULL explicito limpa a lista.
  IF TG_OP = 'UPDATE'
     AND NEW.segments IS NOT DISTINCT FROM OLD.segments
     AND NEW.segment IS DISTINCT FROM OLD.segment THEN
    IF NULLIF(btrim(NEW.segment), '') IS NULL THEN
      v_segments := ARRAY[]::text[];
    ELSE
      v_segments := public.normalize_company_segments(
        array_prepend(NEW.segment, OLD.segments),
        NEW.segment
      );
    END IF;
  ELSE
    v_segments := public.normalize_company_segments(NEW.segments, NEW.segment);
  END IF;

  NEW.segments := v_segments;
  NEW.segment := v_segments[1];
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_company_segments ON public.companies;
CREATE TRIGGER trg_canonicalize_company_segments
  BEFORE INSERT OR UPDATE OF segment, segments ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.canonicalize_company_segments_row();

DROP TRIGGER IF EXISTS trg_canonicalize_company_segments ON public.company_settings;
CREATE TRIGGER trg_canonicalize_company_segments
  BEFORE INSERT OR UPDATE OF segment, segments ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.canonicalize_company_segments_row();

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_segments_canonical_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_segments_canonical_check
  CHECK (
    segments = public.normalize_company_segments(segments, NULL)
    AND segment IS NOT DISTINCT FROM segments[1]
  );

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_segments_canonical_check;
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_segments_canonical_check
  CHECK (
    segments = public.normalize_company_segments(segments, NULL)
    AND segment IS NOT DISTINCT FROM segments[1]
  );

-- Tenant -> admin. SECURITY DEFINER e company_id preservam o isolamento; as
-- policies existentes de company_settings continuam sendo a fronteira de escrita.
CREATE OR REPLACE FUNCTION public.sync_company_settings_to_companies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies c
  SET
    name           = COALESCE(NULLIF(NEW.name, ''),           c.name),
    cnpj           = COALESCE(NULLIF(NEW.document, ''),       c.cnpj),
    phone          = COALESCE(NULLIF(NEW.phone, ''),          c.phone),
    email          = COALESCE(NULLIF(NEW.email, ''),          c.email),
    logo_url       = COALESCE(NULLIF(NEW.logo_url, ''),       c.logo_url),
    address        = COALESCE(NULLIF(NEW.address, ''),        c.address),
    address_number = COALESCE(NULLIF(NEW.address_number, ''), c.address_number),
    neighborhood   = COALESCE(NULLIF(NEW.neighborhood, ''),   c.neighborhood),
    complement     = COALESCE(NULLIF(NEW.complement, ''),     c.complement),
    city           = COALESCE(NULLIF(NEW.city, ''),           c.city),
    state          = COALESCE(NULLIF(NEW.state, ''),          c.state),
    zip_code       = COALESCE(NULLIF(NEW.zip_code, ''),       c.zip_code),
    segments       = NEW.segments,
    segment        = NEW.segment
  WHERE c.id = NEW.company_id
    AND (
      c.name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), c.name)
      OR c.cnpj IS DISTINCT FROM COALESCE(NULLIF(NEW.document, ''), c.cnpj)
      OR c.phone IS DISTINCT FROM COALESCE(NULLIF(NEW.phone, ''), c.phone)
      OR c.email IS DISTINCT FROM COALESCE(NULLIF(NEW.email, ''), c.email)
      OR c.logo_url IS DISTINCT FROM COALESCE(NULLIF(NEW.logo_url, ''), c.logo_url)
      OR c.address IS DISTINCT FROM COALESCE(NULLIF(NEW.address, ''), c.address)
      OR c.address_number IS DISTINCT FROM COALESCE(NULLIF(NEW.address_number, ''), c.address_number)
      OR c.neighborhood IS DISTINCT FROM COALESCE(NULLIF(NEW.neighborhood, ''), c.neighborhood)
      OR c.complement IS DISTINCT FROM COALESCE(NULLIF(NEW.complement, ''), c.complement)
      OR c.city IS DISTINCT FROM COALESCE(NULLIF(NEW.city, ''), c.city)
      OR c.state IS DISTINCT FROM COALESCE(NULLIF(NEW.state, ''), c.state)
      OR c.zip_code IS DISTINCT FROM COALESCE(NULLIF(NEW.zip_code, ''), c.zip_code)
      OR c.segments IS DISTINCT FROM NEW.segments
      OR c.segment IS DISTINCT FROM NEW.segment
    );

  RETURN NEW;
END;
$$;

-- Admin -> tenant. O guard IS DISTINCT FROM impede recursao entre os triggers.
CREATE OR REPLACE FUNCTION public.sync_companies_segment_to_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_settings
  SET segments = NEW.segments,
      segment = NEW.segment
  WHERE company_id = NEW.id
    AND (
      segments IS DISTINCT FROM NEW.segments
      OR segment IS DISTINCT FROM NEW.segment
    );
  RETURN NEW;
END;
$$;

-- Empresas novas ja nascem com os segmentos na linha de settings. Isso evita
-- depender da ordem alfabetica dos triggers AFTER INSERT para convergir o dado.
CREATE OR REPLACE FUNCTION public.create_company_settings_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_settings
    (company_id, name, document, phone, email, logo_url,
     address, address_number, neighborhood, complement, city, state, zip_code,
     segments, segment)
  VALUES
    (NEW.id, NEW.name, NEW.cnpj, NEW.phone, NEW.email, NEW.logo_url,
     NEW.address, NEW.address_number, NEW.neighborhood, NEW.complement,
     NEW.city, NEW.state, NEW.zip_code, NEW.segments, NEW.segment)
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_companies_segment_to_settings ON public.companies;
CREATE TRIGGER trg_sync_companies_segment_to_settings
  AFTER INSERT OR UPDATE OF segment, segments ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_companies_segment_to_settings();

-- A escrita administrativa continua atomica: empresa + modulos na mesma RPC.
CREATE OR REPLACE FUNCTION public.admin_apply_company_update(
  p_company_id uuid,
  p_patch jsonb,
  p_modules text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segments text[];
BEGIN
  v_segments := public.normalize_company_segments(
    CASE
      WHEN jsonb_typeof(p_patch->'segments') = 'array' THEN
        ARRAY(SELECT jsonb_array_elements_text(p_patch->'segments'))
      ELSE ARRAY[]::text[]
    END,
    p_patch->>'segment'
  );

  UPDATE public.companies
     SET name = p_patch->>'name',
         cnpj = NULLIF(p_patch->>'cnpj', ''),
         email = NULLIF(p_patch->>'email', ''),
         phone = NULLIF(p_patch->>'phone', ''),
         address = NULLIF(p_patch->>'address', ''),
         contact_name = NULLIF(p_patch->>'contact_name', ''),
         subscription_status = p_patch->>'subscription_status',
         subscription_plan = p_patch->>'subscription_plan',
         subscription_value = (p_patch->>'subscription_value')::numeric,
         subscription_expires_at = NULLIF(p_patch->>'subscription_expires_at', '')::timestamptz,
         billing_cycle = p_patch->>'billing_cycle',
         max_users = (p_patch->>'max_users')::integer,
         notes = NULLIF(p_patch->>'notes', ''),
         origin = NULLIF(p_patch->>'origin', ''),
         salesperson_id = NULLIF(p_patch->>'salesperson_id', '')::uuid,
         sdr_id = NULL,
         affiliate_id = NULLIF(p_patch->>'affiliate_id', '')::uuid,
         segments = v_segments,
         segment = v_segments[1],
         custom_price = NULLIF(p_patch->>'custom_price', '')::numeric,
         custom_price_permanent = COALESCE((p_patch->>'custom_price_permanent')::boolean, true),
         custom_price_months = NULLIF(p_patch->>'custom_price_months', '')::integer,
         nfse_tier = (p_patch->>'nfse_tier')::integer,
         whatsapp_tier = (p_patch->>'whatsapp_tier')::integer,
         plan_locked = (p_patch->>'plan_locked')::boolean,
         updated_at = now()
   WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  DELETE FROM public.company_modules WHERE company_id = p_company_id;
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT p_company_id, module_code
    FROM unnest(COALESCE(p_modules, ARRAY[]::text[])) AS module_code;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_company_update(uuid, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_company_update(uuid, jsonb, text[]) TO service_role;

COMMENT ON COLUMN public.companies.segments IS
  'Segmentos de atuacao da empresa em ordem de prioridade; o primeiro item espelha companies.segment por compatibilidade.';
COMMENT ON COLUMN public.company_settings.segments IS
  'Segmentos de atuacao do tenant em ordem de prioridade; sincronizado com companies.segments.';
