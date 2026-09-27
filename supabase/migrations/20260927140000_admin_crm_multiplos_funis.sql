-- CRM Admin: multiplos funis com o mesmo invariante do CRM dos tenants.
-- O dominio e global ao painel administrativo, portanto nao ha company_id.

CREATE TABLE IF NOT EXISTS public.admin_crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_crm_pipelines_one_default
  ON public.admin_crm_pipelines ((true))
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_admin_crm_pipelines_position
  ON public.admin_crm_pipelines (position, created_at);

DROP TRIGGER IF EXISTS update_admin_crm_pipelines_updated_at ON public.admin_crm_pipelines;
CREATE TRIGGER update_admin_crm_pipelines_updated_at
  BEFORE UPDATE ON public.admin_crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.admin_crm_pipelines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_crm_pipelines TO authenticated;
GRANT ALL ON public.admin_crm_pipelines TO service_role;
REVOKE TRUNCATE ON public.admin_crm_pipelines FROM anon, authenticated;

ALTER TABLE public.admin_crm_pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin CRM users can view admin_crm_pipelines" ON public.admin_crm_pipelines;
CREATE POLICY "Admin CRM users can view admin_crm_pipelines"
  ON public.admin_crm_pipelines FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    OR (SELECT public.has_admin_permission((SELECT auth.uid()), 'admin_crm'))
  );

DROP POLICY IF EXISTS "Admin CRM users can manage admin_crm_pipelines" ON public.admin_crm_pipelines;
CREATE POLICY "Admin CRM users can manage admin_crm_pipelines"
  ON public.admin_crm_pipelines FOR ALL TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    OR (SELECT public.has_admin_permission((SELECT auth.uid()), 'admin_crm'))
  )
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    OR (SELECT public.has_admin_permission((SELECT auth.uid()), 'admin_crm'))
  );

DROP POLICY IF EXISTS "service_role_full_access_admin_crm_pipelines" ON public.admin_crm_pipelines;
CREATE POLICY "service_role_full_access_admin_crm_pipelines"
  ON public.admin_crm_pipelines FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ensure_default_admin_crm_pipeline()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.admin_crm_pipelines
  WHERE is_default
  ORDER BY position, created_at
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
  FROM public.admin_crm_pipelines
  ORDER BY position, created_at
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.admin_crm_pipelines SET is_default = true WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.admin_crm_pipelines (name, position, is_default)
  VALUES ('Funil da Dominex', 0, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_default_admin_crm_pipeline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_admin_crm_pipeline() TO service_role;

SELECT public.ensure_default_admin_crm_pipeline();

ALTER TABLE public.admin_crm_stages
  ADD COLUMN IF NOT EXISTS pipeline_id uuid
  REFERENCES public.admin_crm_pipelines(id) ON DELETE RESTRICT;

ALTER TABLE public.admin_leads
  ADD COLUMN IF NOT EXISTS pipeline_id uuid
  REFERENCES public.admin_crm_pipelines(id) ON DELETE RESTRICT;

UPDATE public.admin_crm_stages
SET pipeline_id = public.ensure_default_admin_crm_pipeline()
WHERE pipeline_id IS NULL;

UPDATE public.admin_leads l
SET pipeline_id = COALESCE(
  (SELECT s.pipeline_id FROM public.admin_crm_stages s WHERE s.id = l.stage_id),
  public.ensure_default_admin_crm_pipeline()
)
WHERE pipeline_id IS NULL;

ALTER TABLE public.admin_crm_stages
  ALTER COLUMN pipeline_id SET NOT NULL;

ALTER TABLE public.admin_leads
  ALTER COLUMN pipeline_id SET NOT NULL;

DROP INDEX IF EXISTS public.admin_crm_stages_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS admin_crm_stages_pipeline_name_unique
  ON public.admin_crm_stages (pipeline_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_admin_crm_stages_pipeline_position
  ON public.admin_crm_stages (pipeline_id, position);

CREATE INDEX IF NOT EXISTS idx_admin_leads_pipeline_id
  ON public.admin_leads (pipeline_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_crm_stage_resolve_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.pipeline_id IS NULL THEN
    NEW.pipeline_id := public.ensure_default_admin_crm_pipeline();
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.admin_crm_pipelines p WHERE p.id = NEW.pipeline_id
  ) THEN
    RAISE EXCEPTION 'Funil administrativo invalido' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_admin_crm_stage_resolve_pipeline ON public.admin_crm_stages;
CREATE TRIGGER trg_admin_crm_stage_resolve_pipeline
  BEFORE INSERT OR UPDATE OF pipeline_id ON public.admin_crm_stages
  FOR EACH ROW EXECUTE FUNCTION public.admin_crm_stage_resolve_pipeline();

CREATE OR REPLACE FUNCTION public.admin_lead_resolve_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pipeline_id uuid;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    SELECT pipeline_id INTO v_pipeline_id
    FROM public.admin_crm_stages
    WHERE id = NEW.stage_id;

    IF v_pipeline_id IS NULL THEN
      RAISE EXCEPTION 'Etapa administrativa invalida' USING ERRCODE = '23503';
    END IF;
  ELSE
    v_pipeline_id := COALESCE(NEW.pipeline_id, public.ensure_default_admin_crm_pipeline());
  END IF;

  NEW.pipeline_id := v_pipeline_id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_admin_lead_resolve_pipeline ON public.admin_leads;
CREATE TRIGGER trg_admin_lead_resolve_pipeline
  BEFORE INSERT OR UPDATE OF stage_id, pipeline_id ON public.admin_leads
  FOR EACH ROW EXECUTE FUNCTION public.admin_lead_resolve_pipeline();

CREATE OR REPLACE FUNCTION public.admin_crm_stage_propagate_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    UPDATE public.admin_leads
    SET pipeline_id = NEW.pipeline_id
    WHERE stage_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_admin_crm_stage_propagate_pipeline ON public.admin_crm_stages;
CREATE TRIGGER trg_admin_crm_stage_propagate_pipeline
  AFTER UPDATE OF pipeline_id ON public.admin_crm_stages
  FOR EACH ROW EXECUTE FUNCTION public.admin_crm_stage_propagate_pipeline();

REVOKE ALL ON FUNCTION public.admin_crm_stage_resolve_pipeline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_lead_resolve_pipeline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_crm_stage_propagate_pipeline() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.admin_crm_pipelines IS
  'Funis globais do CRM administrativo da Dominex.';
COMMENT ON COLUMN public.admin_crm_stages.pipeline_id IS
  'Funil administrativo ao qual a etapa pertence.';
COMMENT ON COLUMN public.admin_leads.pipeline_id IS
  'Funil administrativo derivado da etapa, mantido por trigger.';
