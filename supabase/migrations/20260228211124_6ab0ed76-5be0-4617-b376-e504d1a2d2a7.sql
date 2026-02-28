-- Add number_prefix column to service_types
ALTER TABLE public.service_types ADD COLUMN number_prefix text DEFAULT NULL;