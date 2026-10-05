-- Alinha o catalogo comercial com a politica vigente:
--   - modulo basico custa R$ 197;
--   - Portal do Cliente e gratuito, ativo e incluso nos planos prontos;
--   - empresas existentes no plano personalizado recebem o portal por tenant.
--
-- `personalizado.included_modules` permanece inalterado. Esse plano usa
-- `company_modules` como snapshot das escolhas de cada empresa; incluir modulos
-- no plano compartilhado mudaria o gate de todas as empresas personalizadas e
-- perderia a rastreabilidade do grant por tenant.
--
-- Migration apenas de dados: nao altera schema, RLS ou tipos gerados.
-- Idempotente: os upserts estabilizam o catalogo, o append evita duplicatas e o
-- backfill usa a UNIQUE (company_id, module_code).

-- Garante os itens canonicos mesmo em ambiente cujo seed esteja incompleto.
INSERT INTO public.subscription_modules
  (code, name, description, price, type, sort_order, is_active)
VALUES
  (
    'basic',
    'Módulo Básico',
    'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Contratos/PMOC e Financeiro Básico.',
    197,
    'module',
    1,
    true
  )
ON CONFLICT (code) DO UPDATE
  SET price = EXCLUDED.price;

INSERT INTO public.subscription_modules
  (code, name, description, price, type, sort_order, is_active)
VALUES
  (
    'customer_portal',
    'Portal do Cliente',
    'Área exclusiva para o cliente acompanhar OS e equipamentos.',
    0,
    'addon',
    8,
    true
  )
ON CONFLICT (code) DO UPDATE
  SET price = EXCLUDED.price,
      is_active = true;

-- Preserva os demais modulos e acrescenta o portal somente quando ausente.
-- Se algum ambiente tiver valor nulo/invalido, normaliza os tres planos
-- conhecidos para um array contendo o modulo gratuito.
UPDATE public.subscription_plans
SET included_modules = CASE
  WHEN jsonb_typeof(included_modules) = 'array'
    THEN included_modules || '["customer_portal"]'::jsonb
  ELSE '["customer_portal"]'::jsonb
END
WHERE code IN ('start', 'avancado', 'master')
  AND (
    jsonb_typeof(included_modules) IS DISTINCT FROM 'array'
    OR NOT (included_modules ? 'customer_portal')
  );

-- No personalizado, o grant continua materializado por empresa. Nao filtra por
-- status de assinatura: a migration corrige a configuracao comercial, enquanto
-- vigencia/cancelamento continua responsabilidade do gate de assinatura.
INSERT INTO public.company_modules (company_id, module_code, quantity)
SELECT c.id, 'customer_portal', 1
FROM public.companies AS c
WHERE c.subscription_plan = 'personalizado'
ON CONFLICT (company_id, module_code) DO NOTHING;
