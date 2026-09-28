-- CRM/Kanban: etiquetas e modelos de checklist, com snapshots de checklist
-- dentro da oportunidade. O CRM do tenant e o CRM administrativo usam tabelas
-- separadas porque possuem modelos de acesso e ownership diferentes.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_label_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS crm_checklists jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.admin_leads
  ADD COLUMN IF NOT EXISTS crm_label_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS crm_checklists jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_crm_checklists_array') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_crm_checklists_array CHECK (jsonb_typeof(crm_checklists) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_leads_crm_checklists_array') THEN
    ALTER TABLE public.admin_leads
      ADD CONSTRAINT admin_leads_crm_checklists_array CHECK (jsonb_typeof(crm_checklists) = 'array');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  color text NOT NULL DEFAULT '#64748B' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_labels_company_name_unique
  ON public.crm_labels (company_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.crm_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_checklist_templates_company_idx
  ON public.crm_checklist_templates (company_id, name);

CREATE TABLE IF NOT EXISTS public.admin_crm_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  color text NOT NULL DEFAULT '#64748B' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_crm_labels_name_unique
  ON public.admin_crm_labels (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.admin_crm_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_crm_checklist_templates_name_idx
  ON public.admin_crm_checklist_templates (name);

DROP TRIGGER IF EXISTS update_crm_labels_updated_at ON public.crm_labels;
CREATE TRIGGER update_crm_labels_updated_at
  BEFORE UPDATE ON public.crm_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_checklist_templates_updated_at ON public.crm_checklist_templates;
CREATE TRIGGER update_crm_checklist_templates_updated_at
  BEFORE UPDATE ON public.crm_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_crm_labels_updated_at ON public.admin_crm_labels;
CREATE TRIGGER update_admin_crm_labels_updated_at
  BEFORE UPDATE ON public.admin_crm_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_crm_checklist_templates_updated_at ON public.admin_crm_checklist_templates;
CREATE TRIGGER update_admin_crm_checklist_templates_updated_at
  BEFORE UPDATE ON public.admin_crm_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Impede que ids de etiqueta de outra empresa sejam gravados num lead.
CREATE OR REPLACE FUNCTION public.validate_lead_crm_label_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.crm_label_ids) AS selected(label_id)
    LEFT JOIN public.crm_labels label ON label.id = selected.label_id
    WHERE label.id IS NULL OR label.company_id <> NEW.company_id
  ) THEN
    RAISE EXCEPTION 'CRM_LABEL_OUTSIDE_COMPANY';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_lead_crm_label_ids_trigger ON public.leads;
CREATE TRIGGER validate_lead_crm_label_ids_trigger
  BEFORE INSERT OR UPDATE OF crm_label_ids, company_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_lead_crm_label_ids();

CREATE OR REPLACE FUNCTION public.validate_admin_lead_crm_label_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.crm_label_ids) AS selected(label_id)
    LEFT JOIN public.admin_crm_labels label ON label.id = selected.label_id
    WHERE label.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ADMIN_CRM_LABEL_NOT_FOUND';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_admin_lead_crm_label_ids_trigger ON public.admin_leads;
CREATE TRIGGER validate_admin_lead_crm_label_ids_trigger
  BEFORE INSERT OR UPDATE OF crm_label_ids ON public.admin_leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_admin_lead_crm_label_ids();

-- Etiqueta excluída sai de todas as oportunidades; checklists já aplicados
-- permanecem como snapshot mesmo se o modelo for removido.
CREATE OR REPLACE FUNCTION public.cleanup_deleted_crm_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET crm_label_ids = array_remove(crm_label_ids, OLD.id)
  WHERE company_id = OLD.company_id AND OLD.id = ANY(crm_label_ids);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_deleted_crm_label_trigger ON public.crm_labels;
CREATE TRIGGER cleanup_deleted_crm_label_trigger
  AFTER DELETE ON public.crm_labels
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_crm_label();

CREATE OR REPLACE FUNCTION public.cleanup_deleted_admin_crm_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_leads
  SET crm_label_ids = array_remove(crm_label_ids, OLD.id)
  WHERE OLD.id = ANY(crm_label_ids);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_deleted_admin_crm_label_trigger ON public.admin_crm_labels;
CREATE TRIGGER cleanup_deleted_admin_crm_label_trigger
  AFTER DELETE ON public.admin_crm_labels
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_admin_crm_label();

ALTER TABLE public.crm_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_crm_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_crm_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view own CRM labels"
  ON public.crm_labels FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid())));
CREATE POLICY "System managers manage own CRM labels"
  ON public.crm_labels FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())) OR (public.can_manage_system((SELECT auth.uid())) AND company_id = public.get_user_company_id((SELECT auth.uid()))))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())) OR (public.can_manage_system((SELECT auth.uid())) AND company_id = public.get_user_company_id((SELECT auth.uid()))));
CREATE POLICY "Service role manages CRM labels"
  ON public.crm_labels FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant users view own CRM checklist templates"
  ON public.crm_checklist_templates FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid())));
CREATE POLICY "System managers manage own CRM checklist templates"
  ON public.crm_checklist_templates FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())) OR (public.can_manage_system((SELECT auth.uid())) AND company_id = public.get_user_company_id((SELECT auth.uid()))))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())) OR (public.can_manage_system((SELECT auth.uid())) AND company_id = public.get_user_company_id((SELECT auth.uid()))));
CREATE POLICY "Service role manages CRM checklist templates"
  ON public.crm_checklist_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin CRM users manage labels"
  ON public.admin_crm_labels FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())) OR public.has_admin_permission((SELECT auth.uid()), 'admin_crm'))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())) OR public.has_admin_permission((SELECT auth.uid()), 'admin_crm'));
CREATE POLICY "Service role manages admin CRM labels"
  ON public.admin_crm_labels FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin CRM users manage checklist templates"
  ON public.admin_crm_checklist_templates FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())) OR public.has_admin_permission((SELECT auth.uid()), 'admin_crm'))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())) OR public.has_admin_permission((SELECT auth.uid()), 'admin_crm'));
CREATE POLICY "Service role manages admin CRM checklist templates"
  ON public.admin_crm_checklist_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_checklist_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_crm_labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_crm_checklist_templates TO authenticated;
GRANT ALL ON public.crm_labels, public.crm_checklist_templates, public.admin_crm_labels, public.admin_crm_checklist_templates TO service_role;
REVOKE ALL ON public.crm_labels, public.crm_checklist_templates, public.admin_crm_labels, public.admin_crm_checklist_templates FROM anon;
REVOKE TRUNCATE ON public.crm_labels, public.crm_checklist_templates, public.admin_crm_labels, public.admin_crm_checklist_templates FROM authenticated;

-- São funções internas de trigger; não precisam de superfície RPC.
REVOKE ALL ON FUNCTION public.validate_lead_crm_label_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_admin_lead_crm_label_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_deleted_crm_label() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_deleted_admin_crm_label() FROM PUBLIC, anon, authenticated;
