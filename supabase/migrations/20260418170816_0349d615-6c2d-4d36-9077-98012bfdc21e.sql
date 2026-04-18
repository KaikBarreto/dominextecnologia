-- ============================================
-- Tabela: salespeople (Vendedores)
-- ============================================
CREATE TABLE public.salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  phone text,
  salary numeric NOT NULL DEFAULT 0,
  monthly_goal int NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  no_commission boolean NOT NULL DEFAULT false,
  referral_code text UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salespeople ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage salespeople"
  ON public.salespeople FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_salespeople_updated_at
  BEFORE UPDATE ON public.salespeople
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Função: gerar referral_code automático
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug text;
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL AND length(NEW.referral_code) > 0 THEN
    RETURN NEW;
  END IF;

  -- slug do primeiro nome (lowercase, sem acentos/espaços)
  base_slug := lower(regexp_replace(
    translate(split_part(NEW.name, ' ', 1),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^a-z0-9]', '', 'g'
  ));

  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'vend';
  END IF;

  LOOP
    candidate := base_slug || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.salespeople WHERE referral_code = candidate);
    attempts := attempts + 1;
    EXIT WHEN attempts > 10;
  END LOOP;

  NEW.referral_code := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER salespeople_generate_referral_code
  BEFORE INSERT ON public.salespeople
  FOR EACH ROW EXECUTE FUNCTION public.generate_referral_code();

-- ============================================
-- Tabela: salesperson_sales (Vendas)
-- ============================================
CREATE TABLE public.salesperson_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_name text,
  customer_origin text,
  customer_company text,
  amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.salesperson_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage salesperson_sales"
  ON public.salesperson_sales FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_salesperson_sales_salesperson ON public.salesperson_sales(salesperson_id);
CREATE INDEX idx_salesperson_sales_company ON public.salesperson_sales(company_id);
CREATE INDEX idx_salesperson_sales_created_at ON public.salesperson_sales(created_at DESC);

-- ============================================
-- Tabela: salesperson_advances (Vales)
-- ============================================
CREATE TABLE public.salesperson_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  reference_month date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.salesperson_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage salesperson_advances"
  ON public.salesperson_advances FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_salesperson_advances_salesperson ON public.salesperson_advances(salesperson_id);

-- ============================================
-- Tabela: salesperson_payments (Pagamentos mensais)
-- ============================================
CREATE TABLE public.salesperson_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  salary_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  advances_deducted numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  reference_month date NOT NULL,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.salesperson_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage salesperson_payments"
  ON public.salesperson_payments FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_salesperson_payments_salesperson ON public.salesperson_payments(salesperson_id);
CREATE INDEX idx_salesperson_payments_ref_month ON public.salesperson_payments(reference_month DESC);

-- ============================================
-- Companies: campos de vendedor + preço custom
-- ============================================
ALTER TABLE public.companies
  ADD COLUMN salesperson_id uuid REFERENCES public.salespeople(id) ON DELETE SET NULL,
  ADD COLUMN custom_price numeric,
  ADD COLUMN custom_price_months int,
  ADD COLUMN custom_price_payments_made int NOT NULL DEFAULT 0,
  ADD COLUMN custom_price_permanent boolean NOT NULL DEFAULT false;

CREATE INDEX idx_companies_salesperson ON public.companies(salesperson_id);