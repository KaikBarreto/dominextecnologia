-- ============================================================================
-- Programa de Afiliados — ADENDOS: gate do super_admin + InitPlan na RLS
-- ============================================================================
-- Duas correções sobre a fundação (20261014160000 e 20261014160200). As duas
-- migrations originais JÁ constam em supabase_migrations.schema_migrations, então
-- NÃO podem ser editadas — o CLI as consideraria aplicadas e pularia a mudança
-- pra sempre. Toda correção vem em migration nova. É esta.
--
-- ============================================================================
-- ADENDO 1 — can_manage_affiliates() trancava o super_admin do lado de fora
-- ============================================================================
-- Definição que estava no ar (extraída de pg_get_functiondef em 2026-10-14):
--     SELECT public.is_admin_user(auth.uid())
--        AND NOT EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = auth.uid());
--
-- O `AND NOT EXISTS` existe por um motivo BOM e que continua valendo: como
-- is_admin_user() devolve true pra QUALQUER usuário com uma linha em
-- admin_permissions, sem essa cláusula bastaria alguém gravar admin_permissions
-- pro afiliado (pra liberar a tela dele) e esse parceiro EXTERNO passaria a ler
-- a lista inteira de afiliados e as comissões dos concorrentes.
--
-- O problema: a cláusula é absoluta e pega o super_admin também. Se o CEO (ou
-- qualquer super_admin) for cadastrado como afiliado — teste do programa, sócio
-- que também indica, parceiro promovido a admin —, ele perde TODO o acesso de
-- gestão do programa: não lê a lista, não cadastra afiliado, não paga repasse.
-- E o conserto não é óbvio: a tela simplesmente vem vazia, sem erro.
--
-- Correção: super_admin passa SEMPRE; o resto continua sujeito ao NOT EXISTS.
-- Isso NÃO afrouxa nada: o super_admin já tem acesso irrestrito a todo o painel
-- master (companies, company_payments, admin_financial_transactions,
-- salespeople...) por outras policies. Excluí-lo aqui não protegia nada — só
-- criava um lockout silencioso. A defesa real (impedir que um afiliado com
-- admin_permissions leia os dados dos outros) fica intacta, porque um afiliado
-- externo não é super_admin.
--
-- ============================================================================
-- ADENDO 2 — InitPlan nas 5 policies de self-scope do afiliado
-- ============================================================================
-- As 5 policies criadas na 20261014160200 chamam public.current_affiliate_id()
-- "pelado" (confirmado em pg_policies.qual em 2026-10-14):
--     affiliates            : (id = current_affiliate_id())
--     affiliate_commissions : (affiliate_id = current_affiliate_id())
--     affiliate_payments    : (affiliate_id = current_affiliate_id())
--     companies             : (affiliate_id = current_affiliate_id())
--     company_payments      : (company_id IN (SELECT companies.id FROM companies
--                                             WHERE companies.affiliate_id = current_affiliate_id()))
--
-- A função é STABLE, então o planner PODE hoistar — mas a régua do projeto
-- (20260826161618_rls_wrap_auth_initplan.sql) é envolver em `(SELECT ...)` pra
-- FORÇAR um InitPlan: uma avaliação por statement, garantida, em vez de uma por
-- linha. Em tabela grande a diferença é de ordem de magnitude.
--
-- CURTO-CIRCUITO (só em company_payments): esta policy é ADITIVA (policies
-- permissivas são OR entre si) numa tabela que TODO admin e TODO caminho de
-- cobrança consulta. Pro usuário que não é afiliado — ou seja, praticamente
-- todos —, current_affiliate_id() é NULL e o `IN (subquery)` ainda assim entra
-- no plano e varre companies pra no fim não devolver nada. Com
-- `(SELECT current_affiliate_id()) IS NOT NULL AND ...` na frente, o planner
-- descarta o ramo inteiro de imediato no caso comum.
--
-- Por que o curto-circuito NÃO vai nas outras 4: lá o predicado é uma igualdade
-- simples de coluna (`affiliate_id = NULL` -> NULL), que o planner já resolve
-- a custo trivial. Adicionar `IS NOT NULL` ali seria redundante e só poluiria.
--
-- SEMÂNTICA PRESERVADA (o que NÃO muda):
--   * continuam todas SELECT-only — nunca UPDATE/DELETE self-scope, senão o
--     afiliado editaria o próprio percentual de comissão via curl com o JWT dele;
--   * continuam ADITIVAS: nenhuma policy de admin ou de tenant é tocada;
--   * `coluna = NULL` nunca é TRUE, então quem não é afiliado continua sem
--     ganhar nenhuma linha extra. O `IS NOT NULL` só torna isso explícito e
--     barato — não muda o conjunto de linhas visível pra ninguém.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ADENDO 1: can_manage_affiliates() não tranca mais o super_admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_affiliates()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $cma$
  SELECT
    -- super_admin SEMPRE gerencia: já tem acesso irrestrito ao painel master por
    -- outras policies, então excluí-lo aqui só criava lockout silencioso quando
    -- ele também é cadastrado como afiliado.
    public.is_super_admin(auth.uid())
    OR (
      -- Admin "comum" (tem linha em admin_permissions): só gerencia se NÃO for
      -- ele mesmo um afiliado. É isso que impede um parceiro EXTERNO com
      -- admin_permissions de ler a lista de afiliados e a comissão dos outros.
      public.is_admin_user(auth.uid())
      AND NOT EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = auth.uid())
    );
