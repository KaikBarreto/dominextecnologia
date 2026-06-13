-- Catálogo GLOBAL de equipamentos de ar-condicionado (referência da Auctus).
-- DADO DE REFERÊNCIA compartilhado por TODOS os tenants: marcas, categorias,
-- modelos e códigos de erro de fabricantes. NÃO é multi-tenant -> NÃO tem company_id.
-- Leitura: qualquer usuário autenticado. Escrita: somente super_admin Auctus.
-- Sem policy TO anon e sem ramo `company_id IS NULL OR ...` (não há company_id;
-- esse padrão já causou vazamento cross-tenant no passado).

-- ============================================================
-- TABELAS
-- ============================================================

-- Marcas (ex: Samsung, LG, Daikin, Midea)
CREATE TABLE IF NOT EXISTS public.equipment_brands (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT,
  logo_url   TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias do catálogo (ex: Split, Cassete, Piso-teto).
-- NOME: equipment_model_categories (NÃO equipment_categories — esse nome já existe
-- como tabela MULTI-TENANT de categorias por empresa, com company_id; reusá-lo
-- vazaria categorias entre tenants). Esta é a categoria GLOBAL do catálogo.
CREATE TABLE IF NOT EXISTS public.equipment_model_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Modelos de equipamento, ligados a uma marca e (opcionalmente) a uma categoria
CREATE TABLE IF NOT EXISTS public.equipment_models (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES public.equipment_brands(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.equipment_model_categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  code        TEXT,
  image_url   TEXT,
  manual_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Códigos de erro de fabricante por modelo
CREATE TABLE IF NOT EXISTS public.equipment_error_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    UUID NOT NULL REFERENCES public.equipment_models(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  title       TEXT,
  description TEXT,
  diagnosis   TEXT,
  solution    TEXT,
  component   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante que category_id aponte para o catálogo GLOBAL, não para a
-- equipment_categories multi-tenant. Idempotente: dropa o FK errado se existir
-- e recria apontando para equipment_model_categories.
ALTER TABLE public.equipment_models
  DROP CONSTRAINT IF EXISTS equipment_models_category_id_fkey;
ALTER TABLE public.equipment_models
  ADD CONSTRAINT equipment_models_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.equipment_model_categories(id) ON DELETE SET NULL;

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_equipment_models_brand_id
  ON public.equipment_models (brand_id);

CREATE INDEX IF NOT EXISTS idx_equipment_models_category_id
  ON public.equipment_models (category_id);

-- Busca "Informe o código do modelo"
CREATE INDEX IF NOT EXISTS idx_equipment_models_code
  ON public.equipment_models (code);

CREATE INDEX IF NOT EXISTS idx_equipment_error_codes_model_id
  ON public.equipment_error_codes (model_id);

-- Busca "Informe o código de erro"
CREATE INDEX IF NOT EXISTS idx_equipment_error_codes_code
  ON public.equipment_error_codes (code);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.equipment_brands           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_model_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_models           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_error_codes      ENABLE ROW LEVEL SECURITY;

-- ---------- equipment_brands ----------
DROP POLICY IF EXISTS "Authenticated can view equipment_brands"      ON public.equipment_brands;
DROP POLICY IF EXISTS "super_admin manage equipment_brands"          ON public.equipment_brands;
CREATE POLICY "Authenticated can view equipment_brands"
  ON public.equipment_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage equipment_brands"
  ON public.equipment_brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- equipment_model_categories ----------
DROP POLICY IF EXISTS "Authenticated can view equipment_model_categories" ON public.equipment_model_categories;
DROP POLICY IF EXISTS "super_admin manage equipment_model_categories"     ON public.equipment_model_categories;
CREATE POLICY "Authenticated can view equipment_model_categories"
  ON public.equipment_model_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage equipment_model_categories"
  ON public.equipment_model_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- equipment_models ----------
DROP POLICY IF EXISTS "Authenticated can view equipment_models"      ON public.equipment_models;
DROP POLICY IF EXISTS "super_admin manage equipment_models"          ON public.equipment_models;
CREATE POLICY "Authenticated can view equipment_models"
  ON public.equipment_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage equipment_models"
  ON public.equipment_models FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- equipment_error_codes ----------
DROP POLICY IF EXISTS "Authenticated can view equipment_error_codes" ON public.equipment_error_codes;
DROP POLICY IF EXISTS "super_admin manage equipment_error_codes"     ON public.equipment_error_codes;
CREATE POLICY "Authenticated can view equipment_error_codes"
  ON public.equipment_error_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage equipment_error_codes"
  ON public.equipment_error_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- service_role mantém acesso total automaticamente (bypassa RLS).
