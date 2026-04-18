-- ============================================================
-- MIGRATION 1: Adicionar company_id às tabelas core + backfill
-- Backfill atribui todos os dados existentes à Glacial Cold Brasil
-- (única empresa com dados reais em produção)
-- ============================================================

-- Helper: ID da Glacial Cold Brasil
-- 478ee686-12dd-40a8-880a-a7375764a5a0

-- 1. CUSTOMERS
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.customers SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.customers ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);

-- 2. EMPLOYEES
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.employees SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.employees ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);

-- 3. EQUIPMENT
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.equipment SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.equipment ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_company_id ON public.equipment(company_id);

-- 4. INVENTORY
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.inventory SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.inventory ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_company_id ON public.inventory(company_id);

-- 5. FINANCIAL_TRANSACTIONS
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.financial_transactions SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.financial_transactions ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_id ON public.financial_transactions(company_id);

-- 6. SERVICE_ORDERS
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.service_orders SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.service_orders ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_company_id ON public.service_orders(company_id);

-- 7. SERVICE_TYPES
ALTER TABLE public.service_types ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.service_types SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.service_types ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_types_company_id ON public.service_types(company_id);

-- 8. TEAMS
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.teams SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.teams ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teams_company_id ON public.teams(company_id);

-- 9. TASK_TYPES
ALTER TABLE public.task_types ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.task_types SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.task_types ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_types_company_id ON public.task_types(company_id);

-- 10. OS_STATUSES
ALTER TABLE public.os_statuses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.os_statuses SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.os_statuses ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_os_statuses_company_id ON public.os_statuses(company_id);

-- 11. QUOTES
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.quotes SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.quotes ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON public.quotes(company_id);

-- 12. LEADS (sem dados, mas precisa coluna)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.leads ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON public.leads(company_id);

-- 13. PMOC_CONTRACTS (sem dados)
ALTER TABLE public.pmoc_contracts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE public.pmoc_contracts ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pmoc_contracts_company_id ON public.pmoc_contracts(company_id);

-- 14. CUSTOMER_ORIGINS (catálogo por empresa)
ALTER TABLE public.customer_origins ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.customer_origins SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.customer_origins ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_origins_company_id ON public.customer_origins(company_id);

-- 15. EQUIPMENT_CATEGORIES
ALTER TABLE public.equipment_categories ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.equipment_categories SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.equipment_categories ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_categories_company_id ON public.equipment_categories(company_id);

-- 16. EQUIPMENT_FIELD_CONFIG
ALTER TABLE public.equipment_field_config ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.equipment_field_config SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.equipment_field_config ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_field_config_company_id ON public.equipment_field_config(company_id);

-- 17. FORM_TEMPLATES
ALTER TABLE public.form_templates ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.form_templates SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.form_templates ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_templates_company_id ON public.form_templates(company_id);

-- 18. CRM_STAGES
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;
UPDATE public.crm_stages SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;
ALTER TABLE public.crm_stages ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_stages_company_id ON public.crm_stages(company_id);

-- ============================================================
-- BACKFILL: profiles.company_id para auditoria
-- (já está OK conforme verificação anterior)
-- ============================================================

-- ============================================================
-- TABELA LGPD: consent_records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  revoked_at timestamptz
);
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consent records" ON public.consent_records
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consent records" ON public.consent_records
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Super admins can view all consent records" ON public.consent_records
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_consent_records_user ON public.consent_records(user_id);

-- Coluna deletion_requested_at em profiles (LGPD Art. 18)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;