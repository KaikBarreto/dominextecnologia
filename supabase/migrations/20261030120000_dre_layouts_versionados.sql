-- DRE configurável por empresa, versionado e opt-in.
--
-- Segurança de rollout:
--   * migration somente aditiva, sem backfill e sem alterar o DRE legado;
--   * ausência de company_dre_settings equivale a mode='legacy';
--   * categorias/fontes sem destino ficam explicitamente 'unclassified';
--   * somente rascunhos podem ser editados;
--   * publicação é transacional, validada e reversível para o legado.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dre_layout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  active_layout_id uuid,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dre_layout_profiles_company_name_uidx
  ON public.dre_layout_profiles(company_id, lower(btrim(name)))
  WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS dre_layout_profiles_company_idx
  ON public.dre_layout_profiles(company_id, is_archived, name);

CREATE TABLE IF NOT EXISTS public.dre_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (btrim(name) <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  cloned_from_layout_id uuid REFERENCES public.dre_layouts(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT dre_layouts_profile_fkey
    FOREIGN KEY (profile_id, company_id)
    REFERENCES public.dre_layout_profiles(id, company_id) ON DELETE CASCADE,
  UNIQUE (profile_id, version),
  UNIQUE (id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dre_layouts_one_draft_per_company_uidx
  ON public.dre_layouts(profile_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS dre_layouts_one_active_per_company_uidx
  ON public.dre_layouts(profile_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS dre_layouts_company_history_idx
  ON public.dre_layouts(company_id, profile_id, version DESC);

ALTER TABLE public.dre_layout_profiles
  ADD CONSTRAINT dre_layout_profiles_active_layout_fkey
  FOREIGN KEY (active_layout_id, company_id)
  REFERENCES public.dre_layouts(id, company_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.company_dre_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'legacy' CHECK (mode IN ('legacy', 'custom')),
  default_profile_id uuid,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_dre_settings_default_profile_fkey
    FOREIGN KEY (default_profile_id, company_id)
    REFERENCES public.dre_layout_profiles(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT company_dre_settings_custom_requires_layout_check
    CHECK (mode <> 'custom' OR default_profile_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.dre_layout_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL,
  company_id uuid NOT NULL,
  stable_key uuid NOT NULL DEFAULT gen_random_uuid(),
  node_type text NOT NULL CHECK (node_type IN ('macro_group', 'subtotal', 'final_result')),
  label text NOT NULL CHECK (btrim(label) <> ''),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  show_when_zero boolean NOT NULL DEFAULT true,
  is_percentage_base boolean NOT NULL DEFAULT false,
  entry_kind text CHECK (entry_kind IN ('income', 'expense', 'mixed')),
  affects_result boolean,
  calculation_kind text CHECK (calculation_kind IN ('running_total', 'selected_macros')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_layout_nodes_layout_fkey
    FOREIGN KEY (layout_id, company_id)
    REFERENCES public.dre_layouts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dre_layout_nodes_shape_check CHECK (
    (node_type = 'macro_group' AND entry_kind IS NOT NULL AND affects_result IS NOT NULL AND calculation_kind IS NULL)
    OR (node_type = 'subtotal' AND NOT is_percentage_base AND entry_kind IS NULL AND affects_result IS NULL AND calculation_kind IS NOT NULL)
    OR (node_type = 'final_result' AND NOT is_percentage_base AND entry_kind IS NULL AND affects_result IS NULL AND calculation_kind IS NULL)
  ),
  UNIQUE (layout_id, stable_key),
  UNIQUE (layout_id, sort_order),
  UNIQUE (id, layout_id, company_id)
);

CREATE INDEX IF NOT EXISTS dre_layout_nodes_order_idx
  ON public.dre_layout_nodes(layout_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS dre_layout_nodes_one_percentage_base_uidx
  ON public.dre_layout_nodes(layout_id) WHERE is_percentage_base;

CREATE TABLE IF NOT EXISTS public.dre_layout_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL,
  company_id uuid NOT NULL,
  macro_node_id uuid NOT NULL,
  stable_key uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_layout_groups_layout_fkey
    FOREIGN KEY (layout_id, company_id)
    REFERENCES public.dre_layouts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dre_layout_groups_macro_fkey
    FOREIGN KEY (macro_node_id, layout_id, company_id)
    REFERENCES public.dre_layout_nodes(id, layout_id, company_id) ON DELETE CASCADE,
  UNIQUE (layout_id, stable_key),
  UNIQUE (layout_id, macro_node_id, sort_order),
  UNIQUE (id, layout_id, company_id)
);

CREATE INDEX IF NOT EXISTS dre_layout_groups_order_idx
  ON public.dre_layout_groups(layout_id, macro_node_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS dre_layout_groups_name_uidx
  ON public.dre_layout_groups(layout_id, macro_node_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.dre_layout_category_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL,
  company_id uuid NOT NULL,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  group_id uuid,
  classification text NOT NULL DEFAULT 'unclassified'
    CHECK (classification IN ('group', 'outside_dre', 'unclassified')),
  category_name_snapshot text NOT NULL CHECK (btrim(category_name_snapshot) <> ''),
  category_type_snapshot text NOT NULL CHECK (category_type_snapshot IN ('income', 'expense', 'mixed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_layout_category_assignments_layout_fkey
    FOREIGN KEY (layout_id, company_id)
    REFERENCES public.dre_layouts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dre_layout_category_assignments_group_fkey
    FOREIGN KEY (group_id, layout_id, company_id)
    REFERENCES public.dre_layout_groups(id, layout_id, company_id) ON DELETE RESTRICT,
  CONSTRAINT dre_layout_category_assignments_shape_check CHECK (
    (classification = 'group' AND group_id IS NOT NULL)
    OR (classification IN ('outside_dre', 'unclassified') AND group_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS dre_layout_category_once_uidx
  ON public.dre_layout_category_assignments(layout_id, category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dre_layout_category_group_idx
  ON public.dre_layout_category_assignments(layout_id, group_id);

CREATE TABLE IF NOT EXISTS public.dre_layout_source_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL,
  company_id uuid NOT NULL,
  source_key text NOT NULL CHECK (source_key IN ('sales', 'material_cost')),
  group_id uuid,
  classification text NOT NULL DEFAULT 'unclassified'
    CHECK (classification IN ('group', 'outside_dre', 'unclassified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_layout_source_assignments_layout_fkey
    FOREIGN KEY (layout_id, company_id)
    REFERENCES public.dre_layouts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dre_layout_source_assignments_group_fkey
    FOREIGN KEY (group_id, layout_id, company_id)
    REFERENCES public.dre_layout_groups(id, layout_id, company_id) ON DELETE RESTRICT,
  CONSTRAINT dre_layout_source_assignments_shape_check CHECK (
    (classification = 'group' AND group_id IS NOT NULL)
    OR (classification IN ('outside_dre', 'unclassified') AND group_id IS NULL)
  ),
  UNIQUE (layout_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.dre_layout_calculation_sources (
  layout_id uuid NOT NULL,
  company_id uuid NOT NULL,
  calculation_node_id uuid NOT NULL,
  macro_node_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (calculation_node_id, macro_node_id),
  CONSTRAINT dre_layout_calculation_sources_layout_fkey
    FOREIGN KEY (layout_id, company_id)
    REFERENCES public.dre_layouts(id, company_id) ON DELETE CASCADE,
  CONSTRAINT dre_layout_calculation_sources_calculation_fkey
    FOREIGN KEY (calculation_node_id, layout_id, company_id)
    REFERENCES public.dre_layout_nodes(id, layout_id, company_id) ON DELETE CASCADE,
  CONSTRAINT dre_layout_calculation_sources_macro_fkey
    FOREIGN KEY (macro_node_id, layout_id, company_id)
    REFERENCES public.dre_layout_nodes(id, layout_id, company_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.dre_layout_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  layout_id uuid REFERENCES public.dre_layouts(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('draft_created', 'published', 'legacy_restored')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dre_layout_events_company_created_idx
  ON public.dre_layout_events(company_id, created_at DESC);

-- Somente rascunhos podem ter filhos alterados. Isso protege versões já
-- publicadas mesmo em chamadas service_role ou em futuras policies permissivas.
CREATE OR REPLACE FUNCTION public.ensure_dre_layout_is_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_layout_id uuid := COALESCE(NEW.layout_id, OLD.layout_id);
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.dre_layouts WHERE id = v_layout_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Somente um rascunho do DRE pode ser alterado'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

DO $function$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'dre_layout_nodes',
    'dre_layout_groups',
    'dre_layout_category_assignments',
    'dre_layout_source_assignments',
    'dre_layout_calculation_sources'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_draft_only ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ensure_dre_layout_is_draft()',
      v_table,
      v_table
    );
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.validate_dre_category_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_category_company_id uuid;
  v_category_type text;
  v_entry_kind text;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT company_id, type INTO v_category_company_id, v_category_type
      FROM public.financial_categories WHERE id = NEW.category_id;
    IF v_category_company_id IS NULL OR v_category_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'A categoria do layout deve pertencer à mesma empresa'
        USING ERRCODE = '23514';
    END IF;
    NEW.category_name_snapshot := COALESCE(NULLIF(btrim(NEW.category_name_snapshot), ''),
      (SELECT name FROM public.financial_categories WHERE id = NEW.category_id));
    NEW.category_type_snapshot := CASE v_category_type
      WHEN 'entrada' THEN 'income'
      WHEN 'saida' THEN 'expense'
      ELSE 'mixed'
    END;
  END IF;

  IF NEW.classification = 'group' THEN
    SELECT n.entry_kind INTO v_entry_kind
      FROM public.dre_layout_groups g
      JOIN public.dre_layout_nodes n ON n.id = g.macro_node_id
     WHERE g.id = NEW.group_id
       AND g.layout_id = NEW.layout_id
       AND g.company_id = NEW.company_id;
    IF v_entry_kind IS NULL THEN
      RAISE EXCEPTION 'Grupo de destino do DRE não encontrado'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.category_type_snapshot = 'income' AND v_entry_kind NOT IN ('income', 'mixed') THEN
      RAISE EXCEPTION 'Categoria de receita exige macrogrupo de receita ou misto'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.category_type_snapshot = 'expense' AND v_entry_kind NOT IN ('expense', 'mixed') THEN
      RAISE EXCEPTION 'Categoria de despesa exige macrogrupo de despesa ou misto'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.category_type_snapshot = 'mixed' AND v_entry_kind <> 'mixed' THEN
      RAISE EXCEPTION 'Categoria de entrada e saída exige macrogrupo misto'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_validate_dre_category_assignment
  ON public.dre_layout_category_assignments;
CREATE TRIGGER trg_validate_dre_category_assignment
  BEFORE INSERT OR UPDATE ON public.dre_layout_category_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_dre_category_assignment();

CREATE OR REPLACE FUNCTION public.validate_dre_source_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_entry_kind text;
BEGIN
  IF NEW.classification = 'group' THEN
    SELECT n.entry_kind INTO v_entry_kind
      FROM public.dre_layout_groups g
      JOIN public.dre_layout_nodes n ON n.id = g.macro_node_id
     WHERE g.id = NEW.group_id
       AND g.layout_id = NEW.layout_id
       AND g.company_id = NEW.company_id;
    IF v_entry_kind IS NULL THEN
      RAISE EXCEPTION 'Grupo de destino da fonte estrutural não encontrado'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.source_key = 'sales' AND v_entry_kind NOT IN ('income', 'mixed') THEN
      RAISE EXCEPTION 'Vendas exigem macrogrupo de receita ou misto'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.source_key = 'material_cost' AND v_entry_kind NOT IN ('expense', 'mixed') THEN
      RAISE EXCEPTION 'CMV/Compras exigem macrogrupo de despesa ou misto'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_validate_dre_source_assignment
  ON public.dre_layout_source_assignments;
CREATE TRIGGER trg_validate_dre_source_assignment
  BEFORE INSERT OR UPDATE ON public.dre_layout_source_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_dre_source_assignment();

-- Trocar a natureza de um macrogrupo não pode silenciosamente inverter ou
-- invalidar categorias/fontes já ligadas a ele. A pessoa precisa mover as
-- atribuições primeiro; assim nenhuma publicação depende só da validação do UI.
CREATE OR REPLACE FUNCTION public.validate_dre_macro_entry_kind_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF NEW.node_type = 'macro_group'
     AND NEW.entry_kind IS DISTINCT FROM OLD.entry_kind THEN
    IF EXISTS (
      SELECT 1
        FROM public.dre_layout_groups g
        JOIN public.dre_layout_category_assignments a ON a.group_id = g.id
       WHERE g.macro_node_id = NEW.id
         AND a.classification = 'group'
         AND ((a.category_type_snapshot = 'income' AND NEW.entry_kind NOT IN ('income', 'mixed'))
           OR (a.category_type_snapshot = 'expense' AND NEW.entry_kind NOT IN ('expense', 'mixed'))
           OR (a.category_type_snapshot = 'mixed' AND NEW.entry_kind <> 'mixed'))
    ) THEN
      RAISE EXCEPTION 'Mova as categorias incompatíveis antes de alterar o tipo do macrogrupo'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.dre_layout_groups g
        JOIN public.dre_layout_source_assignments a ON a.group_id = g.id
       WHERE g.macro_node_id = NEW.id
         AND a.classification = 'group'
         AND ((a.source_key = 'sales' AND NEW.entry_kind NOT IN ('income', 'mixed'))
           OR (a.source_key = 'material_cost' AND NEW.entry_kind NOT IN ('expense', 'mixed')))
    ) THEN
      RAISE EXCEPTION 'Mova Vendas ou CMV/Compras antes de alterar o tipo do macrogrupo'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_validate_dre_macro_entry_kind_change ON public.dre_layout_nodes;
CREATE TRIGGER trg_validate_dre_macro_entry_kind_change
  BEFORE UPDATE OF entry_kind ON public.dre_layout_nodes
  FOR EACH ROW EXECUTE FUNCTION public.validate_dre_macro_entry_kind_change();

CREATE OR REPLACE FUNCTION public.validate_dre_calculation_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_calculation_type text;
  v_calculation_kind text;
  v_macro_type text;
  v_affects_result boolean;
BEGIN
  SELECT node_type, calculation_kind INTO v_calculation_type, v_calculation_kind
    FROM public.dre_layout_nodes WHERE id = NEW.calculation_node_id;
  SELECT node_type, affects_result INTO v_macro_type, v_affects_result
    FROM public.dre_layout_nodes WHERE id = NEW.macro_node_id;
  IF v_calculation_type IS DISTINCT FROM 'subtotal'
     OR v_calculation_kind IS DISTINCT FROM 'selected_macros' THEN
    RAISE EXCEPTION 'Somente subtotal por macrogrupos selecionados aceita fontes explícitas'
      USING ERRCODE = '23514';
  END IF;
  IF v_macro_type IS DISTINCT FROM 'macro_group' OR NOT COALESCE(v_affects_result, false) THEN
    RAISE EXCEPTION 'Subtotal só pode usar macrogrupo que participa do resultado'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_validate_dre_calculation_source
  ON public.dre_layout_calculation_sources;
CREATE TRIGGER trg_validate_dre_calculation_source
  BEFORE INSERT OR UPDATE ON public.dre_layout_calculation_sources
  FOR EACH ROW EXECUTE FUNCTION public.validate_dre_calculation_source();

CREATE OR REPLACE FUNCTION public.validate_company_dre_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_active_layout_id uuid;
  v_is_archived boolean;
BEGIN
  IF NEW.mode = 'custom' THEN
    SELECT active_layout_id, is_archived INTO v_active_layout_id, v_is_archived
      FROM public.dre_layout_profiles
     WHERE id = NEW.default_profile_id AND company_id = NEW.company_id;
    IF v_active_layout_id IS NULL OR COALESCE(v_is_archived, true) THEN
      RAISE EXCEPTION 'O modo personalizado exige uma configuração publicada da mesma empresa'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_validate_company_dre_settings ON public.company_dre_settings;
CREATE TRIGGER trg_validate_company_dre_settings
  BEFORE INSERT OR UPDATE ON public.company_dre_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_dre_settings();

-- updated_at consistente nas tabelas editáveis.
DO $function$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'dre_layout_profiles',
    'dre_layouts',
    'company_dre_settings',
    'dre_layout_nodes',
    'dre_layout_groups',
    'dre_layout_category_assignments',
    'dre_layout_source_assignments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      v_table,
      v_table
    );
  END LOOP;
END
$function$;

-- RLS: leitura por tenant. Escrita em filhos somente quando o layout é draft e
-- o usuário possui a mesma permissão já usada no configurador legado.
ALTER TABLE public.dre_layout_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_dre_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layout_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layout_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layout_category_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layout_source_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layout_calculation_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_layout_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._assert_dre_company_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- auth.uid() nulo representa uma chamada interna/service_role. Usuários do
  -- app só podem operar sobre a própria empresa, inclusive via RPC SECURITY DEFINER.
  IF auth.uid() IS NOT NULL
     AND public.get_user_company_id(auth.uid()) IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Empresa do DRE não pertence ao usuário autenticado'
      USING ERRCODE = '42501';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public._assert_dre_company_access(uuid) FROM PUBLIC, anon, authenticated;

DO $function$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'dre_layout_profiles',
    'dre_layouts',
    'company_dre_settings',
    'dre_layout_nodes',
    'dre_layout_groups',
    'dre_layout_category_assignments',
    'dre_layout_source_assignments',
    'dre_layout_calculation_sources',
    'dre_layout_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format(
      'CREATE POLICY "service_role_full_access_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      v_table,
      v_table
    );
    EXECUTE format(
      'CREATE POLICY "Users can view company %s" ON public.%I FOR SELECT TO authenticated USING (company_id = (SELECT public.get_user_company_id(auth.uid())))',
      v_table,
      v_table
    );
  END LOOP;
END
$function$;

DO $function$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'dre_layout_nodes',
    'dre_layout_groups',
    'dre_layout_category_assignments',
    'dre_layout_source_assignments',
    'dre_layout_calculation_sources'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "Users can insert draft %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (
        company_id = (SELECT public.get_user_company_id(auth.uid()))
        AND (SELECT public.can_manage_system(auth.uid()))
        AND EXISTS (SELECT 1 FROM public.dre_layouts l WHERE l.id = layout_id AND l.company_id = (SELECT public.get_user_company_id(auth.uid())) AND l.status = ''draft'')
      )',
      v_table,
      v_table
    );
    EXECUTE format(
      'CREATE POLICY "Users can update draft %s" ON public.%I FOR UPDATE TO authenticated USING (
        company_id = (SELECT public.get_user_company_id(auth.uid()))
        AND (SELECT public.can_manage_system(auth.uid()))
        AND EXISTS (SELECT 1 FROM public.dre_layouts l WHERE l.id = layout_id AND l.company_id = (SELECT public.get_user_company_id(auth.uid())) AND l.status = ''draft'')
      ) WITH CHECK (
        company_id = (SELECT public.get_user_company_id(auth.uid()))
        AND (SELECT public.can_manage_system(auth.uid()))
        AND EXISTS (SELECT 1 FROM public.dre_layouts l WHERE l.id = layout_id AND l.company_id = (SELECT public.get_user_company_id(auth.uid())) AND l.status = ''draft'')
      )',
      v_table,
      v_table
    );
    EXECUTE format(
      'CREATE POLICY "Users can delete draft %s" ON public.%I FOR DELETE TO authenticated USING (
        company_id = (SELECT public.get_user_company_id(auth.uid()))
        AND (SELECT public.can_manage_system(auth.uid()))
        AND EXISTS (SELECT 1 FROM public.dre_layouts l WHERE l.id = layout_id AND l.company_id = (SELECT public.get_user_company_id(auth.uid())) AND l.status = ''draft'')
      )',
      v_table,
      v_table
    );
  END LOOP;
END
$function$;

GRANT SELECT ON public.dre_layout_profiles, public.dre_layouts, public.company_dre_settings,
  public.dre_layout_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_layout_nodes,
  public.dre_layout_groups, public.dre_layout_category_assignments,
  public.dre_layout_source_assignments, public.dre_layout_calculation_sources
  TO authenticated;

CREATE OR REPLACE FUNCTION public._assert_dre_manage_permission()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.can_manage_system(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para configurar o DRE'
      USING ERRCODE = '42501';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public._assert_dre_manage_permission() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_dre_layout_draft(
  p_company_id uuid,
  p_profile_id uuid DEFAULT NULL,
  p_name text DEFAULT 'Estrutura personalizada'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_layout_id uuid;
  v_profile_id uuid;
  v_profile_name text;
  v_source_layout_id uuid;
  v_version integer;
  v_revenue_node uuid;
  v_deductions_node uuid;
  v_cost_node uuid;
  v_opex_node uuid;
  v_other_node uuid;
BEGIN
  PERFORM public._assert_dre_company_access(p_company_id);
  PERFORM public._assert_dre_manage_permission();
  PERFORM pg_advisory_xact_lock(hashtextextended('dre-layout:' || p_company_id::text, 0));

  IF p_profile_id IS NULL THEN
    v_profile_name := COALESCE(NULLIF(btrim(p_name), ''), 'Estrutura personalizada');
    INSERT INTO public.dre_layout_profiles(company_id, name, created_by)
    VALUES (p_company_id, v_profile_name, auth.uid())
    RETURNING id INTO v_profile_id;
  ELSE
    SELECT id, name INTO v_profile_id, v_profile_name
      FROM public.dre_layout_profiles
     WHERE id = p_profile_id AND company_id = p_company_id AND NOT is_archived
     FOR UPDATE;
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'Configuração do DRE não encontrada ou arquivada'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT id INTO v_layout_id
    FROM public.dre_layouts
   WHERE profile_id = v_profile_id AND status = 'draft'
   FOR UPDATE;
  IF v_layout_id IS NOT NULL THEN
    RETURN v_layout_id;
  END IF;

  SELECT id INTO v_source_layout_id
    FROM public.dre_layouts
   WHERE profile_id = v_profile_id AND status = 'active'
   ORDER BY version DESC LIMIT 1;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.dre_layouts WHERE profile_id = v_profile_id;

  INSERT INTO public.dre_layouts(company_id, profile_id, version, name, status, cloned_from_layout_id, created_by)
  VALUES (p_company_id, v_profile_id, v_version, v_profile_name,
          'draft', v_source_layout_id, auth.uid())
  RETURNING id INTO v_layout_id;

  IF v_source_layout_id IS NOT NULL THEN
    INSERT INTO public.dre_layout_nodes(
      layout_id, company_id, stable_key, node_type, label, sort_order,
      show_when_zero, is_percentage_base, entry_kind, affects_result, calculation_kind
    )
    SELECT v_layout_id, p_company_id, stable_key, node_type, label, sort_order,
           show_when_zero, is_percentage_base, entry_kind, affects_result, calculation_kind
      FROM public.dre_layout_nodes WHERE layout_id = v_source_layout_id;

    INSERT INTO public.dre_layout_groups(
      layout_id, company_id, macro_node_id, stable_key, name, sort_order
    )
    SELECT v_layout_id, p_company_id, new_node.id, old_group.stable_key,
           old_group.name, old_group.sort_order
      FROM public.dre_layout_groups old_group
      JOIN public.dre_layout_nodes old_node ON old_node.id = old_group.macro_node_id
      JOIN public.dre_layout_nodes new_node
        ON new_node.layout_id = v_layout_id AND new_node.stable_key = old_node.stable_key
     WHERE old_group.layout_id = v_source_layout_id;

    INSERT INTO public.dre_layout_category_assignments(
      layout_id, company_id, category_id, group_id, classification,
      category_name_snapshot, category_type_snapshot
    )
    SELECT v_layout_id, p_company_id, old_assignment.category_id, new_group.id,
           old_assignment.classification, old_assignment.category_name_snapshot,
           old_assignment.category_type_snapshot
      FROM public.dre_layout_category_assignments old_assignment
      LEFT JOIN public.dre_layout_groups old_group ON old_group.id = old_assignment.group_id
      LEFT JOIN public.dre_layout_groups new_group
        ON new_group.layout_id = v_layout_id AND new_group.stable_key = old_group.stable_key
     WHERE old_assignment.layout_id = v_source_layout_id;

    -- Categorias criadas depois da publicação ativa não somem: entram como
    -- pendência explícita e bloqueiam a próxima publicação.
    INSERT INTO public.dre_layout_category_assignments(
      layout_id, company_id, category_id, classification,
      category_name_snapshot, category_type_snapshot
    )
    SELECT v_layout_id, p_company_id, fc.id, 'unclassified', fc.name,
           CASE fc.type WHEN 'entrada' THEN 'income' WHEN 'saida' THEN 'expense' ELSE 'mixed' END
      FROM public.financial_categories fc
     WHERE fc.company_id = p_company_id
       AND NOT EXISTS (
         SELECT 1 FROM public.dre_layout_category_assignments a
          WHERE a.layout_id = v_layout_id AND a.category_id = fc.id
       );

    INSERT INTO public.dre_layout_source_assignments(
      layout_id, company_id, source_key, group_id, classification
    )
    SELECT v_layout_id, p_company_id, old_source.source_key, new_group.id,
           old_source.classification
      FROM public.dre_layout_source_assignments old_source
      LEFT JOIN public.dre_layout_groups old_group ON old_group.id = old_source.group_id
      LEFT JOIN public.dre_layout_groups new_group
        ON new_group.layout_id = v_layout_id AND new_group.stable_key = old_group.stable_key
     WHERE old_source.layout_id = v_source_layout_id;

    INSERT INTO public.dre_layout_calculation_sources(
      layout_id, company_id, calculation_node_id, macro_node_id
    )
    SELECT v_layout_id, p_company_id, new_calc.id, new_macro.id
      FROM public.dre_layout_calculation_sources old_source
      JOIN public.dre_layout_nodes old_calc ON old_calc.id = old_source.calculation_node_id
      JOIN public.dre_layout_nodes old_macro ON old_macro.id = old_source.macro_node_id
      JOIN public.dre_layout_nodes new_calc
        ON new_calc.layout_id = v_layout_id AND new_calc.stable_key = old_calc.stable_key
      JOIN public.dre_layout_nodes new_macro
        ON new_macro.layout_id = v_layout_id AND new_macro.stable_key = old_macro.stable_key
     WHERE old_source.layout_id = v_source_layout_id;
  ELSE
    INSERT INTO public.dre_layout_nodes(
      layout_id, company_id, stable_key, node_type, label, sort_order,
      show_when_zero, is_percentage_base, entry_kind, affects_result, calculation_kind
    ) VALUES
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000001', 'macro_group', 'Receita Bruta', 10, true, true, 'income', true, NULL),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000002', 'macro_group', 'Impostos e Deduções', 20, true, false, 'expense', true, NULL),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000003', 'subtotal', 'Receita Líquida', 30, true, false, NULL, NULL, 'running_total'),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000004', 'macro_group', 'Custos Operacionais', 40, true, false, 'expense', true, NULL),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000005', 'subtotal', 'Lucro Bruto', 50, true, false, NULL, NULL, 'running_total'),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000006', 'macro_group', 'Despesas Operacionais', 60, true, false, 'expense', true, NULL),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000007', 'macro_group', 'Outras Receitas e Despesas', 70, true, false, 'mixed', true, NULL),
      (v_layout_id, p_company_id, '00000000-0000-0000-0000-000000000008', 'final_result', 'Resultado do Período', 80, true, false, NULL, NULL, NULL);

    SELECT id INTO v_revenue_node FROM public.dre_layout_nodes
      WHERE layout_id = v_layout_id AND stable_key = '00000000-0000-0000-0000-000000000001';
    SELECT id INTO v_deductions_node FROM public.dre_layout_nodes
      WHERE layout_id = v_layout_id AND stable_key = '00000000-0000-0000-0000-000000000002';
    SELECT id INTO v_cost_node FROM public.dre_layout_nodes
      WHERE layout_id = v_layout_id AND stable_key = '00000000-0000-0000-0000-000000000004';
    SELECT id INTO v_opex_node FROM public.dre_layout_nodes
      WHERE layout_id = v_layout_id AND stable_key = '00000000-0000-0000-0000-000000000006';
    SELECT id INTO v_other_node FROM public.dre_layout_nodes
      WHERE layout_id = v_layout_id AND stable_key = '00000000-0000-0000-0000-000000000007';

    INSERT INTO public.dre_layout_groups(
      layout_id, company_id, macro_node_id, stable_key, name, sort_order
    )
    SELECT v_layout_id, p_company_id,
      CASE dg.nature
        WHEN 'revenue' THEN v_revenue_node
        WHEN 'deduction' THEN v_deductions_node
        WHEN 'cost' THEN v_cost_node
        WHEN 'operating_expense' THEN v_opex_node
        ELSE v_other_node
      END,
      dg.id, dg.name, dg.sort_order
    FROM public.dre_groups dg
    WHERE dg.company_id = p_company_id
      AND dg.nature <> 'excluded';

    INSERT INTO public.dre_layout_category_assignments(
      layout_id, company_id, category_id, group_id, classification,
      category_name_snapshot, category_type_snapshot
    )
    SELECT v_layout_id, p_company_id, fc.id,
           CASE
             WHEN dg.nature = 'excluded' THEN NULL
             WHEN fc.type = 'entrada' AND dg.nature IN ('revenue', 'non_operating') THEN lg.id
             WHEN fc.type = 'saida' AND dg.nature IN ('deduction', 'cost', 'operating_expense', 'non_operating') THEN lg.id
             WHEN fc.type = 'ambos' AND dg.nature = 'non_operating' THEN lg.id
             ELSE NULL
           END,
           CASE
             WHEN dg.nature = 'excluded' THEN 'outside_dre'
             WHEN lg.id IS NULL THEN 'unclassified'
             WHEN fc.type = 'entrada' AND dg.nature IN ('revenue', 'non_operating') THEN 'group'
             WHEN fc.type = 'saida' AND dg.nature IN ('deduction', 'cost', 'operating_expense', 'non_operating') THEN 'group'
             WHEN fc.type = 'ambos' AND dg.nature = 'non_operating' THEN 'group'
             ELSE 'unclassified'
           END,
           fc.name,
           CASE fc.type WHEN 'entrada' THEN 'income' WHEN 'saida' THEN 'expense' ELSE 'mixed' END
      FROM public.financial_categories fc
      LEFT JOIN public.dre_groups dg ON dg.id = fc.dre_group_id AND dg.company_id = p_company_id
      LEFT JOIN public.dre_layout_groups lg
        ON lg.layout_id = v_layout_id AND lg.stable_key = fc.dre_group_id
     WHERE fc.company_id = p_company_id;
  END IF;

  INSERT INTO public.dre_layout_events(company_id, layout_id, event_type, actor_id, metadata)
  VALUES (p_company_id, v_layout_id, 'draft_created', auth.uid(),
          jsonb_build_object('profileId', v_profile_id, 'version', v_version, 'clonedFrom', v_source_layout_id));
  RETURN v_layout_id;
END
$function$;

CREATE OR REPLACE FUNCTION public._dre_layout_validation(p_layout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_status text;
  v_final_count integer;
  v_macro_count integer;
  v_percentage_base_count integer;
  v_missing_categories integer;
  v_unclassified_categories integer;
  v_empty_selected_subtotals integer;
  v_outside_categories integer;
  v_empty_macros integer;
  v_incompatible_assignments integer;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT company_id, status INTO v_company_id, v_status
    FROM public.dre_layouts WHERE id = p_layout_id;
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'blockers', jsonb_build_array(
      jsonb_build_object('code', 'layout_not_found', 'message', 'Estrutura do DRE não encontrada', 'count', 1)
    ), 'warnings', '[]'::jsonb);
  END IF;

  SELECT count(*) FILTER (WHERE node_type = 'final_result'),
         count(*) FILTER (WHERE node_type = 'macro_group'),
         count(*) FILTER (WHERE is_percentage_base)
    INTO v_final_count, v_macro_count, v_percentage_base_count
    FROM public.dre_layout_nodes WHERE layout_id = p_layout_id;
  SELECT count(*) INTO v_missing_categories
    FROM public.financial_categories fc
   WHERE fc.company_id = v_company_id
     AND NOT EXISTS (
       SELECT 1 FROM public.dre_layout_category_assignments a
        WHERE a.layout_id = p_layout_id AND a.category_id = fc.id
     );
  SELECT count(*) FILTER (WHERE classification = 'unclassified'),
         count(*) FILTER (WHERE classification = 'outside_dre')
    INTO v_unclassified_categories, v_outside_categories
    FROM public.dre_layout_category_assignments WHERE layout_id = p_layout_id;
  SELECT count(*) INTO v_empty_selected_subtotals
    FROM public.dre_layout_nodes n
   WHERE n.layout_id = p_layout_id
     AND n.node_type = 'subtotal'
     AND n.calculation_kind = 'selected_macros'
     AND NOT EXISTS (
       SELECT 1 FROM public.dre_layout_calculation_sources s
        WHERE s.calculation_node_id = n.id
     );
  SELECT count(*) INTO v_empty_macros
    FROM public.dre_layout_nodes n
   WHERE n.layout_id = p_layout_id AND n.node_type = 'macro_group'
     AND NOT EXISTS (SELECT 1 FROM public.dre_layout_groups g WHERE g.macro_node_id = n.id);
  SELECT count(*) INTO v_incompatible_assignments
    FROM public.dre_layout_category_assignments a
    JOIN public.dre_layout_groups g ON g.id = a.group_id
    JOIN public.dre_layout_nodes n ON n.id = g.macro_node_id
   WHERE a.layout_id = p_layout_id
     AND a.classification = 'group'
     AND ((a.category_type_snapshot = 'income' AND n.entry_kind NOT IN ('income', 'mixed'))
       OR (a.category_type_snapshot = 'expense' AND n.entry_kind NOT IN ('expense', 'mixed'))
       OR (a.category_type_snapshot = 'mixed' AND n.entry_kind <> 'mixed'));

  IF v_status <> 'draft' THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'layout_not_draft', 'message', 'Somente um rascunho pode ser publicado', 'count', 1));
  END IF;
  IF v_final_count <> 1 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'final_result_count', 'message', 'A estrutura precisa ter exatamente um resultado final', 'count', v_final_count));
  END IF;
  IF v_macro_count = 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'missing_macro_groups', 'message', 'A estrutura precisa ter ao menos um macrogrupo', 'count', 0));
  END IF;
  IF v_percentage_base_count <> 1 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'percentage_base_count', 'message', 'Escolha exatamente um macrogrupo como base dos percentuais',
      'count', v_percentage_base_count));
  END IF;
  IF v_missing_categories > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'missing_category_assignments', 'message', 'Há categorias novas sem decisão no rascunho', 'count', v_missing_categories));
  END IF;
  IF v_unclassified_categories > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'unclassified_categories', 'message', 'Há categorias sem classificação', 'count', v_unclassified_categories));
  END IF;
  IF v_empty_selected_subtotals > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'empty_selected_subtotals', 'message', 'Há subtotal sem macrogrupo selecionado', 'count', v_empty_selected_subtotals));
  END IF;
  IF v_incompatible_assignments > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'incompatible_category_assignments',
      'message', 'Há categorias em macrogrupos incompatíveis com o tipo do lançamento',
      'count', v_incompatible_assignments));
  END IF;
  IF v_outside_categories > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'outside_dre_categories', 'message', 'Categorias explicitamente fora do DRE continuarão visíveis na auditoria',
      'count', v_outside_categories));
  END IF;
  IF v_empty_macros > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'empty_macros', 'message', 'Há macrogrupos sem grupos internos', 'count', v_empty_macros));
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings,
    'counts', jsonb_build_object(
      'macroGroups', v_macro_count,
      'unclassifiedCategories', v_unclassified_categories,
      'missingCategories', v_missing_categories,
      'outsideDreCategories', v_outside_categories
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public._dre_layout_validation(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_dre_layout(p_layout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id FROM public.dre_layouts WHERE id = p_layout_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Estrutura do DRE não encontrada' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  RETURN public._dre_layout_validation(p_layout_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.publish_dre_layout(p_layout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_profile_id uuid;
  v_version integer;
  v_validation jsonb;
BEGIN
  SELECT company_id, profile_id, version INTO v_company_id, v_profile_id, v_version
    FROM public.dre_layouts WHERE id = p_layout_id FOR UPDATE;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Estrutura do DRE não encontrada' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();
  PERFORM pg_advisory_xact_lock(hashtextextended('dre-layout:' || v_company_id::text, 0));

  v_validation := public._dre_layout_validation(p_layout_id);
  IF NOT COALESCE((v_validation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'O rascunho do DRE possui pendências: %', v_validation->'blockers'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.dre_layouts
     SET status = 'archived', archived_at = now()
   WHERE profile_id = v_profile_id AND status = 'active' AND id <> p_layout_id;
  UPDATE public.dre_layouts
     SET status = 'active', published_at = now(), published_by = auth.uid(), archived_at = NULL
   WHERE id = p_layout_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O layout deixou de ser rascunho antes da publicação'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.dre_layout_profiles
     SET active_layout_id = p_layout_id
   WHERE id = v_profile_id AND company_id = v_company_id AND NOT is_archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A configuração do DRE foi arquivada antes da publicação'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.dre_layout_events(company_id, layout_id, event_type, actor_id, metadata)
  VALUES (v_company_id, p_layout_id, 'published', auth.uid(),
          jsonb_build_object('profileId', v_profile_id, 'version', v_version, 'validation', v_validation));
  -- Publicar disponibiliza a visão, mas não muda a preferência da empresa.
  -- A ativação é uma ação separada em set_default_dre_layout_profile; assim
  -- quem usa o DRE padrão nunca troca de estrutura por publicar um rascunho.
  RETURN jsonb_build_object('activeLayoutId', p_layout_id,
                            'profileId', v_profile_id, 'version', v_version, 'validation', v_validation);
END
$function$;

CREATE OR REPLACE FUNCTION public.restore_legacy_dre(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
BEGIN
  PERFORM public._assert_dre_company_access(p_company_id);
  PERFORM public._assert_dre_manage_permission();
  PERFORM pg_advisory_xact_lock(hashtextextended('dre-layout:' || p_company_id::text, 0));

  SELECT default_profile_id INTO v_profile_id
    FROM public.company_dre_settings WHERE company_id = p_company_id FOR UPDATE;
  INSERT INTO public.company_dre_settings(company_id, mode, default_profile_id, updated_by)
  VALUES (p_company_id, 'legacy', v_profile_id, auth.uid())
  ON CONFLICT (company_id) DO UPDATE SET
    mode = 'legacy', updated_by = EXCLUDED.updated_by, updated_at = now();

  INSERT INTO public.dre_layout_events(company_id, layout_id, event_type, actor_id)
  VALUES (p_company_id, NULL, 'legacy_restored', auth.uid());
  RETURN jsonb_build_object('mode', 'legacy', 'preservedProfileId', v_profile_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.update_dre_layout_profile(
  p_profile_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_profile public.dre_layout_profiles%ROWTYPE;
BEGIN
  SELECT company_id INTO v_company_id
    FROM public.dre_layout_profiles WHERE id = p_profile_id FOR UPDATE;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Configuração do DRE não encontrada' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Informe um nome para a configuração do DRE'
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.dre_layout_profiles
     SET name = btrim(p_name), description = NULLIF(btrim(p_description), '')
   WHERE id = p_profile_id AND NOT is_archived
   RETURNING * INTO v_profile;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Configuração arquivada não pode ser editada'
      USING ERRCODE = '55000';
  END IF;
  RETURN to_jsonb(v_profile);
END
$function$;

CREATE OR REPLACE FUNCTION public.archive_dre_layout_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_is_default boolean;
BEGIN
  SELECT p.company_id,
         EXISTS (
           SELECT 1 FROM public.company_dre_settings s
            WHERE s.company_id = p.company_id
              AND s.mode = 'custom'
              AND s.default_profile_id = p.id
         )
    INTO v_company_id, v_is_default
    FROM public.dre_layout_profiles p WHERE p.id = p_profile_id FOR UPDATE;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Configuração do DRE não encontrada' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();
  IF v_is_default THEN
    RAISE EXCEPTION 'Escolha outra configuração padrão ou volte ao DRE original antes de arquivar'
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.dre_layout_profiles SET is_archived = true WHERE id = p_profile_id;
  RETURN jsonb_build_object('profileId', p_profile_id, 'archived', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.set_default_dre_layout_profile(
  p_company_id uuid,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_active_layout_id uuid;
BEGIN
  PERFORM public._assert_dre_company_access(p_company_id);
  PERFORM public._assert_dre_manage_permission();
  SELECT active_layout_id INTO v_active_layout_id
    FROM public.dre_layout_profiles
   WHERE id = p_profile_id AND company_id = p_company_id AND NOT is_archived;
  IF v_active_layout_id IS NULL THEN
    RAISE EXCEPTION 'A configuração escolhida ainda não possui versão publicada'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.company_dre_settings(company_id, mode, default_profile_id, updated_by)
  VALUES (p_company_id, 'custom', p_profile_id, auth.uid())
  ON CONFLICT (company_id) DO UPDATE SET
    mode = 'custom', default_profile_id = EXCLUDED.default_profile_id,
    updated_by = EXCLUDED.updated_by, updated_at = now();
  RETURN jsonb_build_object('mode', 'custom', 'defaultProfileId', p_profile_id,
                            'activeLayoutId', v_active_layout_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.create_dre_layout_node(
  p_layout_id uuid,
  p_node_type text,
  p_label text,
  p_entry_kind text DEFAULT NULL,
  p_calculation_kind text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_status text;
  v_node_id uuid;
  v_final_order integer;
BEGIN
  SELECT company_id, status INTO v_company_id, v_status
    FROM public.dre_layouts WHERE id = p_layout_id FOR UPDATE;
  IF v_company_id IS NULL OR v_status <> 'draft' THEN
    RAISE EXCEPTION 'Somente rascunhos podem receber novas linhas' USING ERRCODE = '23514';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();
  IF p_node_type NOT IN ('macro_group', 'subtotal') OR btrim(COALESCE(p_label, '')) = '' THEN
    RAISE EXCEPTION 'Tipo ou nome de linha inválido' USING ERRCODE = '23514';
  END IF;
  IF p_node_type = 'macro_group' AND p_entry_kind NOT IN ('income', 'expense', 'mixed') THEN
    RAISE EXCEPTION 'Tipo de macrogrupo inválido' USING ERRCODE = '23514';
  END IF;
  IF p_node_type = 'subtotal' AND p_calculation_kind NOT IN ('running_total', 'selected_macros') THEN
    RAISE EXCEPTION 'Tipo de subtotal inválido' USING ERRCODE = '23514';
  END IF;

  -- Abre espaços determinísticos sem violar a UNIQUE(layout_id, sort_order).
  UPDATE public.dre_layout_nodes SET sort_order = sort_order + 100000 WHERE layout_id = p_layout_id;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY sort_order, id)::integer * 10 AS new_order
      FROM public.dre_layout_nodes WHERE layout_id = p_layout_id
  )
  UPDATE public.dre_layout_nodes n SET sort_order = ordered.new_order
    FROM ordered WHERE ordered.id = n.id;

  SELECT sort_order INTO v_final_order FROM public.dre_layout_nodes
   WHERE layout_id = p_layout_id AND node_type = 'final_result';
  IF v_final_order IS NULL THEN
    RAISE EXCEPTION 'Rascunho sem resultado final' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.dre_layout_nodes(
    layout_id, company_id, node_type, label, sort_order, show_when_zero,
    is_percentage_base, entry_kind, affects_result, calculation_kind
  ) VALUES (
    p_layout_id, v_company_id, p_node_type, btrim(p_label), v_final_order - 5, true,
    false,
    CASE WHEN p_node_type = 'macro_group' THEN p_entry_kind ELSE NULL END,
    CASE WHEN p_node_type = 'macro_group' THEN true ELSE NULL END,
    CASE WHEN p_node_type = 'subtotal' THEN p_calculation_kind ELSE NULL END
  ) RETURNING id INTO v_node_id;
  RETURN v_node_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_dre_layout_calculation_sources(
  p_calculation_node_id uuid,
  p_macro_node_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_layout_id uuid;
  v_company_id uuid;
  v_status text;
  v_kind text;
  v_requested integer;
  v_valid integer;
BEGIN
  SELECT n.layout_id, n.company_id, l.status, n.calculation_kind
    INTO v_layout_id, v_company_id, v_status, v_kind
    FROM public.dre_layout_nodes n
    JOIN public.dre_layouts l ON l.id = n.layout_id
   WHERE n.id = p_calculation_node_id AND n.node_type = 'subtotal'
   FOR UPDATE OF l;
  IF v_layout_id IS NULL OR v_status <> 'draft' OR v_kind <> 'selected_macros' THEN
    RAISE EXCEPTION 'Subtotal selecionado inválido ou imutável' USING ERRCODE = '23514';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();

  SELECT count(DISTINCT requested.id) INTO v_requested
    FROM unnest(COALESCE(p_macro_node_ids, ARRAY[]::uuid[])) AS requested(id);
  SELECT count(*) INTO v_valid FROM public.dre_layout_nodes
   WHERE layout_id = v_layout_id
     AND id = ANY(COALESCE(p_macro_node_ids, ARRAY[]::uuid[]))
     AND node_type = 'macro_group'
     AND affects_result;
  IF v_requested <> v_valid THEN
    RAISE EXCEPTION 'Um subtotal só pode somar macrogrupos válidos da mesma visão' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.dre_layout_calculation_sources
   WHERE calculation_node_id = p_calculation_node_id;
  INSERT INTO public.dre_layout_calculation_sources(layout_id, company_id, calculation_node_id, macro_node_id)
  SELECT v_layout_id, v_company_id, p_calculation_node_id, requested.id
    FROM unnest(COALESCE(p_macro_node_ids, ARRAY[]::uuid[])) AS requested(id);
END
$function$;

CREATE OR REPLACE FUNCTION public.reorder_dre_layout_nodes(
  p_layout_id uuid,
  p_node_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_status text;
  v_expected integer;
  v_received integer;
  v_final_id uuid;
BEGIN
  SELECT company_id, status INTO v_company_id, v_status
    FROM public.dre_layouts WHERE id = p_layout_id FOR UPDATE;
  IF v_company_id IS NULL OR v_status <> 'draft' THEN
    RAISE EXCEPTION 'Somente rascunhos podem ser reordenados' USING ERRCODE = '23514';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();

  SELECT count(*) INTO v_expected
    FROM public.dre_layout_nodes
   WHERE layout_id = p_layout_id AND node_type <> 'final_result';
  SELECT id INTO v_final_id
    FROM public.dre_layout_nodes
   WHERE layout_id = p_layout_id AND node_type = 'final_result';
  SELECT count(DISTINCT requested.id) INTO v_received
    FROM unnest(COALESCE(p_node_ids, ARRAY[]::uuid[])) AS requested(id)
    JOIN public.dre_layout_nodes n ON n.id = requested.id
   WHERE n.layout_id = p_layout_id AND n.node_type <> 'final_result';
  IF cardinality(COALESCE(p_node_ids, ARRAY[]::uuid[])) <> v_expected OR v_received <> v_expected THEN
    RAISE EXCEPTION 'A ordenação precisa conter cada linha configurável exatamente uma vez'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.dre_layout_nodes SET sort_order = sort_order + 100000 WHERE layout_id = p_layout_id;
  UPDATE public.dre_layout_nodes n
     SET sort_order = requested.position * 10
    FROM unnest(p_node_ids) WITH ORDINALITY AS requested(id, position)
   WHERE n.id = requested.id AND n.layout_id = p_layout_id;
  UPDATE public.dre_layout_nodes
     SET sort_order = (v_expected + 1) * 10
   WHERE id = v_final_id AND layout_id = p_layout_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.reorder_dre_layout_groups(
  p_macro_node_id uuid,
  p_group_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_layout_id uuid;
  v_company_id uuid;
  v_status text;
  v_expected integer;
  v_received integer;
BEGIN
  SELECT n.layout_id, n.company_id, l.status
    INTO v_layout_id, v_company_id, v_status
    FROM public.dre_layout_nodes n
    JOIN public.dre_layouts l ON l.id = n.layout_id
   WHERE n.id = p_macro_node_id AND n.node_type = 'macro_group'
   FOR UPDATE OF l;
  IF v_layout_id IS NULL OR v_status <> 'draft' THEN
    RAISE EXCEPTION 'Macrogrupo inválido ou imutável' USING ERRCODE = '23514';
  END IF;
  PERFORM public._assert_dre_company_access(v_company_id);
  PERFORM public._assert_dre_manage_permission();

  SELECT count(*) INTO v_expected FROM public.dre_layout_groups
   WHERE macro_node_id = p_macro_node_id AND layout_id = v_layout_id;
  SELECT count(DISTINCT requested.id) INTO v_received
    FROM unnest(COALESCE(p_group_ids, ARRAY[]::uuid[])) AS requested(id)
    JOIN public.dre_layout_groups g ON g.id = requested.id
   WHERE g.layout_id = v_layout_id AND g.macro_node_id = p_macro_node_id;
  IF cardinality(COALESCE(p_group_ids, ARRAY[]::uuid[])) <> v_expected OR v_received <> v_expected THEN
    RAISE EXCEPTION 'A ordenação precisa conter cada grupo exatamente uma vez'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.dre_layout_groups SET sort_order = sort_order + 100000
   WHERE layout_id = v_layout_id AND macro_node_id = p_macro_node_id;
  UPDATE public.dre_layout_groups g
     SET sort_order = requested.position * 10
    FROM unnest(p_group_ids) WITH ORDINALITY AS requested(id, position)
   WHERE g.id = requested.id AND g.layout_id = v_layout_id AND g.macro_node_id = p_macro_node_id;
END
$function$;

CREATE OR REPLACE FUNCTION public._dre_layout_as_json(p_layout_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
    'layout', to_jsonb(l),
    'nodes', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.sort_order, n.id)
      FROM public.dre_layout_nodes n WHERE n.layout_id = l.id), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.macro_node_id, g.sort_order, g.id)
      FROM public.dre_layout_groups g WHERE g.layout_id = l.id), '[]'::jsonb),
    'categoryAssignments', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.category_name_snapshot, a.id)
      FROM public.dre_layout_category_assignments a WHERE a.layout_id = l.id), '[]'::jsonb),
    'sourceAssignments', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.source_key)
      FROM public.dre_layout_source_assignments s WHERE s.layout_id = l.id), '[]'::jsonb),
    'calculationSources', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.calculation_node_id, c.macro_node_id)
      FROM public.dre_layout_calculation_sources c WHERE c.layout_id = l.id), '[]'::jsonb)
  ) END
  FROM public.dre_layouts l WHERE l.id = p_layout_id
$function$;

REVOKE ALL ON FUNCTION public._dre_layout_as_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_company_dre_configuration(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_settings jsonb;
  v_profiles jsonb;
BEGIN
  PERFORM public._assert_dre_company_access(p_company_id);
  SELECT COALESCE(
    (SELECT to_jsonb(s) FROM public.company_dre_settings s WHERE s.company_id = p_company_id),
    jsonb_build_object('company_id', p_company_id, 'mode', 'legacy', 'default_profile_id', NULL)
  ) INTO v_settings;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'profile', to_jsonb(p),
    'active', public._dre_layout_as_json(p.active_layout_id),
    'draft', public._dre_layout_as_json((
      SELECT l.id FROM public.dre_layouts l
       WHERE l.profile_id = p.id AND l.status = 'draft'
       ORDER BY l.version DESC LIMIT 1
    ))
  ) ORDER BY p.is_archived, p.name, p.id), '[]'::jsonb)
  INTO v_profiles
  FROM public.dre_layout_profiles p WHERE p.company_id = p_company_id;
  RETURN jsonb_build_object(
    'settings', v_settings,
    'profiles', v_profiles
  );
END
$function$;

-- Entrada normalizada do motor custom. Reusa os motores canônicos de linhas e
COMMIT;
