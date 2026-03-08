
-- Contracts table (replaces pmoc_plans conceptually)
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  technician_id uuid,
  service_type_id uuid REFERENCES public.service_types(id),
  form_template_id uuid REFERENCES public.form_templates(id),
  status text NOT NULL DEFAULT 'active',
  notes text,
  frequency_type text NOT NULL DEFAULT 'months',
  frequency_value integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  horizon_months integer NOT NULL DEFAULT 12,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contract items
CREATE TABLE public.contract_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.equipment(id),
  item_name text NOT NULL,
  item_description text,
  form_template_id uuid REFERENCES public.form_templates(id),
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Contract occurrences
CREATE TABLE public.contract_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  service_order_id uuid REFERENCES public.service_orders(id),
  status text NOT NULL DEFAULT 'scheduled',
  occurrence_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add contract_id and origin to service_orders
ALTER TABLE public.service_orders ADD COLUMN contract_id uuid REFERENCES public.contracts(id);
ALTER TABLE public.service_orders ADD COLUMN origin text NOT NULL DEFAULT 'manual';

-- Trigger for updated_at on contracts
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company contracts"
  ON public.contracts FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin/gestor can manage contracts"
  ON public.contracts FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- RLS on contract_items
ALTER TABLE public.contract_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contract_items"
  ON public.contract_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_items.contract_id
    AND c.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Admin/gestor can manage contract_items"
  ON public.contract_items FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_items.contract_id
    AND c.company_id = get_user_company_id(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_items.contract_id
    AND c.company_id = get_user_company_id(auth.uid())
  ));

-- RLS on contract_occurrences
ALTER TABLE public.contract_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contract_occurrences"
  ON public.contract_occurrences FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_occurrences.contract_id
    AND c.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Admin/gestor can manage contract_occurrences"
  ON public.contract_occurrences FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_occurrences.contract_id
    AND c.company_id = get_user_company_id(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_occurrences.contract_id
    AND c.company_id = get_user_company_id(auth.uid())
  ));
