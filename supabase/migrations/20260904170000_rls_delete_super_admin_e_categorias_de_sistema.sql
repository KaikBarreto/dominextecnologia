-- ============================================================================
-- Dois ajustes de RLS de DELETE
--   (1) devolver a exclusão de lançamento financeiro ao super admin
--   (2) financial_categories: restaurar a intenção de "Cannot delete system
--       categories", hoje sombreada por uma política FOR ALL
-- ============================================================================
--
-- CONTEXTO GERAL: política RLS permissiva se soma por OR. Enquanto existir uma
-- FOR ALL, qualquer política restritiva do MESMO comando vira letra morta —
-- foi o que matou a política de gestor em financial_transactions
-- (20260904150000) e é o mesmo acidente aqui em financial_categories.
--
-- ============================================================================
-- (1) financial_transactions: o AND comeu o super admin
-- ============================================================================
--
-- A 20260904150000 fechou o DELETE com
--     (tenant OR super_admin) AND can_delete_finance
-- e isso teve um efeito colateral não intencional: o super admin da plataforma
-- ("Dominex Admin") passa no OR, mas reprova no can_delete_finance (não tem
-- user_roles admin/gestor nem linha ativa em user_permissions) — resultado: ele
-- LÊ, INSERE e ATUALIZA lançamento de qualquer tenant (as políticas de
-- SELECT/INSERT/UPDATE mantêm `OR is_super_admin`) mas não consegue EXCLUIR.
-- Incoerente entre si, e regressão em relação ao que existia antes desta série.
--
-- Provado em bloco revertido antes desta migration: super admin
-- a9edbca3-91f6-408b-9b69-ca53cba52133 apagou 0 linhas.
--
-- A forma certa é o gate de permissão valer DENTRO do tenant, com o super admin
-- como caminho paralelo (que é exatamente a forma dos outros três comandos):
--     (tenant AND can_delete_finance) OR super_admin
--
-- O que NÃO muda: usuário comum do tenant sem permissão continua barrado —
-- é a razão de existir da 20260904150000.
--
-- InitPlan preservado: toda função de auth embrulhada em (SELECT ...).

DROP POLICY IF EXISTS "Managers can delete own company financial_transactions" ON public.financial_transactions;

CREATE POLICY "Managers can delete own company financial_transactions"
  ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_delete_finance(auth.uid()))
    )
    OR (SELECT public.is_super_admin(auth.uid()))
  );

-- ============================================================================
-- (2) financial_categories: categoria de SISTEMA voltou a ser indestrutível
-- ============================================================================
--
-- O ACIDENTE: existia uma política de DELETE chamada literalmente
-- "Cannot delete system categories", com `is_system = false` no predicado — o
-- nome diz a intenção. Só que ela convivia com a FOR ALL
-- "Managers can manage own company categories" (só tenant + can_manage_system),
-- que liberava DELETE por OR. Ou seja: a proteção nunca valeu.
--
-- Provado em bloco revertido antes desta migration: o gestor
-- a1c76c01-01b4-4821-b146-19072e2eff04 apagou 1 categoria com is_system = true.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE: 'Pagamento de Fatura' e
-- 'Transferência entre contas' são categorias de sistema e a DRE, o fluxo de
-- caixa e o pagamento de fatura de cartão casam por NOME (financial_categories
-- não tem NENHUMA FK apontando pra ela — conferido em pg_constraint). Apagar e
-- recriar com outro texto não estoura erro nenhum: quebra em silêncio.
--
-- O QUE MUDA: só o DELETE de categoria com is_system = true.
-- SELECT / INSERT / UPDATE recebem EXATAMENTE o predicado que já valia hoje
-- (o da FOR ALL, e no SELECT o da política dedicada, que é mais larga e é a que
-- vale hoje pela soma por OR). Ninguém perde nada além da capacidade acidental
-- de apagar categoria de sistema.
--
-- Nota: financial_categories NÃO tem cláusula de super admin em nenhuma
-- política hoje. Preservado como está — não é hora de inventar acesso novo.

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

-- a FOR ALL: é ela que sombreava a proteção
DROP POLICY IF EXISTS "Managers can manage own company categories" ON public.financial_categories;

-- idempotência
DROP POLICY IF EXISTS "Users can view own company categories"   ON public.financial_categories;
DROP POLICY IF EXISTS "Managers can insert own company categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Managers can update own company categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Cannot delete system categories"         ON public.financial_categories;

-- SELECT: predicado da política dedicada que já existia (só tenant). É o que
-- vale hoje na prática, porque era o ramo mais largo da soma por OR.
CREATE POLICY "Users can view own company categories"
  ON public.financial_categories
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
  );

-- INSERT / UPDATE: predicado da FOR ALL, sem tirar nem pôr.
CREATE POLICY "Managers can insert own company categories"
  ON public.financial_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  );

CREATE POLICY "Managers can update own company categories"
  ON public.financial_categories
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  );

-- DELETE: mesmo predicado, mais o is_system = false que dá nome à política.
-- Agora sem FOR ALL por perto, ele finalmente decide alguma coisa.
-- is_system é NOT NULL DEFAULT false, então não há armadilha de NULL aqui.
CREATE POLICY "Cannot delete system categories"
  ON public.financial_categories
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND is_system = false
    AND (SELECT public.can_manage_system(auth.uid()))
  );
