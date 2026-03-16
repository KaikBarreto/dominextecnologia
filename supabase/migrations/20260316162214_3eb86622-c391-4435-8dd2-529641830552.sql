
-- 1. Create task_types table (similar to service_types)
CREATE TABLE public.task_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  description text,
  icon text DEFAULT 'CheckSquare',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view task_types"
  ON public.task_types FOR SELECT TO public
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "System managers can manage task_types"
  ON public.task_types FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 2. Add task/recurrence fields to service_orders
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'os',
  ADD COLUMN IF NOT EXISTS task_title text,
  ADD COLUMN IF NOT EXISTS task_type_id uuid REFERENCES public.task_types(id),
  ADD COLUMN IF NOT EXISTS recurrence_type text,
  ADD COLUMN IF NOT EXISTS recurrence_interval integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

-- Index for recurrence group queries
CREATE INDEX IF NOT EXISTS idx_service_orders_recurrence_group 
  ON public.service_orders(recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;

-- Index for entry_type filtering
CREATE INDEX IF NOT EXISTS idx_service_orders_entry_type
  ON public.service_orders(entry_type);
