-- ============================================================================
-- Excluir lançamento financeiro passa a exigir permissão de gestor
-- ============================================================================
--
-- O DEFEITO (provado em produção, não deduzido):
--   `public.financial_transactions` tinha DUAS políticas permissivas:
--     1. "Users manage own company financial_transactions"     → FOR ALL
--     2. "Managers can delete own company financial_transactions" → FOR DELETE
--
--   Políticas RLS permissivas se somam por OR. Como a FOR ALL já liberava
--   qualquer usuário autenticado do tenant para TODOS os comandos (incluindo
--   DELETE), a política de gestor nunca era decisiva — era letra morta.
--
--   Prova empírica antes desta migration, em bloco revertido: o usuário
--   "Fulano" (28d39f3d-788f-4fd1-bfa8-d2c89e26520b), do tenant demo, que NÃO é
--   admin/gestor, não tem curinga '*' e não tem nenhuma permissão de
--   financeiro, apagou 1 linha de financial_transactions. 34 usuários podiam
--   apagar qualquer lançamento financeiro; só 5 conseguem abrir a tela de
--   Financeiro.
--
-- POR QUE NÃO BASTA "ADICIONAR UMA POLÍTICA DE DELETE":
--   Enquanto existir UMA política FOR ALL, ela continua liberando DELETE por
--   OR. A única correção real é dissolver a FOR ALL em políticas por comando.
--
-- O QUE MUDA E O QUE NÃO MUDA:
--   SELECT / INSERT / UPDATE  → predicado IDÊNTICO ao de hoje. Ninguém que
--                               trabalha hoje perde acesso.
--   DELETE                    → mesmo predicado de tenant E can_delete_finance.
--
-- InitPlan: toda chamada de função de auth vai embrulhada em (SELECT ...), pra
-- ser avaliada uma vez por query em vez de uma vez por linha (medimos
-- 800ms → 17ms num caso deste repo). As políticas atuais já estavam
-- embrulhadas; isso NÃO pode regredir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Predicado de permissão, espelhando public.can_edit_os
-- ----------------------------------------------------------------------------
-- Mesma forma das demais funções de permissão do repo (can_edit_os,
-- can_manage_system): role admin/gestor OU acesso total OU permissão fina.
-- O curinga '*' e o has_full_permissions são obrigatórios — é assim que o repo
-- trata acesso total dinâmico.
CREATE OR REPLACE FUNCTION public.can_delete_finance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND is_active = true
        AND (
          permissions ? '*'                                -- curinga aditivo: acesso total dinâmico
          OR permissions @> '"fn:delete_finance"'::jsonb   -- permissão fina da feature
        )
    )
  )
$function$;

COMMENT ON FUNCTION public.can_delete_finance(uuid) IS
  'Quem pode EXCLUIR lançamento financeiro: admin/gestor, acesso total (has_full_permissions ou curinga "*") ou a permissão fina fn:delete_finance. Usada na política RLS de DELETE de financial_transactions.';

GRANT EXECUTE ON FUNCTION public.can_delete_finance(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Reestruturar as políticas de financial_transactions
-- ----------------------------------------------------------------------------
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- letra morta: nunca foi decisiva, porque a FOR ALL já liberava DELETE
DROP POLICY IF EXISTS "Managers can delete own company financial_transactions" ON public.financial_transactions;

-- a FOR ALL: é ela que liberava DELETE pra todo mundo do tenant
DROP POLICY IF EXISTS "Users manage own company financial_transactions" ON public.financial_transactions;

-- idempotência: se esta migration rodar 2x, as 4 abaixo já existem
DROP POLICY IF EXISTS "Users can view own company financial_transactions"   ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert own company financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update own company financial_transactions" ON public.financial_transactions;

CREATE POLICY "Users can view own company financial_transactions"
  ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Users can insert own company financial_transactions"
  ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Users can update own company financial_transactions"
  ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

-- A ÚNICA que muda de comportamento: além do gate de tenant, exige permissão.
CREATE POLICY "Managers can delete own company financial_transactions"
  ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      OR (SELECT public.is_super_admin(auth.uid()))
    )
    AND (SELECT public.can_delete_finance(auth.uid()))
  );
