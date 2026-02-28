
-- Create table for custom OS statuses
CREATE TABLE public.os_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.os_statuses ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view os_statuses"
ON public.os_statuses FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage os_statuses"
ON public.os_statuses FOR ALL
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

-- Insert default statuses
INSERT INTO public.os_statuses (key, label, color, position, is_default) VALUES
  ('pendente', 'Pendente', '#f59e0b', 0, true),
  ('em_andamento', 'Em Andamento', '#3b82f6', 1, true),
  ('concluida', 'Concluída', '#22c55e', 2, true),
  ('cancelada', 'Cancelada', '#ef4444', 3, true);
