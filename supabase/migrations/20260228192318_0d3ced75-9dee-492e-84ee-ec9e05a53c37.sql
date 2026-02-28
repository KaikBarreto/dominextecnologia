
-- Add requires_equipment flag to service_types
ALTER TABLE public.service_types ADD COLUMN requires_equipment boolean NOT NULL DEFAULT true;
