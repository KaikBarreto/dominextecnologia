-- ONDA 4 — Overhaul CRM/Catálogo: CATEGORIAS DE TIPO DE SERVIÇO
-- Espelha exatamente o shape de material_groups (Onda 1) para o catálogo de
-- tipos de serviço. A empresa cria suas próprias categorias do zero (sem seed).
--
-- Tabela: service_type_categories
--   - shape idêntico a material_groups
--   - RLS com 4 policies: predicado company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
-- Coluna: service_types.category_id uuid NULL REFERENCES service_type_categories(id) ON DELETE SET NULL
--
-- Migration idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).

------------------------------------------------------------
-- 1. Tabela service_type_categories
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_type_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  color       text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

COMMENT ON TABLE public.service_type_categories IS
  'Categorias de tipos de serviço por empresa (CRUD livre, sem seed padrão). Shape idêntico a material_groups.';

COMMENT ON COLUMN public.service_type_categories.id         IS 'PK uuid gerado automaticamente.';
COMMENT ON COLUMN public.service_type_categories.company_id IS 'Tenant owner. Obrigatório no INSERT (validado pela policy RLS).';
COMMENT ON COLUMN public.service_type_categories.name       IS 'Nome da categoria. Único por empresa.';
COMMENT ON COLUMN public.service_type_categories.color      IS 'Cor hex opcional para UI (ex: #3b82f6).';
COMMENT ON COLUMN public.service_type_categories.sort_order IS 'Ordem de exibição. Padrão 0.';

------------------------------------------------------------
-- 2. Índice em company_id (lookup por tenant)
------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_service_type_categories_company_id
  ON public.service_type_categories(company_id);

------------------------------------------------------------
-- 3. Trigger de updated_at (reutiliza função existente)
------------------------------------------------------------

DROP TRIGGER IF EXISTS set_service_type_categories_updated_at ON public.service_type_categories;
CREATE TRIGGER set_service_type_categories_updated_at
  BEFORE UPDATE ON public.service_type_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- 4. RLS — 4 policies idênticas em predicado a material_groups
--    Predicado: company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
------------------------------------------------------------

ALTER TABLE public.service_type_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_type_categories_select_own_company ON public.service_type_categories;
CREATE POLICY service_type_categories_select_own_company
  ON public.service_type_categories FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS service_type_categories_insert_own_company ON public.service_type_categories;
CREATE POLICY service_type_categories_insert_own_company
  ON public.service_type_categories FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS service_type_categories_update_own_company ON public.service_type_categories;
CREATE POLICY service_type_categories_update_own_company
  ON public.service_type_categories FOR UPDATE TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS service_type_categories_delete_own_company ON public.service_type_categories;
CREATE POLICY service_type_categories_delete_own_company
  ON public.service_type_categories FOR DELETE TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    OR is_super_admin(auth.uid())
  );

------------------------------------------------------------
-- 5. FK em service_types: nova coluna category_id
------------------------------------------------------------

ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.service_type_categories(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.service_types.category_id IS
  'Categoria do tipo de serviço (opcional). FK para service_type_categories. SET NULL ao excluir a categoria.';

------------------------------------------------------------
-- 6. Índice em service_types(category_id) — lookup por categoria
------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_service_types_category_id
  ON public.service_types(category_id);
