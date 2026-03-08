
-- Add origin column to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS origin text DEFAULT NULL;

-- Create customer_origins table for configurable origins
CREATE TABLE IF NOT EXISTS public.customer_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text DEFAULT 'Globe',
  color text DEFAULT '#6B7280',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.customer_origins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customer_origins"
  ON public.customer_origins FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "System managers can manage customer_origins"
  ON public.customer_origins FOR ALL
  TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- Seed default origins
INSERT INTO public.customer_origins (name, icon, color) VALUES
  ('Indicação', 'UserPlus', '#10B981'),
  ('Tráfego Pago (Anúncios)', 'Megaphone', '#F97316'),
  ('Site/Google', 'Globe', '#3B82F6'),
  ('Parceiros', 'Handshake', '#8B5CF6');
