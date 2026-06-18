-- =============================================================================
-- PMOC: frequências por serviço dentro de um contrato — Fase 1 (schema)
-- Plano: docs/planos/2026-06-17-pmoc-frequencias-por-servico.md
--
-- Hoje o contrato tem UMA frequência (contracts.frequency_type/value) pra todos
-- os itens. Esta migration cria a base pra frequência POR serviço/atividade:
--
--   1) contract_plan_activities  — o "plano" do contrato: cada atividade/serviço
--      com sua própria periodicidade (mensal/trimestral/.../custom em meses).
--   2) service_order_activities  — snapshot do que vence numa visita/OS; é o que
--      dirige o checklist (a visita do mês junta tudo que vence).
--
-- NÃO é a Fase 2 (catálogo global). catalog_activity_id fica nullable sem FK.
--
-- Multi-tenant: ambas têm company_id direto e RLS isolando por empresa, no
-- padrão canônico do projeto (igual service_orders/nps_settings):
--   company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(...)
-- Sem UNIQUE global. updated_at via helper public.update_updated_at_column().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) contract_plan_activities — plano do contrato (serviço + frequência)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_plan_activities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,
  contract_id         uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  -- nullable: atividade do plano todo (NULL) OU de um equipamento específico.
  contract_item_id    uuid REFERENCES public.contract_items(id) ON DELETE CASCADE,
  -- Fase 2: catálogo global. Coluna nullable sem FK por enquanto.
  catalog_activity_id uuid,
  section             text,
  component           text,
  description         text NOT NULL,
  -- M=mensal, T=trimestral, S=semestral, A=anual, E=eventual.
  freq_code           text CHECK (freq_code IN ('M','T','S','A','E')),
  -- caso genérico não-PMOC: frequência custom em meses. Um de freq_code/freq_months
  -- governa a periodicidade.
  freq_months         integer,
  is_measurement      boolean NOT NULL DEFAULT false,
  unit                text,
  expected_min        numeric,
  expected_max        numeric,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_plan_activities_company_contract
  ON public.contract_plan_activities (company_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_plan_activities_contract_sort
  ON public.contract_plan_activities (contract_id, sort_order);

COMMENT ON TABLE public.contract_plan_activities IS
  'Plano do contrato: cada atividade/serviço com sua própria frequência (freq_code PMOC ou freq_months custom). Fase 1 das frequências por serviço.';

-- -----------------------------------------------------------------------------
-- 2) service_order_activities — snapshot do que vence na visita/OS (checklist)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_order_activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL,
  service_order_id  uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  -- vínculo com o plano; SET NULL pra preservar o snapshot histórico mesmo se o
  -- plano for removido (o snapshot já guardou description/freq/limites).
  plan_activity_id  uuid REFERENCES public.contract_plan_activities(id) ON DELETE SET NULL,
  section           text,
  component         text,
  description       text NOT NULL,
  freq_code         text CHECK (freq_code IN ('M','T','S','A','E')),
  is_measurement    boolean NOT NULL DEFAULT false,
  unit              text,
  expected_min      numeric,
  expected_max      numeric,
  sort_order        integer NOT NULL DEFAULT 0,
  conformity_status text CHECK (conformity_status IN ('conforme','nao_conforme','na')),
  measured_value    numeric,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_order_activities_company_os
  ON public.service_order_activities (company_id, service_order_id);

COMMENT ON TABLE public.service_order_activities IS
  'Snapshot das atividades que vencem numa visita/OS (drive do checklist). Agrupa tudo que vence no mês; guarda conformidade e medição.';

-- -----------------------------------------------------------------------------
-- 3) Triggers de updated_at (helper canônico do projeto)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_contract_plan_activities_updated_at ON public.contract_plan_activities;
CREATE TRIGGER set_contract_plan_activities_updated_at
  BEFORE UPDATE ON public.contract_plan_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_service_order_activities_updated_at ON public.service_order_activities;
CREATE TRIGGER set_service_order_activities_updated_at
  BEFORE UPDATE ON public.service_order_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4) RLS — padrão tenant canônico (company_id direto + super_admin)
--    4 operações explícitas (SELECT/INSERT/UPDATE/DELETE) + service_role.
--    INSERT exige company_id correto no payload (WITH CHECK).
-- -----------------------------------------------------------------------------

-- ===== contract_plan_activities =====
ALTER TABLE public.contract_plan_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_contract_plan_activities" ON public.contract_plan_activities;
CREATE POLICY "service_role_full_access_contract_plan_activities"
  ON public.contract_plan_activities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own company contract_plan_activities" ON public.contract_plan_activities;
CREATE POLICY "Users can view own company contract_plan_activities"
  ON public.contract_plan_activities FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own company contract_plan_activities" ON public.contract_plan_activities;
CREATE POLICY "Users can insert own company contract_plan_activities"
  ON public.contract_plan_activities FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own company contract_plan_activities" ON public.contract_plan_activities;
CREATE POLICY "Users can update own company contract_plan_activities"
  ON public.contract_plan_activities FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own company contract_plan_activities" ON public.contract_plan_activities;
CREATE POLICY "Users can delete own company contract_plan_activities"
  ON public.contract_plan_activities FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- ===== service_order_activities =====
ALTER TABLE public.service_order_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_service_order_activities" ON public.service_order_activities;
CREATE POLICY "service_role_full_access_service_order_activities"
  ON public.service_order_activities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own company service_order_activities" ON public.service_order_activities;
CREATE POLICY "Users can view own company service_order_activities"
  ON public.service_order_activities FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own company service_order_activities" ON public.service_order_activities;
CREATE POLICY "Users can insert own company service_order_activities"
  ON public.service_order_activities FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own company service_order_activities" ON public.service_order_activities;
CREATE POLICY "Users can update own company service_order_activities"
  ON public.service_order_activities FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own company service_order_activities" ON public.service_order_activities;
CREATE POLICY "Users can delete own company service_order_activities"
  ON public.service_order_activities FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );
