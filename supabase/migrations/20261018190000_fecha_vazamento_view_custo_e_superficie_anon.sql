-- =====================================================================
-- ONDA 1: fecha vazamento de estrutura de custo e estreita a superficie `anon`
--
-- Regra definida por: Dev Plataforma & Multi-tenant (2026-10-18)
-- SQL escrito e aplicado por: Dev Database (2026-10-18)
--
-- ===================== O VAZAMENTO (medido, nao suposto) =============
--
-- `public.cost_resources_with_rate` estava SEM `security_invoker`, logo
-- rodava com o privilegio do DONO (postgres) e ignorava por completo a
-- RLS de `cost_resources` / `cost_resource_items`. O papel `anon` tinha
-- SELECT na view. Resultado medido em producao com a CHAVE PUBLICA em
-- 2026-10-18, antes desta migration:
--
--   GET /rest/v1/cost_resources_with_rate?select=company_id,name,hourly_rate
--     -> HTTP 200, 57 linhas, 2 empresas distintas
--   GET /rest/v1/cost_resources?select=id
--     -> HTTP 200, []            (a TABELA negava certo; so a view vazava)
--
-- O que estava exposto nao e metadado: e `company_id`, `name`,
-- `total_monthly_cost` e `hourly_rate`, ou seja, a estrutura de custo e o
-- valor-hora de varios tenants, legivel por qualquer um na internet.
--
-- Vazava TAMBEM entre tenants logados. Com JWT real de um admin da
-- empresa 478ee686 (role `admin`, sem super_admin), antes desta migration:
--   view   cost_resources_with_rate -> 57 linhas, 2 empresas
--   tabela cost_resources           -> 55 linhas, 1 empresa
-- E com JWT real de admin de empresa SEM recurso de custo cadastrado, a
-- view devolvia as mesmas 57 linhas onde o correto eram 0.
--
-- ===================== DESDE QUANDO (rastreado) ======================
--
-- A view NAO nasceu errada por descuido unico; a protecao foi posta e
-- depois perdida numa troca de coluna:
--   20260309023425: cria a view, SEM `security_invoker`.
--   20260309023437: recria COM `security_invoker = true`, com o comentario
--                   "Fix security definer view warning". Estava correto.
--   20260316040419: adiciona a coluna `photo_url` em `cost_resources` e
--                   faz DROP VIEW + CREATE VIEW SEM repetir o
--                   `WITH (security_invoker = true)`. AQUI a protecao caiu.
--
-- Ou seja: o furo esta aberto desde 2026-03-16, cerca de 7 meses, e nao
-- tem relacao nenhuma com o PDV. Licao que fica: `DROP VIEW` + `CREATE
-- VIEW` perde reloptions e GRANTs; quem recria view por causa de coluna
-- nova tem de repetir `WITH (security_invoker = true)`.
--
-- ===================== OS 3 PASSOS, NESTA ORDEM ======================
--
-- PASSO 1: 15 policies que estavam com role `{public}` por OMISSAO (quem
--          escreveu esqueceu o `TO authenticated`) passam a
--          `TO authenticated`. O predicado NAO muda: usa-se
--          `ALTER POLICY ... TO ...`, que mexe so na lista de roles.
--
-- PASSO 2: a view ganha `security_invoker = true` e perde o grant de `anon`.
--
-- PASSO 3: revoga `EXECUTE` de `anon` nas 4 funcoes SECURITY DEFINER que
--          serviam de oraculo cross-tenant (`get_user_company_id`,
--          `has_role`, `can_manage_system`, `is_super_admin`).
--
-- ATENCAO, A ORDEM NAO E COSMETICA: o PASSO 3 TEM de vir DEPOIS do PASSO 1.
--   Expressao de policy e avaliada com o privilegio de QUEM consulta.
--   Enquanto as 15 policies estiverem `{public}` elas sao aplicaveis a
--   `anon`; se `anon` perder o EXECUTE primeiro, a avaliacao estoura
--   `42501 permission denied for function` e o PostgREST devolve ERRO no
--   lugar de um deny limpo (HTTP 200 + lista vazia), o que transforma um
--   endurecimento de seguranca em queda de portal publico.
--   Conferido no banco antes de aplicar: das 15, exatamente 13 citam as 4
--   funcoes e todas as 13 estao nesta lista, entao depois do PASSO 1
--   sobra ZERO policy aplicavel a `anon` citando as 4.
--   Se algum dia for preciso quebrar em duas migrations, o PASSO 1 vai na
--   primeira, sozinho.
--
-- ===================== O QUE NAO ENTRA AQUI, DE PROPOSITO ============
--
-- `is_valid_portal_ticket_context` e `is_customer_in_active_portal`
-- MANTEM o EXECUTE de `anon`: sao citadas por policies genuinamente
-- `{anon}` (abertura de chamado no portal e envio de formulario) e nao
-- chamam nenhuma das 4 acima. A guarda no fim desta migration se recusa a
-- commitar se alguem revogar essas duas por engano.
--
-- Tambem ficam fora: as 10 policies `{anon}` de portal/token, as policies
-- `{public}` intencionalmente publicas (blog, nfse_tiers, whatsapp_tiers,
-- proposal_templates) e o recorte de empresa de `service_cost_resources` /
-- `service_gifts` (vazamento separado, entre tenants logados, que precisa
-- de QA de navegador e vai em migration propria).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PASSO 1: 15 policies `{public}` por omissao  ->  `TO authenticated`
--
-- Prova de que nada se perde: `anon` tem `auth.uid()` NULL, logo as 9
-- tabelas abaixo ja devolviam `[]` (HTTP 200, lista vazia) para chamador
-- anonimo ANTES desta migration. O unico caminho de ESCRITA que `anon`
-- tinha era o INSERT em `consent_records` (ramo `user_id IS NULL`), e ele
-- nunca foi usado: 67 linhas na tabela, ZERO com `user_id IS NULL`.
--
-- Feito em bloco data-driven para ser idempotente de verdade: se a policy
-- nao existir mais (renomeada no futuro), a migration avisa em vez de
-- estourar, e reaplicar nao muda nada.
-- ---------------------------------------------------------------------
DO $passo1$
DECLARE
  v_par   text[];
  v_feito integer := 0;
  v_ausente integer := 0;
  -- pares {tabela, policy}
  v_lista text[][] := ARRAY[
    -- consent_records (3): LGPD. O self-register grava via service_role
    -- (RLS nao se aplica), o CookieBanner e so localStorage e o aceite de
    -- termos passa pela RPC SECURITY DEFINER `accept_terms_of_service`,
    -- que `anon` ja nao podia executar.
    ARRAY['consent_records',        'Super admins can view all consent records'],
    ARRAY['consent_records',        'Users can insert own consent records'],
    ARRAY['consent_records',        'Users can view own consent records'],
    -- cost_resources / cost_resource_items (4): estrutura de custo (BDI).
    ARRAY['cost_resources',         'Company users can view cost_resources'],
    ARRAY['cost_resources',         'System managers can manage cost_resources'],
    ARRAY['cost_resource_items',    'Company users can view cost_resource_items'],
    ARRAY['cost_resource_items',    'System managers can manage cost_resource_items'],
    -- master_login_audit (1): auditoria de login do painel master.
    ARRAY['master_login_audit',     'Super admins can view master login audit'],
    -- service_cost_resources / service_gifts (2).
    ARRAY['service_cost_resources', 'System managers can manage service_cost_resources'],
    ARRAY['service_gifts',          'System managers can manage service_gifts'],
    -- subscription_history (2): historico de assinatura SaaS.
    ARRAY['subscription_history',   'super_admin inserts subscription_history'],
    ARRAY['subscription_history',   'super_admin reads subscription_history'],
    -- time_settings / time_sheets (3): ponto. O portal publico de ponto
    -- (edge `time-clock-portal`) roda com SERVICE_ROLE e nao depende de RLS.
    ARRAY['time_settings',          'Users can view time_settings'],
    ARRAY['time_sheets',            'Users can insert own time_sheets'],
    ARRAY['time_sheets',            'Users can update own time_sheets']
  ];
