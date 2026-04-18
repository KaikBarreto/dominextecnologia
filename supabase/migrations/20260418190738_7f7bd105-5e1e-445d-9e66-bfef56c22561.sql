ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS segment text;

UPDATE public.companies
SET subscription_value = 650
WHERE subscription_plan = 'master' AND subscription_value = 199;