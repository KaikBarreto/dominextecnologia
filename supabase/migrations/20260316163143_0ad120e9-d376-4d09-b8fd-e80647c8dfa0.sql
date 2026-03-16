
-- Junction table for multi-assignee support on service orders/tasks
CREATE TABLE public.service_order_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_order_id, user_id)
);

ALTER TABLE public.service_order_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assignees"
  ON public.service_order_assignees FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage assignees"
  ON public.service_order_assignees FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index for fast lookups
CREATE INDEX idx_so_assignees_order ON public.service_order_assignees(service_order_id);
CREATE INDEX idx_so_assignees_user ON public.service_order_assignees(user_id);
