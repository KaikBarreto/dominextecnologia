-- Cadastros estruturais da NF-e. O navegador pode ler o próprio tenant, mas
-- todas as mutações passam pela Edge fiscal-goods-settings (service_role).
-- Cenários ficam cadastráveis/auditáveis; a emissão só os aplicará quando o
-- motor possuir resolução determinística e snapshot fiscal por item.

CREATE TABLE IF NOT EXISTS public.nfe_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  series integer NOT NULL CHECK (series BETWEEN 0 AND 889),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number BETWEEN 1 AND 999999999),
  direction text NOT NULL DEFAULT 'saida' CHECK (direction IN ('entrada', 'saida', 'ambos')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nfe_series_company_number_unique UNIQUE (company_id, series),
  CONSTRAINT nfe_series_label_not_blank CHECK (btrim(label) <> '')
);

CREATE INDEX IF NOT EXISTS idx_nfe_series_company_active
  ON public.nfe_series(company_id, active, series);

CREATE TABLE IF NOT EXISTS public.fiscal_goods_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('entrada', 'saida')),
  operation_kind text NOT NULL DEFAULT 'normal' CHECK (operation_kind IN ('normal')),
  operation_nature text NOT NULL,
  destination_scope text NOT NULL DEFAULT 'ambos' CHECK (destination_scope IN ('interna', 'interestadual', 'ambos')),
  cfop_internal text,
  cfop_interstate text,
  icms_code text,
  icms_rate numeric(7,4),
  icms_reduction_rate numeric(7,4),
  pis_cst text,
  pis_rate numeric(7,4),
  cofins_cst text,
  cofins_rate numeric(7,4),
  ipi_cst text,
  ipi_rate numeric(7,4),
  notes text,
  active boolean NOT NULL DEFAULT true,
  application_status text NOT NULL DEFAULT 'draft' CHECK (application_status IN ('draft', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_goods_scenarios_company_name_unique UNIQUE (company_id, name),
  CONSTRAINT fiscal_goods_scenarios_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT fiscal_goods_scenarios_nature_not_blank CHECK (btrim(operation_nature) <> ''),
  CONSTRAINT fiscal_goods_scenarios_cfop_direction CHECK (
    (cfop_internal IS NULL OR
      (direction = 'entrada' AND cfop_internal ~ '^[1-3][0-9]{3}$') OR
      (direction = 'saida' AND cfop_internal ~ '^[5-7][0-9]{3}$')) AND
    (cfop_interstate IS NULL OR
      (direction = 'entrada' AND cfop_interstate ~ '^[1-3][0-9]{3}$') OR
      (direction = 'saida' AND cfop_interstate ~ '^[5-7][0-9]{3}$'))
  ),
  CONSTRAINT fiscal_goods_scenarios_tax_codes CHECK (
    (icms_code IS NULL OR icms_code ~ '^[0-9]{2,3}$') AND
    (pis_cst IS NULL OR pis_cst ~ '^[0-9]{2}$') AND
    (cofins_cst IS NULL OR cofins_cst ~ '^[0-9]{2}$') AND
    (ipi_cst IS NULL OR ipi_cst ~ '^[0-9]{2}$')
  ),
  CONSTRAINT fiscal_goods_scenarios_rates CHECK (
    (icms_rate IS NULL OR icms_rate BETWEEN 0 AND 100) AND
    (icms_reduction_rate IS NULL OR icms_reduction_rate BETWEEN 0 AND 100) AND
    (pis_rate IS NULL OR pis_rate BETWEEN 0 AND 100) AND
    (cofins_rate IS NULL OR cofins_rate BETWEEN 0 AND 100) AND
    (ipi_rate IS NULL OR ipi_rate BETWEEN 0 AND 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_fiscal_goods_scenarios_company_active
  ON public.fiscal_goods_scenarios(company_id, active, direction);

CREATE TABLE IF NOT EXISTS public.fiscal_goods_carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  document text NOT NULL,
  state_registration text,
  address text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  zip_code text,
  municipality_code text,
  rntc text,
  vehicle_plate text,
  vehicle_state text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_goods_carriers_company_document_unique UNIQUE (company_id, document),
  CONSTRAINT fiscal_goods_carriers_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT fiscal_goods_carriers_document CHECK (document ~ '^([0-9]{11}|[0-9]{14})$'),
  CONSTRAINT fiscal_goods_carriers_state CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  CONSTRAINT fiscal_goods_carriers_vehicle_state CHECK (vehicle_state IS NULL OR vehicle_state ~ '^[A-Z]{2}$'),
  CONSTRAINT fiscal_goods_carriers_zip CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{8}$'),
  CONSTRAINT fiscal_goods_carriers_city_code CHECK (municipality_code IS NULL OR municipality_code ~ '^[0-9]{7}$'),
  CONSTRAINT fiscal_goods_carriers_plate CHECK (vehicle_plate IS NULL OR vehicle_plate ~ '^[A-Z0-9]{7}$')
);

CREATE INDEX IF NOT EXISTS idx_fiscal_goods_carriers_company_active
  ON public.fiscal_goods_carriers(company_id, active, name);

ALTER TABLE public.company_nfe_settings
  ADD COLUMN IF NOT EXISTS default_exit_series_id uuid REFERENCES public.nfe_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_entry_series_id uuid REFERENCES public.nfe_series(id) ON DELETE SET NULL;

INSERT INTO public.nfe_series(company_id, label, series, next_number, direction, active)
SELECT company_id, 'Série ' || series::text, series, next_number, 'ambos', true
FROM public.company_nfe_settings
ON CONFLICT (company_id, series) DO NOTHING;

UPDATE public.company_nfe_settings settings
SET default_exit_series_id = coalesce(settings.default_exit_series_id, series.id),
    default_entry_series_id = coalesce(settings.default_entry_series_id, series.id)
FROM public.nfe_series series
WHERE series.company_id = settings.company_id AND series.series = settings.series;

CREATE OR REPLACE FUNCTION public.validate_company_nfe_default_series()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_series public.nfe_series%ROWTYPE;
BEGIN
  IF NEW.default_exit_series_id IS NOT NULL THEN
    SELECT * INTO v_series FROM public.nfe_series WHERE id = NEW.default_exit_series_id;
    IF v_series.id IS NULL OR v_series.company_id <> NEW.company_id OR NOT v_series.active
      OR v_series.direction NOT IN ('saida', 'ambos') THEN
      RAISE EXCEPTION 'A série padrão de saída não pertence à empresa ou não está ativa para saída.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.default_entry_series_id IS NOT NULL THEN
    SELECT * INTO v_series FROM public.nfe_series WHERE id = NEW.default_entry_series_id;
    IF v_series.id IS NULL OR v_series.company_id <> NEW.company_id OR NOT v_series.active
      OR v_series.direction NOT IN ('entrada', 'ambos') THEN
      RAISE EXCEPTION 'A série padrão de entrada não pertence à empresa ou não está ativa para entrada.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_company_nfe_default_series ON public.company_nfe_settings;
CREATE TRIGGER validate_company_nfe_default_series
BEFORE INSERT OR UPDATE OF company_id, default_exit_series_id, default_entry_series_id
ON public.company_nfe_settings FOR EACH ROW EXECUTE FUNCTION public.validate_company_nfe_default_series();

CREATE OR REPLACE FUNCTION public.protect_nfe_series()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id <> OLD.company_id OR NEW.next_number < OLD.next_number THEN
      RAISE EXCEPTION 'Empresa e próximo número da série fiscal não podem retroceder.' USING ERRCODE = '23514';
    END IF;
    IF NEW.series <> OLD.series AND EXISTS (
      SELECT 1 FROM public.nfe_documents
      WHERE company_id = OLD.company_id AND series = OLD.series AND number IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A série já possui NF-e numerada e não pode ser renumerada.' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.nfe_documents
    WHERE company_id = OLD.company_id AND series = OLD.series AND number IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A série já possui NF-e numerada e não pode ser excluída.' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_nfe_series ON public.nfe_series;
CREATE TRIGGER protect_nfe_series
BEFORE UPDATE OR DELETE ON public.nfe_series FOR EACH ROW EXECUTE FUNCTION public.protect_nfe_series();

DROP TRIGGER IF EXISTS set_updated_at_nfe_series ON public.nfe_series;
CREATE TRIGGER set_updated_at_nfe_series BEFORE UPDATE ON public.nfe_series
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_fiscal_goods_scenarios ON public.fiscal_goods_scenarios;
CREATE TRIGGER set_updated_at_fiscal_goods_scenarios BEFORE UPDATE ON public.fiscal_goods_scenarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_fiscal_goods_carriers ON public.fiscal_goods_carriers;
CREATE TRIGGER set_updated_at_fiscal_goods_carriers BEFORE UPDATE ON public.fiscal_goods_carriers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.nfe_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_goods_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_goods_carriers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['nfe_series', 'fiscal_goods_scenarios', 'fiscal_goods_carriers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service role manages %1$s" ON public.%1$I', v_table);
    EXECUTE format('CREATE POLICY "service role manages %1$s" ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_table);
    EXECUTE format('DROP POLICY IF EXISTS "company reads own %1$s" ON public.%1$I', v_table);
    EXECUTE format('CREATE POLICY "company reads own %1$s" ON public.%1$I FOR SELECT TO authenticated USING (company_id = public.get_user_company_id((SELECT auth.uid())))', v_table);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon', v_table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.reserve_goods_fiscal_number(uuid, integer);
CREATE FUNCTION public.reserve_goods_fiscal_number(
  p_company_id uuid,
  p_model integer,
  p_series_id uuid DEFAULT NULL,
  p_direction text DEFAULT 'saida'
) RETURNS TABLE(series integer, number bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_direction text;
  v_selected uuid;
  v_legacy_series integer;
  v_legacy_next_number bigint;
BEGIN
  IF p_direction NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Direção fiscal inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_model = 55 THEN
    INSERT INTO public.company_nfe_settings(company_id) VALUES (p_company_id) ON CONFLICT DO NOTHING;
    SELECT series, next_number,
      CASE WHEN p_direction = 'entrada' THEN default_entry_series_id ELSE default_exit_series_id END
    INTO v_legacy_series, v_legacy_next_number, v_selected
    FROM public.company_nfe_settings
    WHERE company_id = p_company_id
    FOR UPDATE;
    IF p_series_id IS NOT NULL THEN
      v_selected := p_series_id;
    END IF;

    -- Empresas criadas depois desta migration também ganham uma série materializada.
    -- O contador legado só serve como semente; toda reserva ocorre em nfe_series.
    IF v_selected IS NULL THEN
      INSERT INTO public.nfe_series(company_id, label, series, next_number, direction, active)
      VALUES (p_company_id, 'Série ' || v_legacy_series::text, v_legacy_series, v_legacy_next_number, 'ambos', true)
      ON CONFLICT (company_id, series) DO NOTHING;
      SELECT id INTO v_selected
      FROM public.nfe_series
      WHERE company_id = p_company_id AND series = v_legacy_series
      FOR UPDATE;
      IF p_direction = 'entrada' THEN
        UPDATE public.company_nfe_settings
        SET default_entry_series_id = v_selected
        WHERE company_id = p_company_id AND default_entry_series_id IS NULL;
      ELSE
        UPDATE public.company_nfe_settings
        SET default_exit_series_id = v_selected
        WHERE company_id = p_company_id AND default_exit_series_id IS NULL;
      END IF;
    END IF;

    SELECT direction INTO v_direction FROM public.nfe_series
    WHERE id = v_selected AND company_id = p_company_id AND active FOR UPDATE;
    IF v_direction IS NULL OR
      (p_direction = 'entrada' AND v_direction NOT IN ('entrada', 'ambos')) OR
      (p_direction = 'saida' AND v_direction NOT IN ('saida', 'ambos')) THEN
      RAISE EXCEPTION 'Série de NF-e inválida para esta empresa.' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY UPDATE public.nfe_series s SET next_number = s.next_number + 1
      WHERE s.id = v_selected AND s.company_id = p_company_id
      RETURNING s.series, s.next_number - 1;
  ELSIF p_model = 65 THEN
    INSERT INTO public.company_nfce_settings(company_id) VALUES (p_company_id) ON CONFLICT DO NOTHING;
    RETURN QUERY UPDATE public.company_nfce_settings s SET next_number = s.next_number + 1
      WHERE s.company_id = p_company_id RETURNING s.series, s.next_number - 1;
  ELSE
    RAISE EXCEPTION 'Modelo fiscal inválido.' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer, uuid, text) TO service_role;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfe_series'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fiscal_goods_scenarios'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fiscal_goods_carriers'::regclass) THEN
    RAISE EXCEPTION 'RLS precisa estar ativa nos novos cadastros fiscais.';
  END IF;
  IF has_table_privilege('authenticated', 'public.nfe_series', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.fiscal_goods_scenarios', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.fiscal_goods_carriers', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ACL fiscal permite escrita direta indevida ao tenant.';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.nfe_series', 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('service_role', 'public.fiscal_goods_scenarios', 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('service_role', 'public.fiscal_goods_carriers', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ACL fiscal não concede acesso completo ao service_role.';
  END IF;
END $$;
