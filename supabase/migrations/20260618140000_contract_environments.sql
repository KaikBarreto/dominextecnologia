-- =============================================================================
-- PMOC: ambientes climatizados por contrato (1 contrato -> N ambientes)
-- -----------------------------------------------------------------------------
-- Hoje os dados de ambiente vivem como 6 colunas únicas em `contracts`
-- (pmoc_tipo_atividade, pmoc_identificacao_ambiente, pmoc_area_climatizada_m2,
--  pmoc_ocupantes_fixos, pmoc_ocupantes_flutuantes, pmoc_carga_termica_tr),
-- o que só comporta UM ambiente por contrato. Um contrato PMOC real gerencia
-- vários ambientes (ex.: 4 unidades), cada um com dados próprios e seus
-- próprios equipamentos.
--
-- Esta migration cria a tabela `contract_environments` (N por contrato) e
-- amarra cada equipamento (contract_items) a um ambiente via environment_id.
-- As 6 colunas legadas em `contracts` NÃO são dropadas (compat).
--
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS). Padrão RLS tenant canônico
-- (company_id direto + super_admin), espelhando contract_plan_activities.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela contract_environments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_environments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,
  contract_id         uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  identificacao       text,
  tipo_atividade      text,
  area_climatizada_m2 numeric,
  ocupantes_fixos     integer,
  ocupantes_flutuantes integer,
  carga_termica_tr    numeric,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_environments_company_contract
  ON public.contract_environments (company_id, contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_environments_contract_sort
  ON public.contract_environments (contract_id, sort_order);

-- -----------------------------------------------------------------------------
-- 2) contract_items.environment_id -> a qual ambiente o equipamento pertence
-- -----------------------------------------------------------------------------
ALTER TABLE public.contract_items
  ADD COLUMN IF NOT EXISTS environment_id uuid
  REFERENCES public.contract_environments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_items_environment_id
  ON public.contract_items (environment_id);

-- -----------------------------------------------------------------------------
-- 3) Trigger de updated_at (helper canônico do projeto)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_contract_environments_updated_at ON public.contract_environments;
CREATE TRIGGER set_contract_environments_updated_at
  BEFORE UPDATE ON public.contract_environments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4) RLS — padrão tenant canônico (company_id direto + super_admin)
--    4 operações explícitas (SELECT/INSERT/UPDATE/DELETE) + service_role.
--    INSERT exige company_id correto no payload (WITH CHECK).
--    `contract_items` já tem RLS própria — a coluna nova é coberta, NÃO mexer.
-- -----------------------------------------------------------------------------
ALTER TABLE public.contract_environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_contract_environments" ON public.contract_environments;
CREATE POLICY "service_role_full_access_contract_environments"
  ON public.contract_environments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own company contract_environments" ON public.contract_environments;
CREATE POLICY "Users can view own company contract_environments"
  ON public.contract_environments FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own company contract_environments" ON public.contract_environments;
CREATE POLICY "Users can insert own company contract_environments"
  ON public.contract_environments FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own company contract_environments" ON public.contract_environments;
CREATE POLICY "Users can update own company contract_environments"
  ON public.contract_environments FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own company contract_environments" ON public.contract_environments;
CREATE POLICY "Users can delete own company contract_environments"
  ON public.contract_environments FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );
