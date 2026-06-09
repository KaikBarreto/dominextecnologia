-- Seed do plano "Personalizado" em subscription_plans.
--
-- POR QUÊ: além dos planos prontos (start/avancado/master), o cliente pode montar
-- um plano cujo preço é DINÂMICO — calculado em runtime pela soma dos módulos
-- escolhidos (subscription_modules) + usuários extras. Essa linha é só o "âncora"
-- do plano: o valor real fica em companies.subscription_value e os módulos
-- escolhidos em company_modules quando a empresa monta o plano.
--
-- price=0          -> dinâmico; o valor cobrado vive em companies.subscription_value
-- max_users=2      -> base pequena; o limite real expande via companies.extra_users
-- included_modules=[] -> nenhum módulo fixo; tudo é escolhido em runtime
--
-- Idempotente: ON CONFLICT (code) DO NOTHING (existe UNIQUE (code) na tabela).
-- A UI de "Planos Prontos" filtra code != 'personalizado' (aba à parte).

INSERT INTO public.subscription_plans
  (code, name, price, max_users, description, features, included_modules, is_active)
VALUES
  (
    'personalizado',
    'Personalizado',
    0,
    2,
    'Monte seu plano: escolha os módulos e usuários que precisar.',
    '[]'::jsonb,
    '[]'::jsonb,
    true
  )
ON CONFLICT (code) DO NOTHING;
