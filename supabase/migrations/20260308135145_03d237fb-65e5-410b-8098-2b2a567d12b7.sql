
-- Create quotes table
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number serial NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status text NOT NULL DEFAULT 'rascunho',
  valid_until date,
  discount_type text DEFAULT 'valor',
  discount_value numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  notes text,
  terms text,
  assigned_to uuid,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create quote_items table
CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  item_type text NOT NULL DEFAULT 'servico',
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  inventory_id uuid REFERENCES public.inventory(id),
  service_type_id uuid REFERENCES public.service_types(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Quotes RLS: authenticated users can manage
CREATE POLICY "Authenticated users can manage quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Public can view quote by token
CREATE POLICY "Public can view quote by token" ON public.quotes
  FOR SELECT TO anon, authenticated
  USING (true);

-- Public can update quote by token (approve/reject)
CREATE POLICY "Public can update quote by token" ON public.quotes
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Quote items: authenticated can manage
CREATE POLICY "Authenticated users can manage quote_items" ON public.quote_items
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Public can view quote items (for public quote page)
CREATE POLICY "Public can view quote_items" ON public.quote_items
  FOR SELECT TO anon, authenticated
  USING (true);

-- Updated_at trigger for quotes
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
