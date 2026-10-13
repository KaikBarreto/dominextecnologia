-- Nova política comercial da Dominex:
--   - teste padrão de 7 dias;
--   - 5 usuários inclusos na base e R$ 20 por usuário adicional;
--   - Essencial R$ 197 (5 usuários), Pro R$ 547 (10) e Business R$ 847 (15);
--   - Precificação Avançada e Perguntas em Vídeo deixam de ser adicionais pagos
--     e passam a fazer parte da base.
--
-- Os preços dos planos prontos são a composição dos módulos atuais, sem cobrar
-- novamente pelos dois recursos movidos para a base, mais os assentos excedentes:
--   Pro      = R$ 447 em módulos + 5 x R$ 20 = R$ 547
--   Business = R$ 647 em módulos + 10 x R$ 20 = R$ 847
--
-- Não reprifica companies.subscription_value nem assinaturas já persistidas no
-- gateway. A migration atualiza o catálogo usado em novas vendas e mudanças de
-- plano; contratos existentes continuam com o snapshot comercial vigente.

ALTER TABLE public.companies
  ALTER COLUMN trial_days SET DEFAULT 7;

UPDATE public.subscription_modules
SET price = CASE code
      WHEN 'extra_user' THEN 20
      WHEN 'pricing_advanced' THEN 0
      WHEN 'video_questions' THEN 0
      ELSE price
    END,
    is_active = true,
    description = CASE code
      WHEN 'extra_user' THEN 'Adicional de R$ 20 por usuário acima dos 5 incluídos na base.'
      WHEN 'pricing_advanced' THEN 'BDI, custos globais de recursos e precificação detalhada, inclusos na base.'
      WHEN 'video_questions' THEN 'Perguntas com resposta em vídeo nos checklists de OS, inclusas na base.'
      ELSE description
    END
WHERE code IN ('extra_user', 'pricing_advanced', 'video_questions');

UPDATE public.subscription_modules
SET description = 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Contratos/PMOC, Financeiro Básico, Precificação Avançada, Perguntas em Vídeo e 5 usuários.'
WHERE code = 'basic';

UPDATE public.subscription_plans
SET price = CASE code
      WHEN 'start' THEN 197
      WHEN 'avancado' THEN 547
      WHEN 'master' THEN 847
      ELSE price
    END,
    max_users = CASE code
      WHEN 'start' THEN 5
      WHEN 'avancado' THEN 10
      WHEN 'master' THEN 15
      WHEN 'personalizado' THEN 5
      ELSE max_users
    END,
    description = CASE code
      WHEN 'start' THEN 'Para equipes de até 5 usuários'
      WHEN 'avancado' THEN 'Para equipes de até 10 usuários'
      WHEN 'master' THEN 'Para equipes de até 15 usuários'
      ELSE description
    END
WHERE code IN ('start', 'avancado', 'master', 'personalizado');

-- Append idempotente: preserva todos os módulos atuais de Pro e Business e
-- acrescenta os recursos-base onde ainda estiverem ausentes.
UPDATE public.subscription_plans
SET included_modules = CASE
  WHEN jsonb_typeof(included_modules) = 'array'
    THEN included_modules || '["pricing_advanced"]'::jsonb
  ELSE '["pricing_advanced"]'::jsonb
END
WHERE code IN ('start', 'avancado', 'master')
  AND (
    jsonb_typeof(included_modules) IS DISTINCT FROM 'array'
    OR NOT (included_modules ? 'pricing_advanced')
  );

UPDATE public.subscription_plans
SET included_modules = CASE
  WHEN jsonb_typeof(included_modules) = 'array'
    THEN included_modules || '["video_questions"]'::jsonb
  ELSE '["video_questions"]'::jsonb
END
WHERE code IN ('start', 'avancado', 'master')
  AND (
    jsonb_typeof(included_modules) IS DISTINCT FROM 'array'
    OR NOT (included_modules ? 'video_questions')
  );

-- O plano Personalizado usa company_modules como snapshot por tenant. Mantemos
-- esse contrato e materializamos os dois recursos gratuitos por empresa.
INSERT INTO public.company_modules (company_id, module_code, quantity)
SELECT c.id, feature.code, 1
FROM public.companies AS c
CROSS JOIN (VALUES ('pricing_advanced'), ('video_questions')) AS feature(code)
WHERE c.subscription_plan = 'personalizado'
ON CONFLICT (company_id, module_code) DO NOTHING;

COMMENT ON COLUMN public.subscription_plans.max_video_questions IS
  'Coluna legada da antiga diferenciação por plano. O gate comercial de perguntas em vídeo foi removido em 2026-10-13.';
