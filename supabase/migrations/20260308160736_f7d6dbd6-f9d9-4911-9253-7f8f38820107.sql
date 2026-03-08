
-- Customer portals table for self-service access
CREATE TABLE public.customer_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_portals ENABLE ROW LEVEL SECURITY;

-- Public can read portals (filtered by token in app)
CREATE POLICY "Public can view portal by token" ON public.customer_portals
  FOR SELECT USING (true);

-- Authenticated users can manage portals
CREATE POLICY "Authenticated can manage portals" ON public.customer_portals
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow public to insert service orders from portal
CREATE POLICY "Public can create portal tickets" ON public.service_orders
  FOR INSERT WITH CHECK (origin = 'portal');

-- Allow public to read service orders (for portal status tracking)
CREATE POLICY "Public can view service orders by customer" ON public.service_orders
  FOR SELECT USING (true);

-- Allow public to view equipment (already has a public SELECT policy but let's ensure)
-- equipment already has "Authenticated users can view equipment" with USING (true) which allows public