$cma$;

COMMENT ON FUNCTION public.can_manage_affiliates() IS
  'Gate de GESTÃO do programa de afiliados. super_admin passa sempre (já tem acesso irrestrito ao painel master; excluí-lo só causava lockout quando ele também era afiliado). Admin comum (via admin_permissions) só passa se NÃO for ele mesmo um afiliado — é o que mantém a lista de afiliados e as comissões dos concorrentes fechadas pra um parceiro externo que ganhe admin_permissions. O acesso do afiliado aos PRÓPRIOS dados vem de current_affiliate_id(), não daqui.';

REVOKE ALL ON FUNCTION public.can_manage_affiliates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_affiliates() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ADENDO 2: InitPlan nas 5 policies de self-scope
-- ---------------------------------------------------------------------------

-- 1. affiliates — própria ficha
DROP POLICY IF EXISTS "Affiliate reads own row" ON public.affiliates;
CREATE POLICY "Affiliate reads own row" ON public.affiliates
  FOR SELECT TO authenticated
  USING (id = (SELECT public.current_affiliate_id()));

-- 2. affiliate_commissions — extrato próprio
DROP POLICY IF EXISTS "Affiliate reads own commissions" ON public.affiliate_commissions;
CREATE POLICY "Affiliate reads own commissions" ON public.affiliate_commissions
  FOR SELECT TO authenticated
  USING (affiliate_id = (SELECT public.current_affiliate_id()));

-- 3. affiliate_payments — repasses próprios
DROP POLICY IF EXISTS "Affiliate reads own payments" ON public.affiliate_payments;
CREATE POLICY "Affiliate reads own payments" ON public.affiliate_payments
  FOR SELECT TO authenticated
  USING (affiliate_id = (SELECT public.current_affiliate_id()));

-- 4. companies — carteira de clientes do afiliado
DROP POLICY IF EXISTS "Affiliate reads own portfolio companies" ON public.companies;
CREATE POLICY "Affiliate reads own portfolio companies" ON public.companies
  FOR SELECT TO authenticated
  USING (affiliate_id = (SELECT public.current_affiliate_id()));

-- 5. company_payments — pagamentos da carteira (com curto-circuito)
DROP POLICY IF EXISTS "Affiliate reads own portfolio payments" ON public.company_payments;
CREATE POLICY "Affiliate reads own portfolio payments" ON public.company_payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_affiliate_id()) IS NOT NULL
    AND company_id IN (
      SELECT id FROM public.companies
      WHERE affiliate_id = (SELECT public.current_affiliate_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Validação pós-DDL
-- ---------------------------------------------------------------------------
DO $validate$
DECLARE
  v_bad  text := '';
  v_n    int;
  r      record;
BEGIN
  -- As 5 policies existem e TODAS passaram a usar a forma (SELECT ...)?
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE 'Affiliate reads own%';
  IF v_n <> 5 THEN
    v_bad := v_bad || format(' (esperava 5 policies de self-scope, achei %s)', v_n);
  END IF;

  FOR r IN
    SELECT tablename, policyname, qual, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'Affiliate reads own%'
  LOOP
    -- InitPlan: a chamada tem que estar dentro de um subselect.
    IF r.qual NOT LIKE '%( SELECT current_affiliate_id() AS current_affiliate_id)%' THEN
      v_bad := v_bad || format(' (%s.%s sem InitPlan: %s)', r.tablename, r.policyname, r.qual);
    END IF;
    -- SELECT-only: nenhuma self-scope pode virar write.
    IF r.cmd <> 'SELECT' THEN
      v_bad := v_bad || format(' (%s.%s virou %s, deveria ser SELECT)', r.tablename, r.policyname, r.cmd);
    END IF;
  END LOOP;

  -- Curto-circuito presente em company_payments?
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_payments'
      AND policyname = 'Affiliate reads own portfolio payments'
      AND qual LIKE '%IS NOT NULL%'
  ) THEN
    v_bad := v_bad || ' (company_payments sem curto-circuito IS NOT NULL)';
  END IF;

  -- Adendo 1 no ar?
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_manage_affiliates'
      AND pg_get_functiondef(p.oid) LIKE '%is_super_admin%'
  ) THEN
    v_bad := v_bad || ' (can_manage_affiliates sem a isenção de super_admin)';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Adendos do programa de afiliados com problema:%', v_bad;
  END IF;

  RAISE NOTICE 'Adendos OK: super_admin isento em can_manage_affiliates + 5 policies de self-scope com InitPlan (company_payments com curto-circuito).';
END $validate$;

COMMIT;

-- ============================================================================
-- ROLLBACK (comentado — volta ao estado da 20261014160000 + 20261014160200):
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.can_manage_affiliates()
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $r$
--   SELECT public.is_admin_user(auth.uid())
--      AND NOT EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = auth.uid());
-- $r$;
-- DROP POLICY IF EXISTS "Affiliate reads own row" ON public.affiliates;
-- CREATE POLICY "Affiliate reads own row" ON public.affiliates
--   FOR SELECT TO authenticated USING (id = public.current_affiliate_id());
-- -- (idem para as outras 4, voltando à chamada sem (SELECT ...))
-- COMMIT;
-- ============================================================================
