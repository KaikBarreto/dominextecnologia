UPDATE public.subscription_plans SET max_users = 50 WHERE code = 'master';
UPDATE public.companies SET max_users = 50 WHERE subscription_plan = 'master' AND max_users = 999;