-- Multiplas etiquetas para clientes, fornecedores e equipamentos.
-- Mantem label_id como espelho da primeira etiqueta durante a transicao.

BEGIN;

ALTER TABLE public.party_labels
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'party',
  ADD COLUMN IF NOT EXISTS show_in_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.party_labels
  DROP CONSTRAINT IF EXISTS party_labels_scope_check;
ALTER TABLE public.party_labels
  ADD CONSTRAINT party_labels_scope_check CHECK (scope IN ('party', 'equipment', 'all'));

DROP INDEX IF EXISTS public.party_labels_company_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS party_labels_company_scope_name_unique
  ON public.party_labels (company_id, scope, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS party_labels_id_company_unique
  ON public.party_labels (id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_id_company_unique
  ON public.customers (id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_id_company_unique
  ON public.suppliers (id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_id_company_unique
  ON public.equipment (id, company_id);

CREATE OR REPLACE FUNCTION public.guard_party_label_company_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.scope IS DISTINCT FROM OLD.scope THEN
    RAISE EXCEPTION 'A empresa e o escopo da etiqueta nao podem ser alterados.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_party_label_company_immutable ON public.party_labels;
CREATE TRIGGER guard_party_label_company_immutable
  BEFORE UPDATE OF company_id, scope ON public.party_labels
  FOR EACH ROW EXECUTE FUNCTION public.guard_party_label_company_immutable();

CREATE TABLE IF NOT EXISTS public.customer_label_assignments (
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  label_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (company_id, customer_id, label_id),
  FOREIGN KEY (customer_id, company_id) REFERENCES public.customers(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (label_id, company_id) REFERENCES public.party_labels(id, company_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.supplier_label_assignments (
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  label_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (company_id, supplier_id, label_id),
  FOREIGN KEY (supplier_id, company_id) REFERENCES public.suppliers(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (label_id, company_id) REFERENCES public.party_labels(id, company_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.equipment_label_assignments (
  company_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  label_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (company_id, equipment_id, label_id),
  FOREIGN KEY (equipment_id, company_id) REFERENCES public.equipment(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (label_id, company_id) REFERENCES public.party_labels(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customer_label_assignments_filter_idx
  ON public.customer_label_assignments (company_id, label_id, customer_id);
CREATE INDEX IF NOT EXISTS supplier_label_assignments_filter_idx
  ON public.supplier_label_assignments (company_id, label_id, supplier_id);
CREATE INDEX IF NOT EXISTS equipment_label_assignments_filter_idx
  ON public.equipment_label_assignments (company_id, label_id, equipment_id);

CREATE OR REPLACE FUNCTION public.validate_party_label_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_scope text;
BEGIN
  SELECT scope INTO v_scope FROM public.party_labels WHERE id = NEW.label_id AND company_id = NEW.company_id;
  IF v_scope IS NULL
     OR (TG_TABLE_NAME IN ('customer_label_assignments', 'supplier_label_assignments') AND v_scope NOT IN ('party', 'all'))
     OR (TG_TABLE_NAME = 'equipment_label_assignments' AND v_scope NOT IN ('equipment', 'all'))
  THEN
    RAISE EXCEPTION 'A etiqueta selecionada nao esta disponivel para este tipo de cadastro.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_customer_label_assignment_scope ON public.customer_label_assignments;
CREATE TRIGGER validate_customer_label_assignment_scope BEFORE INSERT OR UPDATE ON public.customer_label_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_party_label_assignment_scope();
DROP TRIGGER IF EXISTS validate_supplier_label_assignment_scope ON public.supplier_label_assignments;
CREATE TRIGGER validate_supplier_label_assignment_scope BEFORE INSERT OR UPDATE ON public.supplier_label_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_party_label_assignment_scope();
DROP TRIGGER IF EXISTS validate_equipment_label_assignment_scope ON public.equipment_label_assignments;
CREATE TRIGGER validate_equipment_label_assignment_scope BEFORE INSERT OR UPDATE ON public.equipment_label_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_party_label_assignment_scope();

REVOKE ALL ON FUNCTION public.validate_party_label_assignment_scope() FROM PUBLIC, anon, authenticated;

INSERT INTO public.customer_label_assignments (company_id, customer_id, label_id, position)
SELECT company_id, id, label_id, 0 FROM public.customers WHERE label_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.supplier_label_assignments (company_id, supplier_id, label_id, position)
SELECT company_id, id, label_id, 0 FROM public.suppliers WHERE label_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.customer_label_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_label_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_label_assignments ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['customer_label_assignments', 'supplier_label_assignments', 'equipment_label_assignments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant users manage own %1$s" ON public.%1$I', table_name);
    EXECUTE format(
      'CREATE POLICY "Tenant users manage own %1$s" ON public.%1$I FOR ALL TO authenticated USING (company_id = public.get_user_company_id((SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid()))) WITH CHECK (company_id = public.get_user_company_id((SELECT auth.uid())) OR public.is_super_admin((SELECT auth.uid())))',
      table_name
    );
  END LOOP;
END
$policies$;

REVOKE ALL ON public.customer_label_assignments FROM anon;
REVOKE ALL ON public.supplier_label_assignments FROM anon;
REVOKE ALL ON public.equipment_label_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_label_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_label_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_label_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.set_customer_labels(p_customer_id uuid, p_label_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_user_company_id uuid := public.get_user_company_id((SELECT auth.uid()));
  v_ids uuid[] := ARRAY(SELECT value FROM unnest(COALESCE(p_label_ids, '{}'::uuid[])) WITH ORDINALITY AS x(value, ord) GROUP BY value ORDER BY min(ord));
BEGIN
  SELECT company_id INTO v_company_id FROM public.customers WHERE id = p_customer_id AND NOT COALESCE(is_deleted, false);
  IF v_company_id IS NULL OR (v_company_id IS DISTINCT FROM v_user_company_id AND NOT public.is_super_admin((SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'Cliente indisponivel para esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(v_ids) AS selected(label_id)
      LEFT JOIN public.party_labels pl
        ON pl.id = selected.label_id
       AND pl.company_id = v_company_id
       AND pl.scope IN ('party', 'all')
     WHERE pl.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais etiquetas nao estao disponiveis para esta empresa.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.customer_label_assignments WHERE company_id = v_company_id AND customer_id = p_customer_id AND NOT (label_id = ANY(v_ids));
  INSERT INTO public.customer_label_assignments (company_id, customer_id, label_id, position, created_by)
  SELECT v_company_id, p_customer_id, selected.label_id, selected.ord - 1, auth.uid()
    FROM unnest(v_ids) WITH ORDINALITY AS selected(label_id, ord)
  ON CONFLICT (company_id, customer_id, label_id) DO UPDATE SET position = EXCLUDED.position;
  UPDATE public.customers SET label_id = v_ids[1] WHERE id = p_customer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_supplier_labels(p_supplier_id uuid, p_label_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_user_company_id uuid := public.get_user_company_id((SELECT auth.uid()));
  v_ids uuid[] := ARRAY(SELECT value FROM unnest(COALESCE(p_label_ids, '{}'::uuid[])) WITH ORDINALITY AS x(value, ord) GROUP BY value ORDER BY min(ord));
BEGIN
  SELECT company_id INTO v_company_id FROM public.suppliers WHERE id = p_supplier_id;
  IF v_company_id IS NULL OR (v_company_id IS DISTINCT FROM v_user_company_id AND NOT public.is_super_admin((SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'Fornecedor indisponivel para esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(v_ids) AS selected(label_id)
      LEFT JOIN public.party_labels pl
        ON pl.id = selected.label_id
       AND pl.company_id = v_company_id
       AND pl.scope IN ('party', 'all')
     WHERE pl.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais etiquetas nao estao disponiveis para esta empresa.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.supplier_label_assignments WHERE company_id = v_company_id AND supplier_id = p_supplier_id AND NOT (label_id = ANY(v_ids));
  INSERT INTO public.supplier_label_assignments (company_id, supplier_id, label_id, position, created_by)
  SELECT v_company_id, p_supplier_id, selected.label_id, selected.ord - 1, auth.uid()
    FROM unnest(v_ids) WITH ORDINALITY AS selected(label_id, ord)
  ON CONFLICT (company_id, supplier_id, label_id) DO UPDATE SET position = EXCLUDED.position;
  UPDATE public.suppliers SET label_id = v_ids[1] WHERE id = p_supplier_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_equipment_labels(p_equipment_id uuid, p_label_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_user_company_id uuid := public.get_user_company_id((SELECT auth.uid()));
  v_ids uuid[] := ARRAY(SELECT value FROM unnest(COALESCE(p_label_ids, '{}'::uuid[])) WITH ORDINALITY AS x(value, ord) GROUP BY value ORDER BY min(ord));
BEGIN
  SELECT company_id INTO v_company_id FROM public.equipment WHERE id = p_equipment_id;
  IF v_company_id IS NULL OR (v_company_id IS DISTINCT FROM v_user_company_id AND NOT public.is_super_admin((SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'Equipamento indisponivel para esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(v_ids) AS selected(label_id)
      LEFT JOIN public.party_labels pl
        ON pl.id = selected.label_id
       AND pl.company_id = v_company_id
       AND pl.scope IN ('equipment', 'all')
     WHERE pl.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais etiquetas nao estao disponiveis para esta empresa.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.equipment_label_assignments WHERE company_id = v_company_id AND equipment_id = p_equipment_id AND NOT (label_id = ANY(v_ids));
  INSERT INTO public.equipment_label_assignments (company_id, equipment_id, label_id, position, created_by)
  SELECT v_company_id, p_equipment_id, selected.label_id, selected.ord - 1, auth.uid()
    FROM unnest(v_ids) WITH ORDINALITY AS selected(label_id, ord)
  ON CONFLICT (company_id, equipment_id, label_id) DO UPDATE SET position = EXCLUDED.position;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_legacy_customer_label_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.label_id IS NOT NULL THEN
    UPDATE public.customer_label_assignments
      SET position = position + 1
      WHERE company_id = NEW.company_id
        AND customer_id = NEW.id
        AND label_id <> NEW.label_id;
    INSERT INTO public.customer_label_assignments (company_id, customer_id, label_id, position)
    VALUES (NEW.company_id, NEW.id, NEW.label_id, 0)
    ON CONFLICT (company_id, customer_id, label_id) DO UPDATE SET position = 0;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_legacy_supplier_label_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.label_id IS NOT NULL THEN
    UPDATE public.supplier_label_assignments
      SET position = position + 1
      WHERE company_id = NEW.company_id
        AND supplier_id = NEW.id
        AND label_id <> NEW.label_id;
    INSERT INTO public.supplier_label_assignments (company_id, supplier_id, label_id, position)
    VALUES (NEW.company_id, NEW.id, NEW.label_id, 0)
    ON CONFLICT (company_id, supplier_id, label_id) DO UPDATE SET position = 0;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_legacy_customer_label_assignment ON public.customers;
CREATE TRIGGER sync_legacy_customer_label_assignment AFTER INSERT OR UPDATE OF label_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_customer_label_assignment();
DROP TRIGGER IF EXISTS sync_legacy_supplier_label_assignment ON public.suppliers;
CREATE TRIGGER sync_legacy_supplier_label_assignment AFTER INSERT OR UPDATE OF label_id ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_supplier_label_assignment();

REVOKE ALL ON FUNCTION public.set_customer_labels(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_supplier_labels(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_equipment_labels(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_labels(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_supplier_labels(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_equipment_labels(uuid, uuid[]) TO authenticated;

COMMIT;
