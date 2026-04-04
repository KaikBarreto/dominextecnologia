
ALTER TABLE public.employees
ADD COLUMN monthly_cost numeric DEFAULT NULL,
ADD COLUMN monthly_cost_breakdown jsonb DEFAULT NULL;
