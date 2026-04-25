-- =============================================================================
-- DRIFT: tabelas criadas manualmente no Supabase do Lovable, ausentes das migrations
-- Recriadas a partir do schema em src/integrations/supabase/types.ts
-- =============================================================================

-- 1) crm_webhooks
CREATE TABLE IF NOT EXISTS public.crm_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  origin text,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_webhooks_company_id ON public.crm_webhooks(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_webhooks_token ON public.crm_webhooks(token);
ALTER TABLE public.crm_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own company crm_webhooks" ON public.crm_webhooks;
CREATE POLICY "Users manage own company crm_webhooks" ON public.crm_webhooks
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 2) pricing_settings
CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  admin_indirect_rate numeric NOT NULL DEFAULT 0,
  card_discount_rate numeric NOT NULL DEFAULT 0,
  card_installments integer NOT NULL DEFAULT 1,
  default_profit_rate numeric NOT NULL DEFAULT 0,
  km_cost numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricing_settings_company_id ON public.pricing_settings(company_id);
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own company pricing_settings" ON public.pricing_settings;
CREATE POLICY "Users manage own company pricing_settings" ON public.pricing_settings
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 3) service_costs (custos por service_type)
CREATE TABLE IF NOT EXISTS public.service_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.service_types(id) ON DELETE CASCADE,
  hourly_rate numeric NOT NULL DEFAULT 0,
  hours numeric NOT NULL DEFAULT 0,
  labor_cost numeric,
  extra_costs jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_costs_company_id ON public.service_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_service_costs_service_id ON public.service_costs(service_id);
ALTER TABLE public.service_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own company service_costs" ON public.service_costs;
CREATE POLICY "Users manage own company service_costs" ON public.service_costs
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 4) service_materials (materiais por service_type)
CREATE TABLE IF NOT EXISTS public.service_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.service_types(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  quantity numeric NOT NULL DEFAULT 0,
  purchase_price numeric NOT NULL DEFAULT 0,
  sale_price numeric,
  subtotal numeric,
  sort_order integer,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_materials_company_id ON public.service_materials(company_id);
CREATE INDEX IF NOT EXISTS idx_service_materials_service_id ON public.service_materials(service_id);
ALTER TABLE public.service_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own company service_materials" ON public.service_materials;
CREATE POLICY "Users manage own company service_materials" ON public.service_materials
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 5) quote_item_materials (materiais de um item de orçamento; sem company_id direto, isolar via quote)
CREATE TABLE IF NOT EXISTS public.quote_item_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  quantity numeric NOT NULL,
  purchase_price numeric NOT NULL,
  subtotal numeric,
  is_manual boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_quote_item_materials_quote_item_id ON public.quote_item_materials(quote_item_id);
ALTER TABLE public.quote_item_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own quote_item_materials" ON public.quote_item_materials;
CREATE POLICY "Users manage own quote_item_materials" ON public.quote_item_materials
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quote_items qi
      JOIN public.quotes q ON q.id = qi.quote_id
      WHERE qi.id = quote_item_id
        AND (q.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quote_items qi
      JOIN public.quotes q ON q.id = qi.quote_id
      WHERE qi.id = quote_item_id
        AND (q.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
    )
  );
