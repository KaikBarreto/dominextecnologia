
-- Atualizar dados existentes: professional -> master
UPDATE public.companies SET subscription_plan = 'master' WHERE subscription_plan = 'professional';
UPDATE public.companies SET subscription_plan = 'avancado' WHERE subscription_plan = 'pro';
UPDATE public.companies SET subscription_plan = 'start' WHERE subscription_plan = 'starter';

-- Renomear/atualizar os planos para refletir nomenclatura nova
UPDATE public.subscription_plans SET code = 'start', name = 'Start' WHERE code = 'starter';
UPDATE public.subscription_plans SET code = 'avancado', name = 'Avançado' WHERE code = 'pro';
UPDATE public.subscription_plans SET code = 'master', name = 'Master' WHERE code = 'enterprise';
