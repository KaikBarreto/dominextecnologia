UPDATE public.subscription_plans SET max_users = 15 WHERE code = 'master';
UPDATE public.companies SET max_users = 15 WHERE subscription_plan = 'master' AND max_users IN (50, 999);