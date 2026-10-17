-- =============================================================================
-- employee_contracts — 3a policy: espelho fiel de employees
-- Complemento de 20261017190000_employees_regime_pj_e_contratos.sql
-- (aquela JÁ ESTÁ APLICADA em prod e registrada no histórico; não se edita.)
-- =============================================================================
-- POR QUE: public.employees tem em produção TRÊS policies, e a 3a é mais frouxa
-- que as outras duas (qualquer autenticado do próprio tenant escreve, e
-- super_admin escreve em qualquer tenant). A migration anterior espelhou só as
-- duas primeiras, deixando o CONTRATO do PJ mais restrito que o SALÁRIO do
-- funcionário — o que não compra segurança nenhuma (o isolamento entre
-- empresas, a regra-lei, já está garantido pelo company_id nas duas tabelas) e
-- cria falha silenciosa de INSERT para usuário com a tela de Funcionários
-- liberada mas sem can_manage_system.
-- Decisão do Tech Lead (2026-10-17): consistência com employees vence.
--
-- PARIDADE EXATA, não melhoria: qual e with_check foram COPIADOS do pg_policies
-- vivo de public.employees / "Users manage own company employees" — mesmo
-- FOR ALL TO authenticated, mesmo OR is_super_admin(...), mesma convenção de
-- InitPlan ((SELECT fn(...))). with_check no vivo NÃO é NULL: é a mesma
-- expressão do USING, e é assim que vai aqui.
--
-- anon continua com ZERO policies e ZERO privilégios (REVOKE do passo 7 da
-- migration anterior segue valendo; nada de GRANT aqui).
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS antes do CREATE. Rodar 2x não quebra.
-- =============================================================================

DROP POLICY IF EXISTS "Users manage own company employee contracts" ON public.employee_contracts;
CREATE POLICY "Users manage own company employee contracts"
  ON public.employee_contracts
  FOR ALL
  TO authenticated
  USING (
    (company_id = (SELECT get_user_company_id(auth.uid())))
    OR (SELECT is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (company_id = (SELECT get_user_company_id(auth.uid())))
    OR (SELECT is_super_admin(auth.uid()))
  );
