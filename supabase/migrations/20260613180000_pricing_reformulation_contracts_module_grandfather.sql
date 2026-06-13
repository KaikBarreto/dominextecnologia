-- =============================================================================
-- Reformulação de precificação (aprovada pelo CEO 2026-06-13)
-- =============================================================================
-- O QUE muda:
--   1) Novo módulo pago `contracts` ("Gestão de Contratos e PMOC", R$100).
--   2) `customer_portal` passa a ser GRÁTIS (price 0) e incluso em todos os planos.
--   3) Planos renomeados/reprecificados (códigos NÃO mudam):
--        start  -> "Essencial"  R$197
--        avancado -> "Pro"      R$447
--        master -> "Business"   R$697
--   4) Grandfathering: TODAS as 17 empresas não-canceladas viram `personalizado`
--      com snapshot dos módulos do plano ATUAL + contracts + customer_portal,
--      MANTENDO subscription_value e o limite efetivo de usuários atuais.
--
-- POR QUÊ a ordem importa: o snapshot (PASSO 2) lê o included_modules ANTIGO
-- dos planos. As defs novas (PASSO 3) só entram DEPOIS do snapshot, senão o
-- grandfather materializaria os módulos novos em vez dos atuais.
--
-- LIMITE DE USUÁRIOS (gotcha crítico): o front (useCompanyModules) resolve o
-- limite efetivo assim:
--   - plano != personalizado:  max = subscription_plans.max_users + companies.extra_users
--   - plano  = personalizado:  max = companies.max_users   (extra_users IGNORADO)
-- Ao converter todo mundo pra personalizado, o limite passa a vir de
-- companies.max_users. companies.max_users HOJE pode estar defasado (ex: uma
-- avancado com companies.max_users=5 mas limite efetivo 10). Por isso, ANTES de
-- converter, congelamos companies.max_users = (plan.max_users + extra_users) e
-- zeramos extra_users (já foi dobrado em max_users), preservando o limite atual.
--
-- Idempotente: roda 2x sem duplicar (ON CONFLICT / WHERE guards).
-- Sem efeito de cobrança: não toca subscription_value, billing_cycle,
-- subscription_status, custom_price*, subscription_expires_at, pending_*.
-- Sem INSERT em subscription_payments e sem chamada Asaas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASSO 1 — Catálogo de módulos
-- -----------------------------------------------------------------------------

-- 1a) Novo módulo pago `contracts`.
INSERT INTO public.subscription_modules (code, name, description, price, type, sort_order, is_active)
VALUES (
  'contracts',
  'Gestão de Contratos e PMOC',
  'Gestão de contratos e PMOC: criação e acompanhamento de contratos, portais públicos do contrato e do PMOC, e geração de documentos (cronograma, dossiê, certificado, TRT).',
  100,
  'module',
  2,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price       = EXCLUDED.price,
      is_active   = true;

-- Reordena o catálogo de forma determinística (idempotente) pra encaixar
-- `contracts` em 2 sem colidir com os demais.
UPDATE public.subscription_modules SET sort_order = 1  WHERE code = 'basic';
UPDATE public.subscription_modules SET sort_order = 2  WHERE code = 'contracts';
UPDATE public.subscription_modules SET sort_order = 3  WHERE code = 'rh';
UPDATE public.subscription_modules SET sort_order = 4  WHERE code = 'crm';
UPDATE public.subscription_modules SET sort_order = 5  WHERE code = 'nfe';
UPDATE public.subscription_modules SET sort_order = 6  WHERE code = 'finance_advanced';
UPDATE public.subscription_modules SET sort_order = 7  WHERE code = 'pricing_advanced';
UPDATE public.subscription_modules SET sort_order = 8  WHERE code = 'customer_portal';
UPDATE public.subscription_modules SET sort_order = 9  WHERE code = 'white_label';
UPDATE public.subscription_modules SET sort_order = 10 WHERE code = 'extra_user';

-- 1b) customer_portal passa a ser grátis.
UPDATE public.subscription_modules SET price = 0 WHERE code = 'customer_portal';

-- -----------------------------------------------------------------------------
-- PASSO 2 — GRANDFATHER (rodar AINDA com as defs ANTIGAS dos planos)
-- Tudo num único bloco PL/pgSQL pra atomicidade + logging via RAISE NOTICE.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_count INT;
BEGIN
  -- 2c-pre) PRESERVAR LIMITE DE USUÁRIOS.
  -- Congela companies.max_users no limite efetivo atual (plan.max_users +
  -- extra_users) e zera extra_users, ANTES de virar personalizado.
  -- Só mexe em quem ainda NÃO é personalizado (idempotente: rerun não altera,
  -- pois no rerun todos já estão em personalizado e o WHERE não casa).
  UPDATE public.companies c
  SET max_users   = p.max_users + COALESCE(c.extra_users, 0),
      extra_users = 0
  FROM public.subscription_plans p
  WHERE p.code = c.subscription_plan
    AND c.subscription_plan <> 'personalizado'
    AND c.subscription_status NOT ILIKE '%cancel%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PASSO 2 (max_users congelado): % empresas', v_count;

  -- 2a) Materializa company_modules a partir do included_modules do plano
  -- ATUAL de cada empresa não-cancelada.
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT c.id, m.module_code
  FROM public.companies c
  JOIN public.subscription_plans p ON p.code = c.subscription_plan
  CROSS JOIN LATERAL jsonb_array_elements_text(p.included_modules) AS m(module_code)
  WHERE c.subscription_status NOT ILIKE '%cancel%'
  ON CONFLICT (company_id, module_code) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PASSO 2a (snapshot módulos do plano): % linhas inseridas', v_count;

  -- 2b) Garante contracts + customer_portal pra TODAS as não-canceladas.
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT c.id, x.code
  FROM public.companies c
  CROSS JOIN (VALUES ('contracts'), ('customer_portal')) AS x(code)
  WHERE c.subscription_status NOT ILIKE '%cancel%'
  ON CONFLICT (company_id, module_code) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PASSO 2b (contracts+customer_portal): % linhas inseridas', v_count;

  -- 2d) Converte todo mundo pra personalizado. NÃO toca em campos de cobrança.
  UPDATE public.companies
  SET subscription_plan = 'personalizado'
  WHERE subscription_status NOT ILIKE '%cancel%'
    AND subscription_plan <> 'personalizado';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PASSO 2d (-> personalizado): % empresas convertidas', v_count;
END $$;

-- -----------------------------------------------------------------------------
-- PASSO 3 — Novas defs dos planos (DEPOIS do snapshot)
-- -----------------------------------------------------------------------------
UPDATE public.subscription_plans
SET name = 'Essencial',
    price = 197,
    included_modules = '["basic","customer_portal"]'::jsonb
WHERE code = 'start';

UPDATE public.subscription_plans
SET name = 'Pro',
    price = 447,
    included_modules = '["basic","customer_portal","rh","finance_advanced","contracts"]'::jsonb
WHERE code = 'avancado';

UPDATE public.subscription_plans
SET name = 'Business',
    price = 697,
    included_modules = '["basic","customer_portal","rh","crm","nfe","finance_advanced","pricing_advanced","white_label","contracts"]'::jsonb
WHERE code = 'master';

-- personalizado: name permanece 'Personalizado' (não muda).
