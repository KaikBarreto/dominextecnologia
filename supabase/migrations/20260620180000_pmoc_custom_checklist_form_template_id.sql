-- PMOC por equipamento — Checklists personalizados por máquina (Fase 1: schema)
-- Permite que uma atividade do plano da máquina aponte para um form_template (questionário
-- personalizado do tenant, criado em /checklists). Atividade custom =
--   catalog_activity_id NULL + form_template_id SETADO + contract_item_id = máquina + freq_code.
-- O snapshot da visita (service_order_activities) também carrega o form_template_id para o
-- checklist saber renderizar as perguntas do template naquele equipamento.
-- Colunas novas, nullable, sem backfill: dados existentes ficam NULL = atividade normal do catálogo.
-- RLS: ambas as tabelas já têm RLS multi-tenant; a coluna herda. form_templates é por company_id;
-- a FK é só integridade referencial (a app garante mesmo tenant).

-- contract_plan_activities.form_template_id
ALTER TABLE public.contract_plan_activities
  ADD COLUMN IF NOT EXISTS form_template_id uuid;

ALTER TABLE public.contract_plan_activities
  DROP CONSTRAINT IF EXISTS contract_plan_activities_form_template_id_fkey;
ALTER TABLE public.contract_plan_activities
  ADD CONSTRAINT contract_plan_activities_form_template_id_fkey
  FOREIGN KEY (form_template_id) REFERENCES public.form_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_plan_activities_form_template_id
  ON public.contract_plan_activities (form_template_id)
  WHERE form_template_id IS NOT NULL;

-- service_order_activities.form_template_id (snapshot da visita)
ALTER TABLE public.service_order_activities
  ADD COLUMN IF NOT EXISTS form_template_id uuid;

ALTER TABLE public.service_order_activities
  DROP CONSTRAINT IF EXISTS service_order_activities_form_template_id_fkey;
ALTER TABLE public.service_order_activities
  ADD CONSTRAINT service_order_activities_form_template_id_fkey
  FOREIGN KEY (form_template_id) REFERENCES public.form_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_order_activities_form_template_id
  ON public.service_order_activities (form_template_id)
  WHERE form_template_id IS NOT NULL;
