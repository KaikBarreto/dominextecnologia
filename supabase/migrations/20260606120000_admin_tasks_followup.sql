-- =============================================================================
-- CRM master Auctus — Tarefas (admin_tasks) + automação de follow-up
-- Plano: docs/planos/2026-06-06-admin-crm-tarefas-followup.md (§3)
-- Origem: clone do EcoSistemaSaaS (admin_tasks + cadência de 10 follow-ups),
--   adaptado ao schema Dominex (admin_leads / admin_crm_stages /
--   admin_lead_interactions).
--
-- Por quê: trazer pro painel master da Auctus o mesmo gerenciador de tarefas +
--   automação de cadência do EcoSistema. Aditivo — nada do que existe quebra.
--
-- RLS: idêntica a admin_leads (regra definida por dev-plataforma-multitenant:
--   has_role(super_admin) OR has_admin_permission(uid,'admin_crm'), por operação).
--
-- Idempotente: enums via guarda DO/IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--   CREATE INDEX IF NOT EXISTS, DROP TRIGGER IF EXISTS antes de CREATE TRIGGER,
--   DROP POLICY IF EXISTS antes de CREATE POLICY, seed com ON CONFLICT DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums (idempotentes — só cria se não existir)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_task_type') THEN
    CREATE TYPE public.admin_task_type AS ENUM
      ('chamado','implantacao','bug','financeiro','melhoria','follow-up');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_task_status') THEN
    CREATE TYPE public.admin_task_status AS ENUM
      ('novo','em_andamento','aguardando','resolvido');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_task_priority') THEN
    CREATE TYPE public.admin_task_priority AS ENUM
      ('baixa','media','alta','urgente');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Tabela admin_tasks (§3.2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_tasks (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title         text NOT NULL,
  description   text,
  type          public.admin_task_type     NOT NULL DEFAULT 'chamado',
  status        public.admin_task_status   NOT NULL DEFAULT 'novo',
  priority      public.admin_task_priority NOT NULL DEFAULT 'media',
  assigned_to   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- created_by NULLABLE de propósito (§3.5): admin_leads.created_by pode vir nulo
  -- (origem externa); a trigger cria follow-ups mesmo sem criador.
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date      date,
  resolved_at   timestamptz,
  -- followup_step: NULL para tarefas comuns; 1..10 só em tarefas de cadência.
  followup_step smallint CHECK (followup_step IS NULL OR (followup_step BETWEEN 1 AND 10)),
  observation   text,
  completed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- follow-up some junto com o lead (CASCADE).
  crm_lead_id   uuid REFERENCES public.admin_leads(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.admin_tasks IS 'Gerenciador de tarefas do CRM master Auctus + follow-ups automáticos (cadência de 10 toques).';
COMMENT ON COLUMN public.admin_tasks.created_by    IS 'Criador da tarefa. NULLABLE: follow-up automático pode nascer de lead sem criador.';
COMMENT ON COLUMN public.admin_tasks.followup_step IS 'Passo 1..10 da cadência (NULL em tarefas comuns).';
COMMENT ON COLUMN public.admin_tasks.crm_lead_id   IS 'Lead vinculado (admin_leads). ON DELETE CASCADE: follow-up some com o lead.';

-- Índices (§3.2)
CREATE INDEX IF NOT EXISTS idx_admin_tasks_crm_lead_id ON public.admin_tasks(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_status      ON public.admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_due_date    ON public.admin_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_to ON public.admin_tasks(assigned_to);

-- Trigger updated_at — reusa a função canônica do projeto (public.update_updated_at_column).
DROP TRIGGER IF EXISTS trg_admin_tasks_updated_at ON public.admin_tasks;
CREATE TRIGGER trg_admin_tasks_updated_at
  BEFORE UPDATE ON public.admin_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 3. Tabela admin_crm_followup_template + seed (§3.3)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_crm_followup_template (
  step        smallint PRIMARY KEY CHECK (step BETWEEN 1 AND 10),
  offset_days smallint NOT NULL CHECK (offset_days >= 0)
);

COMMENT ON TABLE public.admin_crm_followup_template IS 'Cadência fixa de 10 follow-ups — offset em dias a partir do INSERT do lead. Decisão CEO: sem tela de edição.';

INSERT INTO public.admin_crm_followup_template (step, offset_days) VALUES
  (1,1),(2,2),(3,4),(4,6),(5,8),(6,11),(7,15),(8,19),(9,25),(10,31)
ON CONFLICT (step) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. RLS (§3.4) — idêntica a admin_leads (policies por operação;
--    has_role super_admin OR has_admin_permission 'admin_crm').
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin CRM users can view admin_tasks"   ON public.admin_tasks;
DROP POLICY IF EXISTS "Admin CRM users can insert admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Admin CRM users can update admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Admin CRM users can delete admin_tasks" ON public.admin_tasks;

CREATE POLICY "Admin CRM users can view admin_tasks"
  ON public.admin_tasks FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Admin CRM users can insert admin_tasks"
  ON public.admin_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Admin CRM users can update admin_tasks"
  ON public.admin_tasks FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Admin CRM users can delete admin_tasks"
  ON public.admin_tasks FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

-- admin_crm_followup_template: SELECT pra admin, escrita só super_admin.
ALTER TABLE public.admin_crm_followup_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin CRM users can view admin_crm_followup_template"  ON public.admin_crm_followup_template;
DROP POLICY IF EXISTS "Super admins manage admin_crm_followup_template"       ON public.admin_crm_followup_template;

CREATE POLICY "Admin CRM users can view admin_crm_followup_template"
  ON public.admin_crm_followup_template FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Super admins manage admin_crm_followup_template"
  ON public.admin_crm_followup_template FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- -----------------------------------------------------------------------------
-- 5. Trigger 1 — criar 10 follow-ups ao inserir lead (§3.5)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_followups_on_admin_lead_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity_name    text;
  v_stage_terminal boolean;
BEGIN
  -- Nome do lead pro título do follow-up.
  v_entity_name := COALESCE(
    NULLIF(NEW.company_name, ''),
    NULLIF(NEW.contact_name, ''),
    NULLIF(NEW.title, ''),
    'Lead sem nome'
  );

  -- Se o lead já nasce em estágio terminal (ganho/perdido), não cria cadência.
  SELECT (is_won OR is_lost) INTO v_stage_terminal
    FROM public.admin_crm_stages WHERE id = NEW.stage_id;

  IF COALESCE(v_stage_terminal, false) THEN
    RETURN NEW;
  END IF;

  -- created_by é NULLABLE em admin_tasks (§3.5): criamos os 10 follow-ups
  -- mesmo se NEW.created_by for nulo — não engolimos a cadência.
  INSERT INTO public.admin_tasks (
    type, title, due_date, status,
    assigned_to, created_by, crm_lead_id, followup_step
  )
  SELECT
    'follow-up'::public.admin_task_type,
    'Follow up ' || t.step || '/10 - ' || v_entity_name,
    (NEW.created_at::date + (t.offset_days || ' days')::interval)::date,
    'novo'::public.admin_task_status,
    NEW.responsible_id,
    NEW.created_by,
    NEW.id,
    t.step
  FROM public.admin_crm_followup_template t;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_followups_on_admin_lead_insert ON public.admin_leads;
CREATE TRIGGER trg_create_followups_on_admin_lead_insert
  AFTER INSERT ON public.admin_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.create_followups_on_admin_lead_insert();

-- -----------------------------------------------------------------------------
-- 6. Trigger 2 — limpar follow-ups pendentes ao ganhar/perder (§3.6)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_pending_followups_on_admin_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_was_terminal boolean;
  v_is_terminal  boolean;
BEGIN
  -- Sem mudança de stage, nada a fazer.
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT (is_won OR is_lost) INTO v_was_terminal
    FROM public.admin_crm_stages WHERE id = OLD.stage_id;

  SELECT (is_won OR is_lost) INTO v_is_terminal
    FROM public.admin_crm_stages WHERE id = NEW.stage_id;

  -- Só age quando saiu de NÃO-terminal pra TERMINAL.
  -- "Pendente" aqui é mais amplo que o EcoSistema: tudo que não foi resolvido
  -- (§3.6 — inclui em_andamento/aguardando). Concluídas (resolvido) ficam como
  -- histórico do que foi feito até fechar o lead.
  IF COALESCE(v_is_terminal, false) AND NOT COALESCE(v_was_terminal, false) THEN
    DELETE FROM public.admin_tasks
    WHERE crm_lead_id = NEW.id
      AND type = 'follow-up'
      AND status <> 'resolvido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_pending_followups_on_admin_lead_stage_change ON public.admin_leads;
CREATE TRIGGER trg_delete_pending_followups_on_admin_lead_stage_change
  AFTER UPDATE OF stage_id ON public.admin_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_pending_followups_on_admin_lead_stage_change();

-- -----------------------------------------------------------------------------
-- 7. Trigger 3 — registrar interação ao concluir follow-up (§3.7)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_interaction_on_followup_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Só age na transição -> resolvido, em follow-up vinculado a um lead.
  IF NEW.type <> 'follow-up' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'resolvido' OR OLD.status = 'resolvido' THEN
    RETURN NEW;
  END IF;

  IF NEW.crm_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_lead_interactions (
    lead_id, interaction_type, description, created_by
  )
  VALUES (
    NEW.crm_lead_id,
    'follow-up',
    'Follow up ' || COALESCE(NEW.followup_step::text, '?') || '/10 realizado'
      || COALESCE(' — ' || NULLIF(NEW.observation, ''), ''),
    COALESCE(NEW.completed_by, auth.uid())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_interaction_on_followup_complete ON public.admin_tasks;
CREATE TRIGGER trg_auto_interaction_on_followup_complete
  AFTER UPDATE OF status ON public.admin_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_interaction_on_followup_complete();
