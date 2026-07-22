-- Tabela tenant_tasks — Tarefas do tenant (usuário cria tarefas com data; popup do dia + lista de pendentes)
-- RLS: espelha o padrão exato de material_groups/stocks/inventory_stock_levels
--   (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
-- Trigger de updated_at: reutiliza public.update_updated_at_column() (mesma função do repo)
-- Migration idempotente (IF NOT EXISTS / DROP ... IF EXISTS)

------------------------------------------------------------
-- 1. Tabela tenant_tasks
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL,
  title        text        NOT NULL,
  description  text,
  task_date    date        NOT NULL,
  assigned_to  uuid,
  status       text        NOT NULL DEFAULT 'pendente'
                           CHECK (status IN ('pendente', 'concluida', 'cancelada')),
  created_by   uuid,
  completed_by uuid,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_tasks
  IS 'Tarefas por empresa: popup de tarefas do dia + lista de pendentes. Status: pendente/concluida/cancelada.';

------------------------------------------------------------
-- 2. Índices
------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_tenant_tasks_company_date
  ON public.tenant_tasks (company_id, task_date);

CREATE INDEX IF NOT EXISTS idx_tenant_tasks_company_status
  ON public.tenant_tasks (company_id, status);

------------------------------------------------------------
-- 3. Trigger de updated_at (reutiliza update_updated_at_column já existente)
------------------------------------------------------------

DROP TRIGGER IF EXISTS set_tenant_tasks_updated_at ON public.tenant_tasks;
CREATE TRIGGER set_tenant_tasks_updated_at
  BEFORE UPDATE ON public.tenant_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- 4. RLS — espelha exatamente material_groups (4 policies, mesmo predicado)
------------------------------------------------------------

ALTER TABLE public.tenant_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_tasks_select_own_company ON public.tenant_tasks;
CREATE POLICY tenant_tasks_select_own_company
  ON public.tenant_tasks FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS tenant_tasks_insert_own_company ON public.tenant_tasks;
CREATE POLICY tenant_tasks_insert_own_company
  ON public.tenant_tasks FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS tenant_tasks_update_own_company ON public.tenant_tasks;
CREATE POLICY tenant_tasks_update_own_company
  ON public.tenant_tasks FOR UPDATE TO authenticated
  USING  (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS tenant_tasks_delete_own_company ON public.tenant_tasks;
CREATE POLICY tenant_tasks_delete_own_company
  ON public.tenant_tasks FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
