-- Multiple service-type support for form templates
CREATE TABLE IF NOT EXISTS public.form_template_service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  service_type_id UUID NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_form_template_service_types_template_id
  ON public.form_template_service_types(template_id);

CREATE INDEX IF NOT EXISTS idx_form_template_service_types_service_type_id
  ON public.form_template_service_types(service_type_id);

ALTER TABLE public.form_template_service_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_template_service_types'
      AND policyname = 'Authenticated users can view template-service links'
  ) THEN
    CREATE POLICY "Authenticated users can view template-service links"
      ON public.form_template_service_types
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_template_service_types'
      AND policyname = 'Authenticated users can create template-service links'
  ) THEN
    CREATE POLICY "Authenticated users can create template-service links"
      ON public.form_template_service_types
      FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_template_service_types'
      AND policyname = 'Authenticated users can delete template-service links'
  ) THEN
    CREATE POLICY "Authenticated users can delete template-service links"
      ON public.form_template_service_types
      FOR DELETE
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Backfill current single-link templates
INSERT INTO public.form_template_service_types (template_id, service_type_id)
SELECT id, service_type_id
FROM public.form_templates
WHERE service_type_id IS NOT NULL
ON CONFLICT (template_id, service_type_id) DO NOTHING;