-- Conta demo sempre com todos os modulos ativos
--
-- Problema: a conta demo@dominex.app (usada para demonstracao comercial e para o QA
-- de navegador) tinha 13 dos 14 modulos ativos do catalogo. Faltava exatamente o `pdv`,
-- recem adicionado em 20261018160000, o que travou o QA do modulo novo. Toda vez que
-- um modulo novo entra em subscription_modules o mesmo problema se repete, porque
-- company_modules nao e retroativo.
--
-- Importante: a empresa da conta demo esta com subscription_status = 'active'
-- (nao 'testing'), entao o atalho de trial dentro de company_has_module() NAO libera
-- nada. As linhas de company_modules sao o que de fato destrava o modulo, nao sao
-- redundancia defensiva.
--
-- Solucao em tres partes:
--   1. coluna explicita public.companies.is_demo, para que a empresa demo seja
--      identificavel por dado e nao por id cravado em codigo;
--   2. marcacao dessa coluna resolvendo a empresa pelo e-mail do usuario demo
--      (auth.users -> profiles.user_id -> profiles.company_id), com RAISE NOTICE
--      do nome encontrado para auditoria;
--   3. trigger AFTER INSERT OR UPDATE OF is_active em subscription_modules que
--      concede o modulo novo a toda empresa marcada como demo.
--
-- Por que trigger e nao um atalho dentro de company_has_module(): company_has_module()
-- e caminho critico de cobranca de todos os tenants. Um ramo "se for demo retorna true"
-- ali seria regra escondida num ponto onde um erro vira receita perdida ou acesso
-- indevido. A trigger deixa o efeito visivel como dado em company_modules, auditavel
-- com um SELECT, e nao altera o gate de ninguem.
--
-- Por que is_demo e nao resolver o e-mail dentro da trigger: a trigger nao precisa
-- depender do schema auth em tempo de execucao nem quebrar silenciosamente se o
-- e-mail da conta demo mudar. O vinculo com o e-mail acontece uma vez, aqui, de
-- forma auditavel. Marcar outra empresa como demo no futuro e um UPDATE de uma linha.
--
-- Rota de fuga: DROP TRIGGER tg_subscription_modules_concede_demo ON public.subscription_modules;
-- ou simplesmente UPDATE public.companies SET is_demo = false WHERE is_demo;

-- 1) Flag explicita de empresa de demonstracao.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.is_demo IS
  'Empresa de demonstracao/sandbox. Toda empresa com is_demo = true recebe automaticamente '
  'todo modulo ativo de subscription_modules, via trigger tg_subscription_modules_concede_demo. '
  'Nao afeta cobranca nem company_has_module(). Marcada em 20261018210000 a partir do '
  'e-mail demo@dominex.app.';

CREATE INDEX IF NOT EXISTS idx_companies_is_demo
  ON public.companies (id) WHERE is_demo;

-- 2) Marcar a empresa da conta demo, resolvendo pela fonte (e-mail do usuario).
DO $$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_rows integer;
BEGIN
  SELECT p.company_id
    INTO v_company_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE lower(u.email) = 'demo@dominex.app'
    AND p.company_id IS NOT NULL
  ORDER BY p.created_at
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'conta demo@dominex.app nao encontrada ou sem company_id; nenhuma empresa marcada como demo';
  ELSE
    SELECT name INTO v_company_name FROM public.companies WHERE id = v_company_id;

    UPDATE public.companies
       SET is_demo = true
     WHERE id = v_company_id
       AND is_demo = false;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RAISE NOTICE 'empresa demo resolvida: % (id %); is_demo marcada em % linha(s)',
      COALESCE(v_company_name, '(sem nome)'), v_company_id, v_rows;
  END IF;
END $$;

-- 3) Backfill: todo modulo ativo para toda empresa demo.
DO $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT c.id, m.code
  FROM public.companies c
  CROSS JOIN public.subscription_modules m
  WHERE c.is_demo
    AND m.is_active
  ON CONFLICT (company_id, module_code) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'backfill de modulos em empresa demo: % linha(s) inserida(s)', v_rows;
END $$;

-- 4) Mecanismo duravel: modulo novo entra sozinho na conta demo.
CREATE OR REPLACE FUNCTION public.tg_concede_modulo_a_empresas_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.company_modules (company_id, module_code)
  SELECT c.id, NEW.code
  FROM public.companies c
  WHERE c.is_demo
  ON CONFLICT (company_id, module_code) DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Conveniencia de demo nunca pode derrubar uma migration que cadastra modulo novo.
  -- O bloco EXCEPTION reverte apenas a subtransacao do INSERT acima.
  RAISE WARNING 'tg_concede_modulo_a_empresas_demo: falha ao propagar modulo % para empresas demo: %',
    NEW.code, SQLERRM;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.tg_concede_modulo_a_empresas_demo() IS
  'Concede um modulo recem cadastrado/reativado de subscription_modules a toda empresa '
  'com companies.is_demo = true. Falha de forma silenciosa (RAISE WARNING) para nunca '
  'quebrar migration de catalogo.';

-- Funcao nova nasce com EXECUTE para PUBLIC neste cluster; fechar.
REVOKE ALL ON FUNCTION public.tg_concede_modulo_a_empresas_demo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_concede_modulo_a_empresas_demo() FROM anon;

DROP TRIGGER IF EXISTS tg_subscription_modules_concede_demo ON public.subscription_modules;
CREATE TRIGGER tg_subscription_modules_concede_demo
  AFTER INSERT OR UPDATE OF is_active ON public.subscription_modules
  FOR EACH ROW
  WHEN (COALESCE(NEW.is_active, false))
  EXECUTE FUNCTION public.tg_concede_modulo_a_empresas_demo();

COMMENT ON TRIGGER tg_subscription_modules_concede_demo ON public.subscription_modules IS
  'Mantem a conta demo sempre com todos os modulos. Rota de fuga: DROP TRIGGER.';
