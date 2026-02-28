
-- Add photo_url to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_url text;

-- Allow delete on pmoc_generated_os for plan cleanup
CREATE POLICY "Authenticated users can delete pmoc_generated_os"
  ON public.pmoc_generated_os
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Add frequency_type and frequency_config to pmoc_plans for advanced scheduling
ALTER TABLE public.pmoc_plans ADD COLUMN IF NOT EXISTS frequency_type text NOT NULL DEFAULT 'months';
ALTER TABLE public.pmoc_plans ADD COLUMN IF NOT EXISTS frequency_config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pmoc_plans ADD COLUMN IF NOT EXISTS generation_horizon_months integer NOT NULL DEFAULT 12;
