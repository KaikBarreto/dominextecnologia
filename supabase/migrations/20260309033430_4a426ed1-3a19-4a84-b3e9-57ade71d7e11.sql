
CREATE TABLE public.admin_financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  transaction_date timestamptz NOT NULL DEFAULT now(),
  reference_type text,
  reference_id uuid,
  created_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage admin_financial_transactions"
  ON public.admin_financial_transactions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.company_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'renewal',
  payment_method text,
  payment_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  origin text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage company_payments"
  ON public.company_payments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));
