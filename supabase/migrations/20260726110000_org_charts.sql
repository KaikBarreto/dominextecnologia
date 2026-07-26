-- Migration: org_charts
-- Cria tabela de organogramas por tenant (dados de RH, mesmo perfil de acesso que employees).
-- RLS espelhada exatamente de public.employees (3 policies vigentes em prod).
-- Trigger de updated_at reutiliza update_updated_at_column() já existente.

-- ============================================================
-- 1. TABELA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_charts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ÍNDICE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_org_charts_company_id ON public.org_charts (company_id);

-- ============================================================
-- 3. TRIGGER DE updated_at (reutiliza função existente)
-- ============================================================
DROP TRIGGER IF EXISTS update_org_charts_updated_at ON public.org_charts;
CREATE TRIGGER update_org_charts_updated_at
  BEFORE UPDATE ON public.org_charts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. RLS — espelho exato das policies de public.employees
-- ============================================================
ALTER TABLE public.org_charts ENABLE ROW LEVEL SECURITY;

-- 4a. SELECT: qualquer autenticado do mesmo tenant pode ver
DROP POLICY IF EXISTS "Org charts visible to own company" ON public.org_charts;
CREATE POLICY "Org charts visible to own company"
  ON public.org_charts
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

-- 4b. ALL (gestores): apenas quem tem can_manage_system pode modificar;
--     WITH CHECK garante que company_id inserido/atualizado pertence ao tenant correto.
DROP POLICY IF EXISTS "Managers can manage own company org charts" ON public.org_charts;
CREATE POLICY "Managers can manage own company org charts"
  ON public.org_charts
  FOR ALL
  TO authenticated
  USING (
    (company_id = get_user_company_id(auth.uid()))
    AND can_manage_system(auth.uid())
  )
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 4c. ALL (super_admin): acesso irrestrito para operação de plataforma;
--     WITH CHECK também força company_id correto para escrita normal.
DROP POLICY IF EXISTS "Users manage own company org charts" ON public.org_charts;
CREATE POLICY "Users manage own company org charts"
  ON public.org_charts
  FOR ALL
  TO authenticated
  USING (
    (company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );
