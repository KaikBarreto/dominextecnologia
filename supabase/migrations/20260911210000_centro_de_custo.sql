-- ============================================================================
-- Centro de custo — cadastro por empresa + vínculo em lançamento financeiro
-- ============================================================================
--
-- POR QUÊ:
--   Hoje o Dominex não tem centro de custo (nenhuma tabela, nenhuma coluna,
--   nenhuma tela). O usuário precisa marcar "a qual centro este lançamento
--   pertence" pra depois filtrar o Financeiro e quebrar o DRE por centro.
--
-- ESTA MIGRATION É PURAMENTE ADITIVA:
--   - cria uma tabela nova;
--   - adiciona UMA coluna nullable em financial_transactions;
--   - NÃO altera nenhuma policy existente de financial_transactions;
--   - NÃO muda nenhuma linha de dado existente.
--
-- Regra de acesso definida pelo dev-plataforma-multitenant; aqui é só o SQL.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Tabela public.cost_centers
-- ----------------------------------------------------------------------------
-- Notas de projeto (não remover — são decisões, não estilo):
--
-- * ON DELETE CASCADE em company_id é OBRIGATÓRIO. A RPC admin_delete_company
--   (viva em produção) termina em `DELETE FROM public.companies WHERE id = ...`
--   e NÃO tem um `DELETE FROM public.cost_centers` explícito. Sem o CASCADE, a
--   exclusão de tenant quebraria por violação de FK.
--
-- * O índice único cobre linhas ativas E inativas de propósito (não é um
--   índice parcial `WHERE is_active`). Dois centros homônimos — um ativo e um
--   arquivado — destroem a leitura histórica do DRE: o relatório mostraria duas
--   fatias com o mesmo rótulo. A UI resolve o conflito oferecendo REATIVAR o
--   centro existente em vez de criar um segundo com o mesmo nome.
--   `lower(name)` porque "Frota" e "frota" são o mesmo centro pro usuário.
--
-- * color é NOT NULL DEFAULT pra que `null` não entre por payload explícito
--   (DEFAULT sozinho não protege: um INSERT com "color": null grava null).
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6B7280',
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cost_centers IS
  'Centros de custo por empresa. Anexados a lançamentos financeiros para filtro e quebra do DRE.';

CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_company_name_uidx
  ON public.cost_centers (company_id, lower(name));

CREATE INDEX IF NOT EXISTS cost_centers_company_active_idx
  ON public.cost_centers (company_id, is_active);

-- updated_at: reusa a função compartilhada do projeto (a mesma de
-- financial_categories, companies, quotes...). NÃO criar outra.
DROP TRIGGER IF EXISTS update_cost_centers_updated_at ON public.cost_centers;
CREATE TRIGGER update_cost_centers_updated_at
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 2) Vínculo em public.financial_transactions
-- ----------------------------------------------------------------------------
-- Aditiva e nullable: toda linha existente fica com cost_center_id = NULL.
-- ON DELETE SET NULL: excluir um centro nunca pode apagar lançamento.
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS cost_center_id uuid
  REFERENCES public.cost_centers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_transactions.cost_center_id IS
  'Centro de custo do lançamento (opcional). ON DELETE SET NULL: excluir o centro não apaga o lançamento.';

-- O índice NÃO é opcional. Duas razões:
--   a) o ON DELETE SET NULL varre financial_transactions pela FK a cada
--      exclusão de centro — sem índice vira seq scan;
--   b) o gatilho do bloco 4 conta linhas por cost_center_id a cada DELETE.
CREATE INDEX IF NOT EXISTS financial_transactions_cost_center_idx
  ON public.financial_transactions (cost_center_id);


-- ----------------------------------------------------------------------------
-- 3) RLS — QUATRO policies, uma por comando. PROIBIDO `FOR ALL` nesta tabela.
-- ----------------------------------------------------------------------------
-- Políticas permissivas do Postgres se SOMAM por OR. Uma única `FOR ALL`
-- sombreia qualquer restrição por comando, tornando-a letra morta — foi
-- exatamente o incidente de 04/09 em financial_transactions (prova em bloco
-- revertido: um usuário sem nenhuma permissão de financeiro apagou lançamento,
-- porque a "FOR ALL" liberava DELETE por OR). Ver
-- 20260904150000_rls_delete_finance_somente_gestor.sql.
--
-- InitPlan: toda chamada de função de auth vai embrulhada em (SELECT ...), pra
-- ser avaliada uma vez por query em vez de uma vez por linha.
--
-- SEM cláusula de super_admin em nenhuma das quatro: o painel master não lê
-- finanças de tenant — mesma convenção de financial_categories,
-- financial_accounts e credit_card_bills.
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company cost centers" ON public.cost_centers;
CREATE POLICY "Users can view own company cost centers"
  ON public.cost_centers FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Managers can insert own company cost centers" ON public.cost_centers;
CREATE POLICY "Managers can insert own company cost centers"
  ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  );

-- O WITH CHECK do UPDATE existe pra impedir `SET company_id = '<outro tenant>'`
-- (o USING só valida a linha ANTES da mudança). Não remover.
DROP POLICY IF EXISTS "Managers can update own company cost centers" ON public.cost_centers;
CREATE POLICY "Managers can update own company cost centers"
  ON public.cost_centers FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  );

DROP POLICY IF EXISTS "Managers can delete own company cost centers" ON public.cost_centers;
CREATE POLICY "Managers can delete own company cost centers"
  ON public.cost_centers FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  );


-- ----------------------------------------------------------------------------
-- 3-bis) Fechar `anon` no nível de GRANT
-- ----------------------------------------------------------------------------
-- O pg_default_acl do schema `public` neste projeto concede `arwdDxtm` pra anon
-- em TODA tabela nova (conferido em produção nesta migration). Não é explorável
-- aqui — as quatro policies acima são TO authenticated, e RLS nega o que não
-- tem policy —, mas isso deixaria a segurança apoiada numa camada só.
REVOKE ALL ON public.cost_centers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;


-- ----------------------------------------------------------------------------
-- 4) Gatilho BEFORE DELETE — integridade, NÃO segurança
-- ----------------------------------------------------------------------------
-- Centro de custo em uso por lançamento não pode ser excluído.
--
-- POR QUE ISSO NÃO VIRA UMA CLÁUSULA NA POLICY DE DELETE:
--   RLS negando DELETE no PostgREST devolve 204 com ZERO linhas afetadas e
--   NENHUM erro. O usuário vê "excluído com sucesso" e o centro continua lá.
--   Gatilho dispara sempre (inclusive em CASCADE) e devolve mensagem legível.
--
-- ERRCODE 23001 (restrict_violation): classe 23 vira HTTP 409 no PostgREST e
-- não colide com 23505 (unique) nem 23503 (FK), então o front distingue
-- "nome duplicado" de "centro em uso".
--
-- SECURITY DEFINER de propósito: se a contagem rodasse sob RLS do chamador,
-- uma lacuna de visibilidade faria o guarda contar 0 e liberar a exclusão.
-- Não filtra por company_id: a FK já garante o escopo.
CREATE OR REPLACE FUNCTION public.prevent_delete_cost_center_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.financial_transactions
   WHERE cost_center_id = OLD.id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Este centro de custo está em uso por % lançamento% e não pode ser excluído. Desative-o para parar de usá-lo em novos lançamentos.',
      v_count,
      CASE WHEN v_count = 1 THEN '' ELSE 's' END
      USING ERRCODE = '23001';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_delete_cost_center_in_use ON public.cost_centers;
CREATE TRIGGER prevent_delete_cost_center_in_use
  BEFORE DELETE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_cost_center_in_use();
