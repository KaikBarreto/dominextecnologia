UPDATE public.subscription_plans SET price = 200, max_users = 5 WHERE code = 'start';
UPDATE public.subscription_plans SET price = 350, max_users = 10 WHERE code = 'avancado';
UPDATE public.subscription_plans SET price = 650, max_users = 999 WHERE code = 'master';