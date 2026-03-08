
CREATE TABLE public.technician_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  event_type text NOT NULL DEFAULT 'tracking',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.technician_locations ENABLE ROW LEVEL SECURITY;

-- Users can insert their own locations
CREATE POLICY "Users can insert own locations"
ON public.technician_locations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admin/gestor can view all locations
CREATE POLICY "Admin/gestor can view all locations"
ON public.technician_locations
FOR SELECT
TO authenticated
USING (is_admin_or_gestor(auth.uid()));

-- Users can view own locations
CREATE POLICY "Users can view own locations"
ON public.technician_locations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_locations;

-- Index for performance
CREATE INDEX idx_technician_locations_user_created ON public.technician_locations (user_id, created_at DESC);
CREATE INDEX idx_technician_locations_event ON public.technician_locations (event_type, created_at DESC);
