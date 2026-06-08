-- Seed do mapa de módulos por plano (subscription_plans.included_modules).
-- Por quê: a coluna existia vazia ([]) nos 3 planos; o gating de módulos por
-- plano da assinatura Asaas precisa saber o que cada plano libera.
-- extra_user é add-on avulso e NÃO entra em plano nenhum.
-- Idempotente: só UPDATE por code, pode rodar 2x sem efeito colateral.

UPDATE public.subscription_plans
   SET included_modules = '["basic"]'::jsonb
 WHERE code = 'start';

UPDATE public.subscription_plans
   SET included_modules = '["basic","crm","finance_advanced","pricing_advanced","customer_portal"]'::jsonb
 WHERE code = 'avancado';

UPDATE public.subscription_plans
   SET included_modules = '["basic","rh","crm","nfe","finance_advanced","pricing_advanced","customer_portal","white_label"]'::jsonb
 WHERE code = 'master';
