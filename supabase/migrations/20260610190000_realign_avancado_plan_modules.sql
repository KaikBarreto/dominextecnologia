-- =============================================================================
-- Realinha os módulos inclusos do plano "Avançado" (R$350) ao guia comercial.
--
-- ANTES: ["basic","crm","finance_advanced","pricing_advanced","customer_portal"]
-- DEPOIS: ["basic","rh","finance_advanced"]  (Básico + RH + Financeiro Avançado)
--
-- Por quê: o catálogo divergia do material de vendas. CRM, precificação avançada
-- e portal do cliente NÃO fazem parte do plano Avançado — passam a ser exclusivos
-- do Master ou addon avulso (company_modules). 1 empresa está nesse plano e o
-- impacto já foi aceito pelo CEO.
--
-- Idempotente: UPDATE com valor literal — rodar N vezes converge ao mesmo estado.
-- =============================================================================

UPDATE public.subscription_plans
   SET included_modules = '["basic","rh","finance_advanced"]'::jsonb
 WHERE code = 'avancado';