BEGIN
  FOREACH v_par SLICE 1 IN ARRAY v_lista LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename  = v_par[1]
         AND policyname = v_par[2]
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', v_par[2], v_par[1]);
      v_feito := v_feito + 1;
    ELSE
      v_ausente := v_ausente + 1;
      RAISE NOTICE 'PASSO 1: policy ausente, nada a fazer: %.%', v_par[1], v_par[2];
    END IF;
  END LOOP;

  RAISE NOTICE 'PASSO 1: % policies agora TO authenticated, % ausentes.', v_feito, v_ausente;

  IF v_feito = 0 THEN
    RAISE EXCEPTION 'PASSO 1: nenhuma das 15 policies foi encontrada. Schema divergente, abortando.';
  END IF;
END
$passo1$;

-- ---------------------------------------------------------------------
-- PASSO 2: view `cost_resources_with_rate`
--
-- `security_invoker = true` faz a view passar a respeitar a RLS de QUEM
-- pergunta. Isso muda o resultado para TODO mundo, nao so para `anon`, e
-- e exatamente o conserto certo. Os 3 (e unicos) consumidores foram
-- conferidos e todos ja filtram por empresa, logo nenhuma tela paga perde
-- linha legitima:
--   src/hooks/useCostResources.ts        filtra por `company_id`
--   src/components/quotes/QuoteFormDialog.tsx  filtra por `.in('id', <ids da propria empresa>)`
--   src/hooks/useServiceCostResources.ts foi corrigido nesta mesma onda
--                                        para filtrar por `company_id`
-- Nenhuma edge function le esta view.
-- ---------------------------------------------------------------------
ALTER VIEW IF EXISTS public.cost_resources_with_rate SET (security_invoker = true);

