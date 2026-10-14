-- ============================================================================
-- Programa de Afiliados — RLS de SELF-SCOPE do afiliado logado (Fase 2, parte 2)
-- ============================================================================
-- Port de 20260723170100_affiliates_self_scope_rls.sql do EcoSistema, na mesma
-- régua da 20260808120100_salesperson_self_scope_rls.sql daqui.
--
-- O afiliado é um usuário EXTERNO com login próprio. Ele NUNCA é admin do painel
-- (ver can_manage_affiliates() na 20261014160000): o acesso dele aos próprios
-- dados vem do VÍNCULO public.affiliates.user_id = auth.uid(), nunca de uma
-- linha em admin_permissions — que o tornaria "admin_user" no SQL e abriria
-- TODAS as policies amplas do painel master (companies, company_payments,
-- admin_financial_transactions, salespeople...) pra um parceiro externo.
--
-- Todas as policies abaixo são ADITIVAS (policies permissivas são OR entre si):
--   * NÃO removem nem afrouxam nenhuma policy de admin/tenant já existente.
--   * Só liberam linhas onde o vínculo bate com current_affiliate_id().
--   * current_affiliate_id() devolve NULL pra quem não é afiliado; como
--     "coluna = NULL" nunca é TRUE, não-afiliado não ganha NENHUMA linha extra.
--     É isso que torna seguro alargar `companies` e `company_payments` aqui.
--
-- SÓ SELECT. Nunca UPDATE/DELETE self-scope — é a última linha de defesa contra
-- um curl com o JWT do afiliado: editar afiliado, comissão, repasse, empresa ou
-- pagamento é operação de admin no painel master. Se o afiliado pudesse dar
-- UPDATE na própria linha, ele mudaria o próprio percentual de comissão.
--
-- VERIFICADO NO BANCO ANTES DE APLICAR (não assumido):
--   pg_class.relrowsecurity = true em public.companies (e relforcerowsecurity
--   também true) e em public.company_payments. Nenhuma tabela ganha RLS nesta
--   migration — as 3 de afiliado já saíram com RLS ON na 20261014160000.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Helper: current_affiliate_id()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER pra poder ler public.affiliates de dentro da avaliação de RLS
-- de OUTRAS tabelas sem recursão de policy (rodando como owner, a leitura de
-- affiliates ignora a RLS da própria affiliates).
-- STABLE para o planner avaliar uma vez por statement (InitPlan) em vez de uma
-- vez por linha — mesma régua da 20260826161618_rls_wrap_auth_initplan.sql.
CREATE OR REPLACE FUNCTION public.current_affiliate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.affiliates WHERE user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_affiliate_id() IS
  'Resolve o affiliate_id do usuário logado via affiliates.user_id. NULL quando o usuário não é afiliado — e "coluna = NULL" nunca é TRUE, o que mantém as policies de self-scope inofensivas pra todos os outros usuários.';

REVOKE ALL ON FUNCTION public.current_affiliate_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_affiliate_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. affiliates — o afiliado lê SÓ a própria ficha
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Affiliate reads own row" ON public.affiliates;
CREATE POLICY "Affiliate reads own row" ON public.affiliates
  FOR SELECT TO authenticated
  USING (id = public.current_affiliate_id());

-- ---------------------------------------------------------------------------
-- 3. affiliate_commissions — extrato próprio
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Affiliate reads own commissions" ON public.affiliate_commissions;
CREATE POLICY "Affiliate reads own commissions" ON public.affiliate_commissions
  FOR SELECT TO authenticated
  USING (affiliate_id = public.current_affiliate_id());

-- ---------------------------------------------------------------------------
-- 4. affiliate_payments — repasses próprios
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Affiliate reads own payments" ON public.affiliate_payments;
CREATE POLICY "Affiliate reads own payments" ON public.affiliate_payments
  FOR SELECT TO authenticated
  USING (affiliate_id = public.current_affiliate_id());

-- ---------------------------------------------------------------------------
-- 5. companies — carteira de clientes do afiliado
-- ---------------------------------------------------------------------------
-- Só as empresas que ELE indicou (companies.affiliate_id). Empresa sem afiliado
-- ou de outro afiliado continua invisível.
DROP POLICY IF EXISTS "Affiliate reads own portfolio companies" ON public.companies;
CREATE POLICY "Affiliate reads own portfolio companies" ON public.companies
  FOR SELECT TO authenticated
  USING (affiliate_id = public.current_affiliate_id());

-- ---------------------------------------------------------------------------
-- 6. company_payments — pagamentos das empresas da própria carteira
-- ---------------------------------------------------------------------------
-- É o que permite ao afiliado auditar a base de cálculo da comissão dele.
-- Sem filtro por `voided`: company_payments do Dominex NÃO tem essa coluna
-- (estorno aqui é DELETE, via delete_company_payment_with_rollback) — divergência
-- em relação ao Eco, onde a policy espelho conviveria com a flag.
DROP POLICY IF EXISTS "Affiliate reads own portfolio payments" ON public.company_payments;
CREATE POLICY "Affiliate reads own portfolio payments" ON public.company_payments
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE affiliate_id = public.current_affiliate_id()
    )
  );

COMMIT;

-- ============================================================================
-- ROLLBACK (comentado — puramente aditiva, reverter não afeta mais ninguém):
-- BEGIN;
-- DROP POLICY IF EXISTS "Affiliate reads own portfolio payments" ON public.company_payments;
-- DROP POLICY IF EXISTS "Affiliate reads own portfolio companies" ON public.companies;
-- DROP POLICY IF EXISTS "Affiliate reads own payments" ON public.affiliate_payments;
-- DROP POLICY IF EXISTS "Affiliate reads own commissions" ON public.affiliate_commissions;
-- DROP POLICY IF EXISTS "Affiliate reads own row" ON public.affiliates;
-- DROP FUNCTION IF EXISTS public.current_affiliate_id();
-- COMMIT;
-- ============================================================================
