
-- Equipment categories
CREATE TABLE public.equipment_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment_categories" ON public.equipment_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/gestor can manage equipment_categories" ON public.equipment_categories FOR ALL USING (is_admin_or_gestor(auth.uid())) WITH CHECK (is_admin_or_gestor(auth.uid()));

CREATE TRIGGER update_equipment_categories_updated_at BEFORE UPDATE ON public.equipment_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add category_id and identifier to equipment
ALTER TABLE public.equipment ADD COLUMN category_id uuid REFERENCES public.equipment_categories(id) ON DELETE SET NULL;
ALTER TABLE public.equipment ADD COLUMN identifier text;
ALTER TABLE public.equipment ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE public.equipment ADD COLUMN photo_url text;
ALTER TABLE public.equipment ADD COLUMN warranty_until date;
ALTER TABLE public.equipment ADD COLUMN custom_fields jsonb DEFAULT '{}'::jsonb;

-- Equipment custom field definitions (configurable fields)
CREATE TABLE public.equipment_field_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text', -- text, number, date, select, boolean
  options jsonb, -- for select type
  is_visible boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_field_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment_field_config" ON public.equipment_field_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/gestor can manage equipment_field_config" ON public.equipment_field_config FOR ALL USING (is_admin_or_gestor(auth.uid())) WITH CHECK (is_admin_or_gestor(auth.uid()));

CREATE TRIGGER update_equipment_field_config_updated_at BEFORE UPDATE ON public.equipment_field_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default field configs (agnostic)
INSERT INTO public.equipment_field_config (field_key, label, field_type, is_visible, is_required, position) VALUES
  ('brand', 'Marca', 'text', true, false, 1),
  ('model', 'Modelo', 'text', true, false, 2),
  ('serial_number', 'Nº de Série', 'text', true, false, 3),
  ('capacity', 'Capacidade/Especificação', 'text', true, false, 4),
  ('location', 'Local', 'text', true, false, 5),
  ('install_date', 'Data de Instalação', 'date', true, false, 6);

-- Equipment attachments
CREATE TABLE public.equipment_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  description text,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment_attachments" ON public.equipment_attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage equipment_attachments" ON public.equipment_attachments FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Equipment tasks
CREATE TABLE public.equipment_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  is_completed boolean NOT NULL DEFAULT false,
  assigned_to uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipment_tasks" ON public.equipment_tasks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage equipment_tasks" ON public.equipment_tasks FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER update_equipment_tasks_updated_at BEFORE UPDATE ON public.equipment_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for equipment files
INSERT INTO storage.buckets (id, name, public) VALUES ('equipment-files', 'equipment-files', true);

CREATE POLICY "Authenticated users can upload equipment files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'equipment-files' AND auth.uid() IS NOT NULL);
CREATE POLICY "Anyone can view equipment files" ON storage.objects FOR SELECT USING (bucket_id = 'equipment-files');
CREATE POLICY "Authenticated users can delete equipment files" ON storage.objects FOR DELETE USING (bucket_id = 'equipment-files' AND auth.uid() IS NOT NULL);