DO $passo2$
BEGIN
  IF to_regclass('public.cost_resources_with_rate') IS NOT NULL THEN
    REVOKE ALL ON public.cost_resources_with_rate FROM anon;
    RAISE NOTICE 'PASSO 2: security_invoker ligado e GRANT de anon revogado na view.';
  ELSE
    RAISE NOTICE 'PASSO 2: view cost_resources_with_rate nao existe, nada a fazer.';
  END IF;
END
$passo2$;

-- ---------------------------------------------------------------------
-- PASSO 3: revoga o EXECUTE de `anon` nas 4 funcoes-oraculo
--
-- Oraculo reproduzido em producao com a chave publica (2026-10-18), usando
-- `profiles.user_id` e NAO `profiles.id` (gotcha conhecido:
-- `get_user_company_id` le `profiles.user_id`, sondar com `profiles.id`
-- devolve NULL e faz concluir que nao vaza quando vaza):
--   get_user_company_id(<user_id real>) -> 200, company_id REAL
--   has_role(<admin real>, 'admin')     -> 200, true
--   can_manage_system(<admin real>)     -> 200, true
--   is_super_admin(<admin real>)        -> 200, false  (tambem e oraculo)
--
-- `REVOKE ... FROM PUBLIC` NAO remove grant explicito de role, e o Supabase
-- mantem ALTER DEFAULT PRIVILEGES concedendo EXECUTE a `anon` em toda funcao
-- nova de `public`. Por isso `anon` e revogado NOMINALMENTE.
--
-- As 4 sao SECURITY DEFINER com owner `postgres`. Consequencia que importa:
-- quando sao chamadas de DENTRO de outra funcao SECURITY DEFINER (por
-- exemplo o trigger `set_company_id_on_insert()`, que roda no INSERT
-- anonimo de chamado do portal em `service_orders`), o privilegio e
-- checado contra o OWNER e nao contra `anon`. Logo o revoke nao quebra
-- esses caminhos. Validado com INSERT real de chamado em transacao.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_user_company_id(uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_system(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid)            FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- GUARDA: a migration se recusa a commitar se o estado final estiver
-- errado. Nao aceitar "revisei o arquivo": a prova e esta.
-- (bloco mantido como veio do Dev Plataforma, de proposito)
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_pol   integer;
  v_fn    text;
  v_anon  boolean;
BEGIN
  -- (a) Nenhuma policy aplicavel a `anon` pode citar as 4 funcoes.
  SELECT count(*) INTO v_pol
    FROM pg_policies
   WHERE schemaname = 'public'
     AND ('public' = ANY(roles) OR 'anon' = ANY(roles) OR roles IS NULL)
     AND (coalesce(qual,'') || ' ' || coalesce(with_check,''))
         ~ '(get_user_company_id|has_role|can_manage_system|is_super_admin)';
  IF v_pol <> 0 THEN
    RAISE EXCEPTION
      'GUARDA: ainda existem % policies aplicaveis a anon citando as 4 funcoes-oraculo', v_pol;
  END IF;

  -- (b) `anon` nao pode mais executar as 4.
  FOR v_fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_user_company_id','has_role','can_manage_system','is_super_admin')
  LOOP
    EXECUTE format('SELECT has_function_privilege(%L, %L, %L)', 'anon', v_fn, 'EXECUTE')
       INTO v_anon;
    IF v_anon THEN
      RAISE EXCEPTION 'GUARDA: anon ainda tem EXECUTE em %', v_fn;
    END IF;
  END LOOP;

  -- (c) As 2 funcoes do portal publico PRECISAM manter o EXECUTE.
  IF NOT has_function_privilege('anon', 'public.is_valid_portal_ticket_context(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.is_customer_in_active_portal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GUARDA: revogaram por engano o EXECUTE das funcoes do portal publico';
  END IF;

  -- (d) A view nao pode mais ser legivel por `anon`, e tem de estar
  --     com security_invoker.
  IF has_table_privilege('anon', 'public.cost_resources_with_rate', 'SELECT') THEN
    RAISE EXCEPTION 'GUARDA: anon ainda le cost_resources_with_rate';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='cost_resources_with_rate'
       AND c.reloptions::text ILIKE '%security_invoker%'
  ) THEN
    RAISE EXCEPTION 'GUARDA: cost_resources_with_rate sem security_invoker';
  END IF;

  RAISE NOTICE 'GUARDA OK: 0 policies anon citando as 4; EXECUTE revogado; portal preservado; view fechada.';
END
$guard$;

COMMIT;
